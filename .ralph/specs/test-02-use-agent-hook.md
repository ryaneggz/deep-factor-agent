# SPEC-02: useAgent Hook Tests (Highest Priority)

> Priority: **High** — most complex CLI logic, 283 lines, zero coverage

## Goal

Full unit test coverage for `packages/deep-factor-cli/src/hooks/useAgent.ts`, the state machine bridging the agent library to the React UI.

## File to Create

`packages/deep-factor-cli/__tests__/hooks/useAgent.test.ts`

## Prerequisite Change

Export `eventsToChatMessages` from `useAgent.ts` so it can be unit-tested directly:

```diff
-function eventsToChatMessages(events: AgentEvent[]): ChatMessage[] {
+export function eventsToChatMessages(events: AgentEvent[]): ChatMessage[] {
```

## Mock Strategy

```ts
vi.mock("deep-factor-agent", () => ({
  createDeepFactorAgent: vi.fn(),
  isPendingResult: vi.fn(),
  maxIterations: vi.fn(),
  requestHumanInput: vi.fn(),
}));
```

Test the hook via a thin Ink wrapper component rendered with `ink-testing-library`.

## Test Cases (~25)

### `eventsToChatMessages` (8 tests)

| # | Test | Assert |
|---|------|--------|
| 1 | Converts `user_message` event | `{ role: "user", content }` |
| 2 | Converts `assistant_message` event | `{ role: "assistant", content }` |
| 3 | Converts `tool_call` event | `{ role: "tool_call", toolName, toolArgs }` |
| 4 | Converts `tool_result` event | `{ role: "tool_result", toolName, content }` |
| 5 | Skips `system` event type | Not in output |
| 6 | Skips `error` event type | Not in output |
| 7 | Skips `summary` event type | Not in output |
| 8 | Returns `[]` for empty events array | Length 0 |

### Initial State (3 tests)

| # | Test | Assert |
|---|------|--------|
| 9 | Status is `idle` | `status === "idle"` |
| 10 | Messages array is empty | `messages.length === 0` |
| 11 | Usage is zero, error/humanInputRequest null | All default |

### `sendPrompt()` (8 tests)

| # | Test | Assert |
|---|------|--------|
| 12 | Sets status to `running` | Status transition |
| 13 | Calls `createDeepFactorAgent` with correct params | model, prompt, tools, maxIterations |
| 14 | Includes `requestHumanInput` in tools array | Tool concatenation |
| 15 | AgentResult → sets status `done` | `isPendingResult` returns false |
| 16 | PendingResult → sets status `pending_input` | `isPendingResult` returns true |
| 17 | Extracts humanInputRequest from pending events | Correct question/choices |
| 18 | Error (Error instance) → sets status `error` | Error message preserved |
| 19 | Error (non-Error) → wraps in Error | String coercion |

### `submitHumanInput()` (6 tests)

| # | Test | Assert |
|---|------|--------|
| 20 | No-op when no pending result | No state change |
| 21 | Sets status to `running` | Status transition |
| 22 | Calls `resume()` on pending result | Mock verification |
| 23 | Resume AgentResult → `done` | Final state |
| 24 | Resume PendingResult → `pending_input` again | Re-entrant |
| 25 | Resume error → `error` | Error propagation |

## Key Implementation Notes

- Use `act()` from React for state updates inside test wrapper.
- Fake timers may be needed if debouncing exists.
- `requestHumanInput` mock must return a tool-shaped object with correct name.
