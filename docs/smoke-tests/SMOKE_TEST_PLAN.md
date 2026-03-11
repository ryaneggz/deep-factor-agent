# Smoke Test Plan — Unified Log Format

Canonical reference for validating unified log output across all providers. Run after any changes to providers, log mappers, or the agent loop.

## Prerequisites

1. Build both packages:
   ```bash
   pnpm -r build
   ```
2. Ensure `deepfactor` is available (linked or via `npx`):
   ```bash
   pnpm -C packages/deep-factor-tui build
   ```
3. Create the output directory:
   ```bash
   mkdir -p logs/smoke
   ```
4. Provider auth configured:
   - **langchain**: `OPENAI_API_KEY` (uses `gpt-4.1-mini` by default)
   - **claude**: `claude` CLI installed and authenticated (uses existing Claude subscription)
   - **codex**: `codex` CLI installed and authenticated (uses existing OpenAI subscription)

## Test Matrix

| ID  | Provider  | Tier    | Description                       | Archive File                 | Lines |
| --- | --------- | ------- | --------------------------------- | ---------------------------- | ----- |
| S1  | langchain | Simple  | Basic math, no tools              | `smoke-simple.jsonl`         | 7     |
| S2  | claude    | Simple  | Basic math, no tools              | `smoke-claude.jsonl`         | 8     |
| S3  | codex     | Simple  | Basic math, no tools              | `smoke-codex.jsonl`          | 7     |
| S4  | langchain | Tools   | Parallel file reads               | `smoke-parallel.jsonl`       | 13    |
| S5  | claude    | Tools   | Bash tool use                     | `smoke-claude-tools.jsonl`   | 13    |
| S6  | codex     | Tools   | Multiple bash commands            | `smoke-codex-tools.jsonl`    | 12    |
| S7  | langchain | Complex | File create/read/delete lifecycle | `smoke-file-edit.jsonl`      | 13    |
| S8  | claude    | Complex | Multi-tool file operations        | `smoke-claude-complex.jsonl` | 26    |
| S9  | codex     | Complex | Multi-tool file operations        | `smoke-codex-complex.jsonl`  | 17    |

---

## Tier 1: Simple (no tools)

### S1: LangChain Simple

```bash
deepfactor --provider langchain -p -o stream-json "What is 2+2?" > logs/smoke/smoke-simple.jsonl
```

**Expected log types**: `init` → `message(user)` → `message(assistant)` → `status` → `completion` → `status` → `result`

**Validation**:

- `init.provider` = `"langchain"`
- No `tool_call` or `tool_result` entries
- `result.content` contains `"4"`
- 5–8 lines total

### S2: Claude Simple

```bash
CLAUDECODE= deepfactor --provider claude -p -o stream-json "What is 2+2?" > logs/smoke/smoke-claude.jsonl
```

**Expected log types**: `init` → `message(user)` → `message(assistant)` → `status` → `completion` → `status` → `result`

**Validation**:

- `init.provider` = `"claude"`
- No `tool_call` or `tool_result` entries
- `result.content` contains `"4"`
- 5–10 lines total

### S3: Codex Simple

```bash
deepfactor --provider codex -p -o stream-json "What is 2+2?" > logs/smoke/smoke-codex.jsonl
```

**Expected log types**: `init` → `message(user)` → `message(assistant)` → `status` → `completion` → `status` → `result`

**Validation**:

- `init.provider` = `"codex"`
- No `tool_call` or `tool_result` entries
- `result.content` contains `"4"`
- 5–10 lines total

---

## Tier 2: Tool Use

### S4: LangChain Parallel File Reads

```bash
deepfactor --provider langchain -p -o stream-json \
  "Read these 3 files in parallel: package.json, tsconfig.json, README.md. Summarize each in one sentence." \
  > logs/smoke/smoke-parallel.jsonl
```

**Expected log types**: `init` → `message(user)` → `tool_call` (x3) → `tool_result` (x3) → `message(assistant)` → `status` → `completion` → `status` → `result`

**Validation**:

- `tool_call` and `tool_result` entries exist with matching `toolCallId`
- `parallelGroup` present on parallel `tool_call`/`tool_result` pairs
- `display` metadata present on tool entries
- 10–16 lines total

### S5: Claude Bash Tool

```bash
CLAUDECODE= deepfactor --provider claude -p -o stream-json \
  "Use bash to list files in the current directory, then tell me how many there are." \
  > logs/smoke/smoke-claude-tools.jsonl
```

**Expected log types**: `init` → `message(user)` → `tool_call` → `tool_result` → `message(assistant)` → `status` → ... → `result`

**Validation**:

