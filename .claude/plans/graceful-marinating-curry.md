# Smoke Test Guide: Archives 0009 & 0010

## Prerequisites (both archives)

```bash
# Build the agent package first (examples import from dist/)
pnpm -C packages/deep-factor-agent build

# Ensure MODEL_ID env var is set (checked by examples/env.ts)
# e.g. export MODEL_ID="openai:gpt-4o-mini"

# Ensure all tests pass
pnpm -r test        # expect 304 tests (182 agent, 122 CLI)
pnpm -r type-check  # expect clean
```

---

## Archive 0009 — Example 12: Interactive HITL with Multiple Choice

**What it does:** Combines interactive multi-turn streaming (bash tool) with human-in-the-loop multiple-choice prompting. The model can pause mid-turn to ask the user a question with numbered choices.

### Launch

```bash
cd packages/deep-factor-agent
npx tsx examples/12-hitl-multiple-choice.ts
```

### Test 1: Multiple-choice HITL flow

1. At the `You:` prompt, type: `Help me set up a new project in the current directory`
2. **Verify:** The model should call `requestHumanInput` with `format: "multiple_choice"` and present numbered choices (e.g., programming language selection)
3. **Verify:** You see output like:
   ```
   [HITL] Which programming language would you like to use?
     1. Python
     2. JavaScript
     3. TypeScript
     4. Go
   Enter number or type your answer:
   ```
4. Type `2` and press Enter
5. **Verify:** You see `[Selected: "JavaScript"]` and the agent continues with bash commands based on your choice
6. **Verify:** The agent streams its text response token-by-token

### Test 2: Free-text fallback on multiple-choice

1. When presented with numbered choices, type a free-text answer instead of a number (e.g., `Rust`)
2. **Verify:** The agent accepts it and continues without error (free-text fallback)

### Test 3: Bash tool still works

1. Type: `What files are in the current directory?`
2. **Verify:** You see `[tool] bash: ls` (or similar) and the command output
3. **Verify:** The result is displayed with `[result]` prefix

### Test 4: XML thread state

1. After any turn completes, look for the `--- XML Thread State (turn N) ---` output
2. **Verify:** The XML includes:
   - `<message role="user">` events
   - `<tool_call>` and `<tool_result>` events for bash
   - `<human_input_requested>` events with `question`, `format`, `choices` attributes
   - `<human_input_received>` events with the `response` attribute
   - `<message role="assistant">` events

### Test 5: Multi-turn memory

1. Have a 2+ turn conversation (ask a follow-up question)
2. **Verify:** The agent remembers context from previous turns (XML thread carries history)

### Test 6: Graceful exit

1. Type `quit` — **Verify:** prints "Goodbye!" and the Final Thread Summary (total turns, event counts)
2. Alternatively, press `Ctrl+C` — **Verify:** same graceful exit

---

## Archive 0010 — Example 13: Parallel Tool Calling

**What it does:** Extends Example 12 with parallel tool execution. When the model returns multiple independent tool calls, they run concurrently via `Promise.all`. HITL calls remain sequential. Timing output shows the concurrency benefit.

### Launch

```bash
cd packages/deep-factor-agent
npx tsx examples/13-parallel-tool-calls.ts
```

### Test 1: Parallel execution of multiple bash commands

1. At the `You:` prompt, type: `Show me disk space, current directory listing, and system uptime`
2. **Verify:** The model makes 3 tool calls in a single response
3. **Verify:** You see:
   ```
   [parallel] Executing 3 tool call(s) concurrently...
   [tool] bash: df -h
   [tool] bash: ls
   [tool] bash: uptime
   ```
4. **Verify:** Timing output appears:
   ```
   [timing] Parallel: XXms | Sequential would be: YYms
   ```
5. **Verify:** Parallel time is roughly equal to the slowest single call (not the sum)

### Test 2: Alternative multi-command prompt

1. Type: `What's my hostname, kernel version, and shell?`
2. **Verify:** Multiple bash calls execute in parallel with timing displayed

### Test 3: HITL stays sequential during parallel execution

1. Type: `Help me set up a project` (should trigger both bash + HITL calls)
2. **Verify:** Bash tool calls run in the parallel batch first
3. **Verify:** HITL prompts appear sequentially after the parallel batch, one at a time
4. **Verify:** You can answer the HITL question normally (numbered choice or free-text)

### Test 4: Single tool call (no parallel overhead)

1. Type: `What time is it?`
2. **Verify:** A single bash call executes normally (may or may not show `[parallel] Executing 1 tool call(s)`)

### Test 5: XML thread state with parallel calls

1. After a parallel turn, check the `--- XML Thread State ---` output
2. **Verify:** All `tool_call` and `tool_result` events are present and correctly paired
3. **Verify:** `tool_call` timestamps for parallel calls are nearly identical (they started concurrently)

### Test 6: Streaming still works

1. On any turn, **Verify:** the assistant's text response streams token-by-token (not all at once)

### Test 7: Graceful exit

1. Type `quit` — **Verify:** "Goodbye!" + Final Thread Summary with correct event counts
2. **Verify:** Event counts include `tool_call`, `tool_result`, `message`, and optionally `human_input_requested`/`human_input_received`

---

## Quick Regression Checks

| Check | Command | Expected |
|-------|---------|----------|
| Agent tests | `pnpm -C packages/deep-factor-agent test` | 182 passing |
| CLI tests | `pnpm -C packages/deep-factor-cli test` | 122 passing |
| Type-check | `pnpm -r type-check` | Clean (no errors) |
| Build | `pnpm -r build` | Clean |
| Example 12 listed in README | Check `packages/deep-factor-agent/examples/README.md` | Row for Example 12 present |
| Example 13 listed in README | Check `packages/deep-factor-agent/examples/README.md` | Row for Example 13 present |
