# Fix HITL Crash with Parallel Tool Execution

## Context

Parallel tool execution (`--parallel`) is implemented and working for regular tools. However, HITL (Human-in-the-Loop) via `requestHumanInput` crashes when the agent resumes after user input. The TUI sets `interruptOn: [TOOL_NAME_REQUEST_HUMAN_INPUT]`, which triggers two pre-existing bugs now surfaced by the parallel feature.

## Root Cause

Two bugs in `packages/deep-factor-agent/src/agent.ts` (affect BOTH parallel and sequential paths):

### Bug 1 — Missing ToolMessage for HITL tool calls

When `requestHumanInput` is called by the model:
1. A `ToolCallEvent` is recorded in the thread
2. A `HumanInputRequestedEvent` is recorded
3. `humanInputRequested = true`, then `break` — **NO `ToolResultEvent` or `ToolMessage` is created**

On resume, `buildMessages()` produces: `AIMessage(tool_calls) → HumanMessage("[Human Response]: ...")` with no `ToolMessage` in between. The LLM API rejects this because every `tool_call` must have a matching `ToolMessage`.

**Location:** Parallel path lines 529-548, sequential path lines 585-605.

### Bug 2 — checkInterruptOn overrides HITL handler

After the tool loop, `checkInterruptOn` (line 745) runs BEFORE the `humanInputRequested` check (line 775). Since `requestHumanInput` is in `interruptOn`, `checkInterruptOn` fires first:
- Creates a SECOND `human_input_requested` event with generic message: *"Tool 'requestHumanInput' requires approval before execution."*
- Returns the interruptOn `PendingResult` instead of the HITL one

The TUI extracts the LAST `human_input_requested` event (`.pop()`) — getting the generic interruptOn message instead of the model's actual question/choices.

## Fix

### 1. Add synthetic ToolResult for HITL tool calls (`agent.ts`)

In **both** the parallel path's sequential batch handler and the sequential path's HITL handler, after recording the `HumanInputRequestedEvent`, add a synthetic `tool_result` event and push a `ToolMessage`. This keeps the message sequence valid for the LLM API.

**Parallel path** (lines 529-548): After recording `HumanInputRequestedEvent`, add:
```typescript
const hitlToolCallId = tc.id ?? `call_${stepCount}_${tc.name}`;
const hitlResult = `[Waiting for human input]`;
thread.events.push({
  type: "tool_result", toolCallId: hitlToolCallId, result: hitlResult,
  timestamp: Date.now(), iteration,
});
messages.push(new ToolMessage({ tool_call_id: hitlToolCallId, content: hitlResult }));
```

**Sequential path** (lines 585-605): Same addition.

### 2. Move `humanInputRequested` check BEFORE `checkInterruptOn` (`agent.ts`)

Swap the order at lines 744-794 so that `humanInputRequested` is checked first. This ensures the HITL `PendingResult` (with the model's actual question/choices) takes priority over the generic interruptOn handler.

**Before:**
```
checkInterruptOn → return PendingResult (generic message)
humanInputRequested → return PendingResult (model's question)  // never reached
```

**After:**
```
humanInputRequested → return PendingResult (model's question)  // fires first
checkInterruptOn → return PendingResult (if no HITL)
```

### 3. Update tests

- Add test: HITL with `interruptOn` set — verify correct `PendingResult` is returned, synthetic tool_result exists, resume doesn't crash
- Add test: HITL resume produces valid message sequence (tool_call has matching ToolMessage)

## Critical Files

| File | Change |
|------|--------|
| `packages/deep-factor-agent/src/agent.ts` | Add synthetic ToolResult for HITL; swap humanInputRequested/checkInterruptOn order |
| `packages/deep-factor-agent/__tests__/agent.test.ts` | Add HITL + interruptOn tests |

## Verification

1. `pnpm -r build` — all packages compile
2. `pnpm -r type-check` — no type errors
3. `pnpm -C packages/deep-factor-agent test` — all tests pass (including new HITL tests)
4. Manual test: `node packages/deep-factor-tui/dist/cli.js --bash --parallel` → trigger HITL via a prompt like "Help me choose a programming language" → verify correct question shown, input accepted, agent resumes without crash