- At least one `tool_call`/`tool_result` pair with matching `toolCallId`
- `tool_call.toolName` is `"bash"` or similar
- `display` metadata present with correct `kind` values
- 8–16 lines total

### S6: Codex Multi-Command

```bash
deepfactor --provider codex -p -o stream-json \
  "Run 'echo hello' and 'echo world' as separate bash commands." \
  > logs/smoke/smoke-codex-tools.jsonl
```

**Expected log types**: `init` → `message(user)` → `tool_call` → `tool_result` → ... → `result`

**Validation**:

- At least one `tool_call`/`tool_result` pair with matching `toolCallId`
- `display` metadata present on tool entries
- 8–16 lines total

---

## Tier 3: Complex Multi-Step

### S7: LangChain File Lifecycle

```bash
deepfactor --provider langchain -p -o stream-json \
  "Create a file called /tmp/smoke-test.txt with 'hello world', read it back, then delete it." \
  > logs/smoke/smoke-file-edit.jsonl
```

**Expected log types**: `init` → `message(user)` → `tool_call`/`tool_result` (multiple) → `message(assistant)` → ... → `result`

**Validation**:

- Multiple `tool_call`/`tool_result` pairs (create, read, delete)
- All `toolCallId` values match between call and result
- `display` metadata present
- 10–20 lines total

### S8: Claude Complex File Operations

```bash
CLAUDECODE= deepfactor --provider claude -p -o stream-json \
  "Create a file /tmp/smoke-claude.txt with 'test content', read it, append ' - updated', read again, then delete it." \
  > logs/smoke/smoke-claude-complex.jsonl
```

**Expected log types**: `init` → `message(user)` → multiple `tool_call`/`tool_result` → `message(assistant)` → ... → `result`

**Validation**:

- Multiple tool invocations across iterations
- All `toolCallId` values match between call and result
- `display` metadata present
- 15–30 lines total

### S9: Codex Complex File Operations

```bash
deepfactor --provider codex -p -o stream-json \
  "Create a file /tmp/smoke-codex.txt with 'test content', read it, append ' - updated', read again, then delete it." \
  > logs/smoke/smoke-codex-complex.jsonl
```

**Expected log types**: `init` → `message(user)` → multiple `tool_call`/`tool_result` → `message(assistant)` → ... → `result`

**Validation**:

- Multiple tool invocations across iterations
- All `toolCallId` values match between call and result
- `display` metadata present
- 12–22 lines total

---

## Automated Validation Script

Run against any set of JSONL log files:

```bash
node docs/smoke-tests/validate-smoke-logs.mjs logs/archive/smoke-*.jsonl
```

Or against fresh smoke test output:

```bash
node docs/smoke-tests/validate-smoke-logs.mjs logs/smoke/smoke-*.jsonl
```

### Script: `docs/smoke-tests/validate-smoke-logs.mjs`

