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

### Current `loop.sh` Behavior

- Pipes `claude -p --output-format=stream-json` through `tee "$LOG_FILE"`
- Raw JSON goes to both terminal and log file
- After each iteration: `git push`, loop counter banner
- No post-processing, no filtering, no summarization

### RELEVANT FILES
- `loop.sh` -- current loop runner
- `archive/0004-openai-default/logs/*.log` -- example raw JSON logs

---

## OVERVIEW

Introduce three components to make `loop.sh` log output human-readable:

1. **`format-log.sh`** -- A post-processing filter script that transforms stream-json lines into readable, prefixed output
2. **`loop.sh` improvements** -- Add formatted output support alongside raw JSON logging, plus timing and summary data
3. **`review-log.sh`** -- A standalone script to re-process saved JSON logs into readable format

All three components share the same formatting rules. Raw JSON is always preserved for machine processing.

---

## USER STORIES

### US-01: Post-Processing Filter Script (`format-log.sh`)

**As a** developer reviewing Claude loop output
**I want to** pipe stream-json through a filter that produces human-readable output
**So that** I can follow what the agent is doing without parsing raw JSON

#### Formatting Rules

Each stream-json line is parsed and formatted according to its `type` and `subtype`/`content[].type`:

| Event | Formatted Output |
|-------|-----------------|
| `system/init` | `[INIT] model=claude-opus-4-6 mode=bypassPermissions tools=19` |
| `assistant` with `thinking` | `[THINK] <first 200 chars of thinking text>...` (strip `signature` field entirely) |
| `assistant` with `text` | `[ASSISTANT] <full text content>` |
| `assistant` with `tool_use` | `[TOOL] Read(file_path="/home/.../foo.ts")` -- tool name + truncated args (max 120 chars) |
| `user` with `tool_result` | `[RESULT] <content truncated to max 500 chars>` |
| `user` with `tool_result` (error) | `[ERROR] <error content truncated to max 500 chars>` |
| `system/task_started` | `[SUBAGENT] <description> (task_id=<short_id>)` |
| `rate_limit_event` | `[RATE] status=<status>` |
| `result/success` | See summary block format below |
| Unrecognized type | `[???] type=<type> subtype=<subtype>` (one-liner fallback) |

**Summary block** (for `result/success`):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[DONE] Session complete
  Duration:  2m 16s (API: 2m 12s)
  Turns:     44
  Cost:      $1.03
  Model:     claude-opus-4-6
    Input:   12 tokens
    Output:  7,286 tokens
    Cache:   539,120 read / 91,852 created
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Visual separators** between logical phases:

```
── init ─────────────────────────────────
[INIT] model=claude-opus-4-6 ...

── execution ────────────────────────────
[THINK] Let me start by reading...
[ASSISTANT] I'll read the project files.
[TOOL] Read(file_path="/home/.../CLAUDE.md")
[RESULT] ## Build & Run\n- Package manage...
...

── result ───────────────────────────────
[DONE] Session complete
  ...
```

**Stripping rules:**
- Remove `uuid`, `session_id`, `parent_tool_use_id` from all events
- Remove `signature` from thinking blocks entirely
- Remove per-message `usage` blocks (usage is only shown in the final summary)
- Remove `context_management`, `stop_reason`, `stop_sequence` from assistant messages

**Configuration** (via environment variables):
- `THINK_MAX_CHARS` -- max chars for thinking preview (default: `200`)
- `RESULT_MAX_CHARS` -- max chars for tool result content (default: `500`)
- `TOOL_ARGS_MAX_CHARS` -- max chars for tool_use input display (default: `120`)

#### Usage Modes

```bash
# Pipe mode (real-time filtering during loop)
cat "$PROMPT_FILE" | claude ... | ./format-log.sh | tee "$LOG_FILE"

# Review mode (re-process a saved raw JSON log)
./format-log.sh < logs/20260222_093100_build_iter0.log

# With custom truncation
THINK_MAX_CHARS=500 RESULT_MAX_CHARS=1000 ./format-log.sh < logs/some.log
```

#### Implementation

- **Language**: Bash + `jq` (available on all target systems; no Node dependency for ops scripts)
- Reads stdin line-by-line
- Each line: attempt JSON parse with `jq`; on failure, pass through as-is (handles non-JSON lines like git push output)
- Phase tracking: track current phase (`init`, `execution`, `result`) and print separator on transition

#### Acceptance Criteria

- [ ] `format-log.sh` exists at project root, is executable (`chmod +x`)
- [ ] Handles all event types from the table above
- [ ] Strips UUIDs, signatures, per-message usage from output
- [ ] Truncates thinking, tool results, and tool args to configurable max lengths
- [ ] Prints phase separator lines between init, execution, and result phases
- [ ] Prints formatted summary block for `result/success` events
- [ ] Passes through non-JSON lines unchanged (e.g. git output, loop banners)
- [ ] Works in pipe mode: `echo '{"type":"system","subtype":"init",...}' | ./format-log.sh`
- [ ] Works in review mode: `./format-log.sh < archive/0004-openai-default/logs/20260222_092718_plan_iter0.log`
- [ ] Requires only `bash` and `jq` (no Node, Python, or other runtime)

