# SPEC-01: Loop Log Readability

## CONTEXT

### Problem Statement

`loop.sh` runs the Claude CLI in a headless loop using `--output-format=stream-json`, piping raw output to timestamped log files in `./logs/`. The resulting logs are **walls of single-line JSON** that are nearly impossible for humans to read.

### Observed Issues (from `archive/0004-openai-default/logs/`)

1. **Each JSON line is thousands of characters** -- no line breaks within entries
2. **Thinking blocks contain huge base64 signatures** mixed with reasoning text
3. **Tool results embed full file contents** as double-escaped JSON strings
4. **Usage/metadata duplicated on every message** -- noise overwhelms signal
5. **No visual separation** between iterations, tool calls, or phases
6. **UUIDs and session IDs** are noise for debugging (e.g. `session_id`, `uuid`, `parent_tool_use_id`)
7. **Subagent events** are just `task_started` markers with no inline output
8. **No summary** -- you must read the entire log to understand what happened
9. **`loop.sh` adds minimal formatting** -- just `======================== LOOP N ========================`

### Stream-JSON Event Types (observed)

| Event | Description |
|-------|-------------|
| `{"type":"system","subtype":"init",...}` | Session start: model, tools, session_id, permission mode |
| `{"type":"assistant","message":{"content":[{"type":"thinking",...}]}}` | Assistant thinking with `thinking` text and base64 `signature` |
| `{"type":"assistant","message":{"content":[{"type":"text",...}]}}` | Assistant text response |
| `{"type":"assistant","message":{"content":[{"type":"tool_use",...}]}}` | Tool invocation with `name` and `input` |
| `{"type":"user","message":{"content":[{"type":"tool_result",...}]}}` | Tool result with content string |
| `{"type":"system","subtype":"task_started",...}` | Subagent task started |
| `{"type":"rate_limit_event",...}` | Rate limit status |
| `{"type":"result","subtype":"success",...}` | Session complete: duration, turns, cost, model usage breakdown |

### Current `loop.sh` Behavior (pre-markdown)

- Pipes `claude -p --output-format=stream-json` through `tee "$LOG_FILE" | format-log.sh`
- Raw JSON saved to `.log` files; plain-text `[PREFIX]` formatted output to terminal
- After each iteration: `git push`, iteration summary box
- `format-log.sh` outputs `[INIT]`, `[THINK]`, `[TOOL]`, etc. prefixed lines

### RELEVANT FILES
- `loop.sh` -- loop runner
- `format-log.sh` -- stream-json to readable output filter
- `review-log.sh` -- standalone log reviewer
- `archive/0004-openai-default/logs/*.log` -- example raw JSON logs

---

## OVERVIEW

Transform the log output from plain-text `[PREFIX]` lines to **markdown format** (`.md` files) that render natively in VS Code, GitHub, and any markdown viewer:

1. **`format-log.sh`** -- Rewrite to output markdown (headers, code blocks, blockquotes, tables) instead of `[PREFIX]` lines
2. **`loop.sh`** -- Reverse the pipeline so **formatted markdown is saved** to `.md` files (not raw JSON); raw JSON goes to terminal only when `FORMAT_LOGS=0`
3. **`review-log.sh`** -- Support both `.md` (direct cat) and `.log` (pipe through `format-log.sh`) for backward compatibility with archived raw JSON

---

## USER STORIES

### US-01: Markdown Output Filter (`format-log.sh`)

**As a** developer reviewing Claude loop output
**I want** the formatter to produce markdown instead of plain-text prefixed lines
**So that** logs render as rich documents in VS Code preview, GitHub, and other markdown viewers

#### Formatting Rules

Each stream-json line is parsed and formatted according to its `type` and `subtype`/`content[].type`:

| Event | Current Output | New Markdown Output |
|-------|---------------|---------------------|
| `system/init` | `[INIT] model=... mode=... tools=19` | `## Session: <timestamp>` + `**Model:** ... \| **Mode:** ... \| **Tools:** N` + `---` |
| `assistant/thinking` | `[THINK] first 200 chars...` | `### Thinking` + `> first 200 chars` (blockquote) |
| `assistant/text` | `[ASSISTANT] text content` | `### Assistant` + bare text content |
| `assistant/tool_use` | `[TOOL] Read(file_path="...")` | `` ### Tool: `Read` `` + ` ```\nfile_path="..."\n``` ` |
| `user/tool_result` | `[RESULT] content...` | `### Result` + ` ```\ncontent...\n``` ` |
| `user/tool_result` (error) | `[ERROR] content...` | `### Error` + ` ```\ncontent...\n``` ` |
| `user/text` | *(not handled)* | `### User` + `> text content` (blockquote) |
| `system/task_started` | `[SUBAGENT] desc (id)` | `### Subagent` + `> desc (task_id=short_id)` |
| `rate_limit_event` | `[RATE] status=allowed` | `*Rate limit: allowed*` (italic, inline) |
| `result/success` | Box with `[DONE]` + metrics | `---` + `## Session Complete` + metrics table |
| Unknown | `[???] type=...` | `*Unknown event: type=...*` |

**Session complete block** (for `result/success`):

```markdown
---

## Session Complete

| Metric | Value |
|--------|-------|
| Duration | 2m 16s (API: 2m 12s) |
| Turns | 44 |
| Cost | $1.03 |
| Model | claude-opus-4-6 |
| Input | 12 tokens |
| Output | 7,286 tokens |
| Cache | 539,120 read / 91,852 created |
```

**Phase separators:**
- Remove the `── init ──` / `── execution ──` / `── result ──` plain-text separators
- Use `---` (horizontal rule) between the init header and execution, and before the result summary
- No phase tracking variable needed -- markdown structure provides visual separation naturally

**Stripping rules** (unchanged):
- Remove `uuid`, `session_id`, `parent_tool_use_id` from all events
- Remove `signature` from thinking blocks entirely
- Remove per-message `usage` blocks (usage is only shown in the final summary)
- Remove `context_management`, `stop_reason`, `stop_sequence` from assistant messages

**Configuration** (via environment variables, unchanged):
- `THINK_MAX_CHARS` -- max chars for thinking preview (default: `200`)
- `RESULT_MAX_CHARS` -- max chars for tool result content (default: `500`)
- `TOOL_ARGS_MAX_CHARS` -- max chars for tool_use input display (default: `120`)

#### Known Rendering Issues

The initial markdown implementation (commit `537ab00`) produced output with 5 rendering bugs observed in `logs/20260222_131721_build_iter0.md`. These must be fixed:

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | **Missing blank lines before `###` headings** — `---\n### Thinking`, `> blockquote\n### Assistant`, etc. render as literal text instead of headings | Each jq event block emits its `###` heading without a leading blank line. Markdown requires a blank line before headings. | Each event block must emit a leading blank line (`""`) before its `###` heading. |
| 2 | **Tool name includes `" id="toolu_..."` suffix** — e.g. `` ### Tool: `Task" id="toolu_01YVE..."` `` | Some stream-json `tool_use` events have the `id` field concatenated into `.name` (upstream API quirk). | Sanitize `.name` by stripping everything from `" id="` onward: `(.name // "unknown") \| split("\" id=\"") \| .[0]` |
| 3 | **Newlines collapsed in Result/Error code blocks** — multi-line content compressed to one line (`1→# SPEC-01...  2→  3→## CONTEXT...`) | `gsub("\n"; " ")` in Result/Error handlers collapses all newlines to spaces. | Remove `gsub("\n"; " ")` from Result and Error handlers. Code blocks preserve newlines natively. |
| 4 | **Unhandled `user/text` content type** — renders as `*Unknown event: type=user content_type=text*` | User message handler only handles `tool_result` content blocks. User messages can also contain `text` content blocks (e.g. subagent responses). | Add handler for `.type == "text"` inside the user branch — render as `### User` + `> text` blockquote. |
| 5 | **Double truncation of tool args** — args cut at arbitrary positions with missing closing quotes | `.value \| tostring \| .[0:60]` truncates each value to 60 chars, then `trunc($tool_max)` truncates the joined result again to 120 chars. | Remove per-value `.[0:60]` limit. Rely solely on `trunc($tool_max)` for the total. |

#### Usage Modes

```bash
# Pipe mode (real-time formatting during loop, saved to .md)
cat "$PROMPT_FILE" | claude ... | ./format-log.sh | tee "$LOG_FILE"

# Review mode (re-process a saved raw JSON log from archive)
./format-log.sh < archive/0004-openai-default/logs/20260222_092718_plan_iter0.log

# With custom truncation
THINK_MAX_CHARS=500 RESULT_MAX_CHARS=1000 ./format-log.sh < archive/some.log
```