```js
#!/usr/bin/env node
// Unified log smoke test validator
// Usage: node scripts/validate-smoke-logs.mjs <file1.jsonl> [file2.jsonl ...]

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node validate-smoke-logs.mjs <file1.jsonl> [...]");
  process.exit(1);
}

const VALID_TYPES = new Set([
  "init",
  "message",
  "thinking",
  "tool_call",
  "tool_result",
  "file_change",
  "error",
  "approval",
  "human_input_requested",
  "human_input_received",
  "plan",
  "summary",
  "status",
  "rate_limit",
  "completion",
  "result",
]);

let totalPass = 0;
let totalFail = 0;

for (const file of files) {
  const name = basename(file);
  const errors = [];
  let lines;

  try {
    const raw = readFileSync(file, "utf-8").trim();
    lines = raw.split("\n").filter(Boolean);
  } catch (e) {
    console.log(`SKIP  ${name} — ${e.message}`);
    continue;
  }

  if (lines.length === 0) {
    console.log(`SKIP  ${name} — empty file`);
    continue;
  }

  // Parse all lines
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      entries.push(JSON.parse(lines[i]));
    } catch {
      errors.push(`Line ${i + 1}: invalid JSON`);
    }
  }

  if (entries.length === 0) {
    errors.push("No valid JSON lines");
    report(name, errors);
    continue;
  }

  // 1. Every entry has required base fields
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.type) errors.push(`Line ${i + 1}: missing "type"`);
    if (!e.sessionId) errors.push(`Line ${i + 1}: missing "sessionId"`);
    if (e.timestamp === undefined) errors.push(`Line ${i + 1}: missing "timestamp"`);
    if (e.sequence === undefined) errors.push(`Line ${i + 1}: missing "sequence"`);
    if (e.type && !VALID_TYPES.has(e.type)) errors.push(`Line ${i + 1}: unknown type "${e.type}"`);
  }

  // 2. Monotonic sequences
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].sequence <= entries[i - 1].sequence) {
      errors.push(
        `Line ${i + 1}: sequence ${entries[i].sequence} <= previous ${entries[i - 1].sequence}`,
      );
    }
  }

  // 3. Bookend events
  if (entries[0].type !== "init") {
    errors.push(`First entry type is "${entries[0].type}", expected "init"`);
  }
  if (entries[entries.length - 1].type !== "result") {
    errors.push(`Last entry type is "${entries[entries.length - 1].type}", expected "result"`);
  }

  // 4. Session consistency
  const sessionIds = new Set(entries.map((e) => e.sessionId));
  if (sessionIds.size > 1) {
    errors.push(`Multiple sessionIds found: ${[...sessionIds].join(", ")}`);
  }

  // 5. No leaked tool JSON in assistant messages
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.type === "message" && e.role === "assistant" && typeof e.content === "string") {
      if (e.content.includes('"tool_calls"') || e.content.includes('"function_call"')) {
        errors.push(`Line ${i + 1}: assistant message contains raw tool JSON`);
      }
    }
  }

  // 6. No consecutive duplicate status lines
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].type === "status" && entries[i - 1].type === "status") {
      const a = entries[i - 1];
      const b = entries[i];
      if (
        a.status === b.status &&
        a.iterations === b.iterations &&
        JSON.stringify(a.usage) === JSON.stringify(b.usage)
      ) {
        errors.push(`Lines ${i}–${i + 1}: consecutive identical status entries`);
      }
    }
  }

  // 7. Tool call/result matching
  const toolCalls = entries.filter((e) => e.type === "tool_call");
  const toolResults = entries.filter((e) => e.type === "tool_result");
  const callIds = new Set(toolCalls.map((e) => e.toolCallId));
  const resultIds = new Set(toolResults.map((e) => e.toolCallId));

  for (const id of callIds) {
    if (!resultIds.has(id)) {
      errors.push(`tool_call "${id}" has no matching tool_result`);
    }
  }
  for (const id of resultIds) {
    if (!callIds.has(id)) {
      errors.push(`tool_result "${id}" has no matching tool_call`);
    }
  }

  // 8. Provider field on init
  if (entries[0].type === "init" && !entries[0].provider) {
    errors.push("init entry missing provider field");
  }

  report(name, errors);
}

function report(name, errors) {
  if (errors.length === 0) {
    console.log(`PASS  ${name}`);
    totalPass++;
  } else {
    console.log(`FAIL  ${name}`);
    for (const err of errors) {
      console.log(`      - ${err}`);
    }
    totalFail++;
  }
}

console.log(`\n${totalPass} passed, ${totalFail} failed out of ${totalPass + totalFail} files`);
process.exit(totalFail > 0 ? 1 : 0);
```

---

## Known Failures

The following scenarios currently **fail** validation (confirmed against both archived and fresh runs):

| Scenario | File                         | Issue                                                                                                                                        |
| -------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| S8       | `smoke-claude-complex.jsonl` | Assistant messages contain raw tool JSON (`"tool_calls"`) — Claude CLI mapper not fully stripping tool call blocks from multi-turn responses |
| S9       | `smoke-codex-complex.jsonl`  | `tool_call` entries with no matching `tool_result` — Codex CLI mapper drops tool results when the agent terminates mid-sequence              |

**Note on Claude CLI**: Running Claude CLI tests from inside a Claude Code session requires unsetting `CLAUDECODE`:

```bash
CLAUDECODE= deepfactor --provider claude -p -o stream-json "prompt" > output.jsonl
```

These failures indicate bugs in the CLI provider log mappers that should be fixed in a future phase.

## Known Limitations

These are gaps deferred to Phase 5+:

1. **No `file_change` entries** — File change detection is not yet wired into CLI providers; only the agent loop emits these for LangChain tool results.
2. **`parallelGroup` only on LangChain** — Claude and Codex CLI providers execute tools sequentially; parallel grouping is LangChain-specific.
3. **`thinking` entries** — Only emitted by Claude provider when extended thinking is enabled; not covered in standard smoke tests.
4. **`durationMs` on tool results** — Not consistently populated across all providers.
5. **`costUsd` on status/result** — Cost estimation not yet implemented; field is always absent.
6. **`display` metadata coverage** — Present on LangChain tool entries; may be absent on Claude/Codex CLI tool entries depending on the tool type.
7. **`approval` / `human_input_*` entries** — Only generated in `approve` mode; smoke tests use `yolo` mode.
8. **Token usage accuracy** — Claude and Codex CLI providers report estimated token counts, not exact values.
