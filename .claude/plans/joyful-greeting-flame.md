# Plan: Fix Resume Continuation Errors

## Context

Resuming a session with `deepfactor --resume <id>` shows prior messages but fails with "3 consecutive errors" when sending a new query. Three root causes:

1. **`buildMessages` doesn't batch parallel tool_calls** — `agent.ts:288-301` creates a **separate AIMessage per tool_call event**, but OpenAI API requires parallel tool_calls in a **single AIMessage** followed by their ToolMessages. The seeded thread from the error output has parallel bash calls, and `continueLoop` → `buildMessages` produces an invalid message sequence.

2. **Session log duplication** — `handleResult` in `useAgent.ts:106-113` logs ALL thread messages each time (not just new ones), causing duplicate entries in the `.jsonl` file. This shows as duplicated "AI:" messages on resume.

3. **No `toolCallId` in `SessionEntry`** — original tool call IDs (e.g. `call_6_bash`) are lost. `buildThreadFromSession` generates fake `resumed-tc-N` IDs. These need to be UUIDs for proper LangChain compatibility.

## Files to Modify

### 1. `packages/deep-factor-agent/src/agent.ts` — Fix `buildMessages` parallel tool_call batching

In `buildMessages()` (line 268-323), batch consecutive `tool_call` events into a single AIMessage:

```typescript
case "tool_call": {
  // Peek ahead: batch consecutive tool_call events into one AIMessage
  const toolCalls = [{ id: event.toolCallId, name: event.toolName, args: event.args }];
  // (collect subsequent tool_call events from the for-loop iteration)
  messages.push(new AIMessage({ content: "", tool_calls: toolCalls }));
  break;
}
```

Approach: switch from `for...of` to index-based loop. When hitting a `tool_call`, consume all consecutive `tool_call` events and emit one AIMessage. Same fix needed in `buildXmlMessages` if it has the same pattern.

### 2. `packages/deep-factor-tui/src/session-logger.ts` — Add `toolCallId` to `SessionEntry` + use UUIDs

- Add `toolCallId?: string` to `SessionEntry` interface
- In `buildThreadFromSession`: use `entry.toolCallId` when available, fall back to `crypto.randomUUID()` for old sessions missing it
- Replace `resumed-tc-N` pattern with `crypto.randomUUID()`

### 3. `packages/deep-factor-tui/src/hooks/useAgent.ts` — Fix session log duplication

In `handleResult`, only log messages that are NEW (not from the seeded thread):

- Track the event count from the initial thread: `const initialEventCount = useRef(options.initialThread?.events.length ?? 0)`
- When persisting to session log, skip the first `initialEventCount` messages (they're already in the session file)
- After first `handleResult` call, reset to 0 so subsequent turns log everything

### 4. `packages/deep-factor-tui/src/hooks/useAgent.ts` — Persist `toolCallId` when logging

When logging `tool_call` messages to the session, also include the `toolCallId` from the event. This requires either:
- Adding `toolCallId` to `ChatMessage` type and populating it in `eventsToChatMessages`
- Or logging directly from thread events instead of converted ChatMessages

Simpler: add `toolCallId?: string` to `ChatMessage` in `types.ts`, populate in `eventsToChatMessages`, and include it in `appendSession`.

### 5. `packages/deep-factor-tui/src/types.ts` — Add `toolCallId` to `ChatMessage`

Add `toolCallId?: string` field.

## Verification

```bash
pnpm -C packages/deep-factor-agent type-check
pnpm -C packages/deep-factor-tui type-check
pnpm -r test

# Manual test:
deepfactor "Who won the 2001 world series?"
# → follow up with questions that trigger parallel tool calls
# → exit, then resume:
deepfactor --resume <id>
# → send new query → should get contextual response, no errors
# → verify no duplicate "AI:" messages in display
```