#### Implementation

- **Language**: Bash + `jq` (available on all target systems; no Node dependency for ops scripts)
- Reads stdin line-by-line
- Each line: attempt JSON parse with `jq`; on failure, pass through as-is (handles non-JSON lines like git push output)
- No phase tracking needed -- markdown structure provides natural separation

#### Acceptance Criteria

- [x] `format-log.sh` exists at project root, is executable (`chmod +x`)
- [x] Handles all event types from the markdown mapping table above
- [x] Outputs valid markdown: `##` headers, `###` sub-headers, `` ``` `` code blocks, `>` blockquotes, `|` tables
- [x] Strips UUIDs, signatures, per-message usage from output
- [x] Truncates thinking, tool results, and tool args to configurable max lengths
- [x] Uses `---` horizontal rules for visual separation (no plain-text box drawing)
- [x] Prints markdown metrics table for `result/success` events
- [x] Passes through non-JSON lines unchanged (e.g. git output, loop banners)
- [x] Works in pipe mode: `echo '{"type":"system","subtype":"init",...}' | ./format-log.sh`
- [x] Works in review mode: `./format-log.sh < archive/0004-openai-default/logs/20260222_092718_plan_iter0.log`
- [x] Requires only `bash` and `jq` (no Node, Python, or other runtime)
- [x] Output renders correctly in VS Code markdown preview
- [x] Blank line emitted before every `###` heading (valid markdown rendering)
- [x] Tool names sanitized — no embedded `" id="` attributes in heading
- [x] Code blocks in Result/Error preserve newlines (multi-line content readable)
- [x] User `text` content blocks handled — rendered as blockquote, not unknown event
- [x] Tool args use only `TOOL_ARGS_MAX_CHARS` total limit (no per-value 60-char truncation)

---

### US-02: `loop.sh` -- Save Markdown, Swap Pipeline

**As a** developer running headless Claude loops
**I want** `loop.sh` to save formatted markdown logs (not raw JSON)
**So that** I can open log files directly in VS Code/GitHub and get readable content

#### Changes to `loop.sh`

**1. File extension: `.log` → `.md`**

```bash
# Old:
LOG_FILE="${LOG_DIR}/${TIMESTAMP}_${MODE}_iter${ITERATION}.log"

# New:
LOG_FILE="${LOG_DIR}/${TIMESTAMP}_${MODE}_iter${ITERATION}.md"
```

**2. Reversed pipeline: formatted output saved, raw JSON discarded**

```bash
# Old (raw JSON saved, formatted to terminal):
cat "$PROMPT_FILE" | claude ... 2>&1 | tee "$LOG_FILE" | ./format-log.sh

# New (formatted markdown saved AND displayed):
cat "$PROMPT_FILE" | claude ... 2>&1 | ./format-log.sh | tee "$LOG_FILE"
```

- Formatted markdown is saved to `.md` files
- Same formatted output is displayed on the terminal
- Raw JSON is **no longer preserved** (archived raw JSON in `archive/` still works via `review-log.sh`)

**3. Format control via environment variable** (unchanged behavior)

- `FORMAT_LOGS=1` (default): formatted markdown output saved and displayed
- `FORMAT_LOGS=0`: raw JSON saved to `.md` file and displayed (unformatted fallback)
- Check: if `format-log.sh` is not found or not executable, fall back to raw output with a warning

**4. Iteration timing** (unchanged)

- Record `ITER_START` timestamp before each Claude invocation
- Record `ITER_END` timestamp after Claude completes
- Calculate and display iteration duration

**5. Per-iteration summary** (unchanged)

After each Claude run completes, print:

```
┌─ Iteration 0 ─────────────────────────
│ Started: 2026-02-22 09:31:00
│ Duration: 2m 16s
│ Log:      logs/20260222_093100_build_iter0.md
│ Pushing to origin/ryaneggz/feature...
└────────────────────────────────────────
```

**6. Session summary at loop end** (unchanged)

When the loop exits (max iterations reached or manual stop), print:

```
╔══════════════════════════════════════════
║ SESSION COMPLETE
║ Mode:       build
║ Iterations: 5
║ Total time: 12m 34s
║ Logs:       ./logs/
╚══════════════════════════════════════════
```

#### Acceptance Criteria