---

### US-02: `loop.sh` Improvements

**As a** developer running headless Claude loops
**I want** `loop.sh` to produce readable terminal output and per-iteration summaries
**So that** I can monitor progress in real-time without deciphering raw JSON

#### Changes to `loop.sh`

**1. Dual output: raw JSON log + formatted terminal output**

```bash
# Current (raw JSON to both terminal and log):
cat "$PROMPT_FILE" | claude ... 2>&1 | tee "$LOG_FILE"

# New (raw JSON to log, formatted output to terminal):
cat "$PROMPT_FILE" | claude ... 2>&1 | tee "$RAW_LOG" | ./format-log.sh
```

- Raw JSON always saved to `$LOG_DIR/${TIMESTAMP}_${MODE}_iter${ITERATION}.log` (unchanged)
- Terminal output is piped through `format-log.sh` for readability
- Optional: save formatted output to `$LOG_DIR/${TIMESTAMP}_${MODE}_iter${ITERATION}.readable.log`

**2. Format control via environment variable**

- `FORMAT_LOGS=1` (default): enable formatted terminal output
- `FORMAT_LOGS=0`: disable formatting, show raw JSON (current behavior)
- Check: if `format-log.sh` is not found or not executable, fall back to raw output with a warning

**3. Iteration timing**

- Record `ITER_START` timestamp before each Claude invocation
- Record `ITER_END` timestamp after Claude completes
- Calculate and display iteration duration

**4. Per-iteration summary**

After each Claude run completes, print:

```
┌─ Iteration 0 ─────────────────────────
│ Duration: 2m 16s
│ Log:      logs/20260222_093100_build_iter0.log
│ Pushing to origin/ryaneggz/feature...
└────────────────────────────────────────
```

**5. Session summary at loop end**

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

- [ ] Raw JSON log files are still saved to `$LOG_DIR/` (unchanged format, unchanged naming)
- [ ] Terminal output is piped through `format-log.sh` by default
- [ ] `FORMAT_LOGS=0 ./loop.sh` disables formatting and shows raw JSON
- [ ] Falls back to raw output with warning if `format-log.sh` is missing
- [ ] Each iteration prints start/end timestamps and duration
- [ ] Per-iteration summary box printed after each Claude run
- [ ] Session summary box printed when loop exits
- [ ] Session summary includes: mode, total iterations, total wall-clock time
- [ ] Existing behavior preserved: git push after each iteration, prompt file selection, max iterations

---

### US-03: Standalone Log Reviewer (`review-log.sh`)

**As a** developer reviewing past Claude sessions
**I want to** re-process saved JSON logs into readable format
**So that** I can review what happened without manually parsing JSON

#### Usage

```bash
# Review a single log file
./review-log.sh logs/20260222_093100_build_iter0.log

# Review an archived log
./review-log.sh archive/0004-openai-default/logs/20260222_092718_plan_iter0.log

# Review all logs from a directory (concatenated)
./review-log.sh logs/

# Pipe to less for paging
./review-log.sh logs/20260222_093100_build_iter0.log | less -R
```

#### Implementation

- Thin wrapper around `format-log.sh`
- If argument is a file: `./format-log.sh < "$1"`
- If argument is a directory: iterate over `*.log` files in sorted order, print filename header between each, pipe each through `format-log.sh`
- If no argument: print usage and exit

#### Acceptance Criteria

- [ ] `review-log.sh` exists at project root, is executable
- [ ] Accepts a file path argument and formats it via `format-log.sh`
- [ ] Accepts a directory argument and formats all `*.log` files within it
- [ ] Prints filename header between multiple log files
- [ ] Prints usage message when called with no arguments
- [ ] Output is suitable for piping to `less` or redirecting to a file

---

## DEPENDENCY ORDER

```
US-01 (format-log.sh)
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
| **Create** | `format-log.sh` | Stream-json to readable output filter |
| **Modify** | `loop.sh` | Add formatted output, timing, summaries |
| **Create** | `review-log.sh` | Standalone log reviewer wrapper |

---

## VERIFICATION

After implementation, verify with these manual tests:

1. **Pipe mode**: `./loop.sh plan 1` -- terminal output should show `[INIT]`, `[THINK]`, `[TOOL]`, etc. instead of raw JSON
2. **Raw log preserved**: Check `logs/*.log` -- should still contain raw JSON (one JSON object per line)
3. **Review mode**: `./review-log.sh archive/0004-openai-default/logs/20260222_092718_plan_iter0.log` -- should produce readable output
4. **All event types**: The reviewed log should show `[INIT]`, `[THINK]`, `[ASSISTANT]`, `[TOOL]`, `[RESULT]`, `[RATE]`, and `[DONE]` prefixes
5. **Formatting disabled**: `FORMAT_LOGS=0 ./loop.sh plan 1` -- should show raw JSON in terminal (current behavior)
6. **Directory review**: `./review-log.sh archive/0004-openai-default/logs/` -- should format all logs with headers between files
7. **Fallback**: Temporarily rename `format-log.sh` and run `./loop.sh plan 1` -- should warn and fall back to raw output
