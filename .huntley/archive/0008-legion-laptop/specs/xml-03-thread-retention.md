# SPEC-03: Standard Mode Thread Retention Fix + Integration Tests

## CONTEXT

The current `buildMessages()` method (agent.ts:193) only handles `message` (with role dispatch), `human_input_received`, and `summary` events. It silently drops:

- `tool_call` → should become `AIMessage` with `tool_calls`
- `tool_result` → should become `ToolMessage`
- `error` → should become `HumanMessage` with error context
- `completion` → can be skipped (terminal event)
- `human_input_requested` → can be skipped (handled by interrupt flow)

This means standard-mode multi-iteration runs lose all tool interaction history between outer iterations. The model sees the user prompt and assistant text responses but not the tool calls/results that produced them.

This spec fixes `buildMessages()` and adds integration tests that verify multi-iteration thread retention in **both** standard and XML modes.

### DEPENDENCIES
- SPEC-01 (xml-serializer module)
- SPEC-02 (XML context mode integration)

---

## FIX: `buildMessages()` in `agent.ts`

### Current Behavior (Broken)

```ts
// Only these cases are handled:
case "message":     // -> HumanMessage / AIMessage / HumanMessage([System])
case "human_input_received":  // -> HumanMessage
case "summary":     // -> skipped (injected via context injection)
default:            // -> skipped (tool_call, tool_result, error, completion, human_input_requested)
```

### Fixed Behavior

Add cases for `tool_call`, `tool_result`, and `error`:

```ts
case "tool_call": {
  // Reconstruct an AIMessage with tool_calls array.
  // Adjacent tool_call events from the same iteration should be grouped
  // into a single AIMessage with multiple tool_calls entries.
  // However, for simplicity and correctness, each tool_call can be its own
  // AIMessage — LangChain handles this fine.
  messages.push(
    new AIMessage({
      content: "",
      tool_calls: [
        {
          id: event.toolCallId,
          name: event.toolName,
          args: event.args,
        },
      ],
    }),
  );
  break;
}

case "tool_result": {
  messages.push(
    new ToolMessage({
      tool_call_id: event.toolCallId,
      content: typeof event.result === "string"
        ? event.result
        : JSON.stringify(event.result),
    }),
  );
  break;
}

case "error": {
  // Inject errors as human messages so the model can self-correct
  messages.push(
    new HumanMessage(
      `[Error${event.recoverable ? " (recoverable)" : ""}]: ${event.error}`,
    ),
  );
  break;
}

case "completion":
case "human_input_requested":
  // Terminal/control events — not needed in message reconstruction
  break;
```

### Grouping Note

The simplest correct approach emits one `AIMessage` per `tool_call` event. This works because:
1. LangChain's message format supports AIMessages with a single tool_call.
2. The model providers accept sequences of `AIMessage(tool_call) → ToolMessage(result)` pairs.
3. Grouping adjacent tool_calls into a single AIMessage is an optimization but not required for correctness.

If grouping is desired later, it can be done by scanning for consecutive `tool_call` events with the same iteration and combining their `tool_calls` arrays into a single `AIMessage`. This is out of scope for this spec.

---

## INTEGRATION TESTS

### Test File: `__tests__/thread-retention.test.ts`

Tests that verify the full round-trip: events → messages → model sees tool history.

#### Test 1: Standard mode retains tool calls across iterations

```ts
// Setup: Create a thread with events from iteration 1 including tool_call + tool_result
// Call buildMessages() (or run a multi-iteration loop with mock model)
// Assert: The messages array contains AIMessage with tool_calls and ToolMessage
```

#### Test 2: Standard mode retains errors across iterations

```ts
// Setup: Thread with an error event from iteration 1
// Assert: buildMessages() includes a HumanMessage with the error text
```

#### Test 3: XML mode retains all event types across iterations

```ts
// Setup: Thread with tool_call, tool_result, error, completion events
// Use agent with contextMode: "xml"
// Assert: The HumanMessage contains XML with all event types
```

#### Test 4: Multi-iteration loop preserves tool history (standard mode)

```ts
// Setup: Mock model that:
//   - Iteration 1: calls a tool, gets result, responds with text, fails verification
//   - Iteration 2: should see the tool call/result from iteration 1 in its messages
// Assert: On iteration 2, the messages include the tool_call AIMessage and ToolMessage from iteration 1
```

#### Test 5: Multi-iteration loop preserves tool history (XML mode)

```ts
// Same as Test 4 but with contextMode: "xml"
// Assert: On iteration 2, messages include a HumanMessage with XML containing iteration 1's tool events
```

#### Test 6: Standard and XML modes produce equivalent information

```ts
// Setup: Same thread with mixed event types
// Assert: Both modes include all non-terminal event information
// (Standard as individual messages, XML as serialized events in one message)
```

### Test Helpers

Use the existing mock model pattern from `__tests__/agent.test.ts`. The mock model should be configurable to:
- Return specific tool calls on specific iterations
- Return text responses
- Track what messages it receives (to assert thread retention)

---

## FILE STRUCTURE

- `src/agent.ts` -- fix `buildMessages()` to handle `tool_call`, `tool_result`, `error`
- `__tests__/thread-retention.test.ts` -- integration tests for both modes

---

## IMPLEMENTATION NOTES

1. **Backward compatibility**: The fix to `buildMessages()` only adds new `case` branches. Existing handled cases are unchanged.
2. **No new dependencies**: Uses existing LangChain message classes already imported in `agent.ts` (`AIMessage`, `ToolMessage`, `HumanMessage`).
3. **Test isolation**: Integration tests should use the mock model pattern from existing tests, not real LLM calls.
4. **Idempotency**: `buildMessages()` is a pure function of the thread — calling it multiple times with the same thread produces the same output.

---

## ACCEPTANCE CRITERIA

- [ ] `buildMessages()` converts `tool_call` events to `AIMessage` with `tool_calls` array
- [ ] `buildMessages()` converts `tool_result` events to `ToolMessage` with correct `tool_call_id`
- [ ] `buildMessages()` converts `error` events to `HumanMessage` with error text and recoverability
- [ ] `buildMessages()` skips `completion` and `human_input_requested` events (no regression)
- [ ] Existing `message`, `human_input_received`, `summary` handling is unchanged
- [ ] Integration test: standard mode multi-iteration retains tool history
- [ ] Integration test: standard mode multi-iteration retains error history
- [ ] Integration test: XML mode multi-iteration retains all event types
- [ ] Integration test: multi-iteration loop (standard) — model receives prior tool calls
- [ ] Integration test: multi-iteration loop (XML) — model receives prior tool events in XML
- [ ] Integration test: both modes convey equivalent information for the same thread
- [ ] `pnpm -C packages/deep-factor-agent type-check` passes
- [ ] `pnpm -C packages/deep-factor-agent test` passes (existing + new)
- [ ] `pnpm -C packages/deep-factor-agent build` passes