- [ ] Log files saved with `.md` extension instead of `.log`
- [ ] Pipeline reversed: `... | ./format-log.sh | tee "$LOG_FILE"` (formatted output saved)
- [ ] `cat logs/*.md` shows valid markdown (not raw JSON)
- [ ] `.md` files render correctly in VS Code markdown preview
- [ ] `FORMAT_LOGS=0 ./loop.sh` saves raw JSON to `.md` (unformatted fallback)
- [ ] Falls back to raw output with warning if `format-log.sh` is missing
- [ ] Each iteration prints start/end timestamps and duration
- [ ] Per-iteration summary box printed after each Claude run
- [ ] Session summary box printed when loop exits
- [ ] Existing behavior preserved: git push after each iteration, prompt file selection, max iterations

---

### US-03: `review-log.sh` -- Dual Format Support (`.md` + `.log`)

**As a** developer reviewing past Claude sessions
**I want** `review-log.sh` to handle both new `.md` files and archived `.log` files
**So that** I can review any log regardless of format era

#### Usage

```bash
# Review a new markdown log (direct cat, already formatted)
./review-log.sh logs/20260222_093100_build_iter0.md

# Review an archived raw JSON log (pipe through format-log.sh)
./review-log.sh archive/0004-openai-default/logs/20260222_092718_plan_iter0.log

# Review all logs from a directory (prefers .md, falls back to .log)
./review-log.sh logs/

# Pipe to less for paging
./review-log.sh logs/20260222_093100_build_iter0.md | less -R
```

#### Implementation

**Single file mode:**
- If file ends with `.md`: `cat "$1"` (already formatted markdown)
- If file ends with `.log`: `./format-log.sh < "$1"` (transform raw JSON to markdown)
- Other extensions: attempt `./format-log.sh < "$1"` as fallback

**Directory mode:**
- Look for `*.md` files first; if found, `cat` each directly
- If no `.md` files found, fall back to `*.log` files and pipe each through `format-log.sh`
- Print filename header between each file

#### Acceptance Criteria

- [ ] `review-log.sh` exists at project root, is executable
- [ ] `.md` files: displayed via `cat` (already formatted)
- [ ] `.log` files: piped through `format-log.sh` (backward compat with archived raw JSON)
- [ ] Directory mode: prefers `*.md`, falls back to `*.log`
- [ ] Prints filename header between multiple log files
- [ ] Prints usage message when called with no arguments
- [ ] Output is suitable for piping to `less` or redirecting to a file
- [ ] Works with archived logs in `archive/` directories

---

## DEPENDENCY ORDER

```
US-01 (format-log.sh — markdown rewrite)
  |
  +----+----+
  v         v
US-02     US-03
(loop.sh) (review-log.sh)
```

US-01 must be completed first since both US-02 and US-03 depend on `format-log.sh`.

---

## FILE STRUCTURE

| Action | File | Description |
|--------|------|-------------|
| **Modify** | `format-log.sh` | Rewrite `[PREFIX]` output to markdown (headers, code blocks, blockquotes, tables) |
| **Modify** | `loop.sh` | Change `.log` → `.md` extension, reverse pipeline to save formatted output |
| **Modify** | `review-log.sh` | Support both `.md` (cat) and `.log` (format-log.sh) files |
| **Modify** | `specs/SPEC-01-loop-log-readability.md` | Update spec to document markdown format |

---

## VERIFICATION

After implementation, verify with these manual tests:

1. **Pipe mode**: `./loop.sh plan 1` → terminal shows markdown-formatted output (headers, code blocks, blockquotes)
2. **Saved markdown**: `cat logs/*.md` → valid markdown with `##` headers, `` ``` `` code blocks, `|` tables (not raw JSON)
3. **VS Code preview**: Open `logs/*.md` in VS Code → renders as readable markdown preview
4. **Review new logs**: `./review-log.sh logs/` → shows `.md` files directly via `cat`
5. **Review archived logs**: `./review-log.sh archive/0004-openai-default/logs/` → still formats old `.log` JSON files through `format-log.sh`
6. **Formatting disabled**: `FORMAT_LOGS=0 ./loop.sh plan 1` → raw JSON saved to `.md` (unformatted fallback)
7. **Single file review**: `./review-log.sh logs/some_file.md` → cat directly; `./review-log.sh archive/.../some.log` → pipe through formatter
