# Spec: Automated Backpressure Tests

## File

`packages/deep-factor-cli/__tests__/tui/backpressure.test.tsx` (new file)

## Purpose

Automated tests using `ink-testing-library` + `vitest` that exercise the app under each mock scenario. Validates rendering correctness, state transitions, and resilience under backpressure.

---

## Test Infrastructure

```typescript
import React from "react";
import { render } from "ink-testing-library";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { MockApp } from "../../src/testing/MockApp.js";
import {
  slowConversation,
  rapidBurst,
  mixedPressure,
  longRunning,
  errorRecovery,
  humanInputFlow,
  largePayload,
} from "../../src/testing/mock-agent.js";
```

### Timer Strategy

Use vitest fake timers to control scenario step execution:

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});
```

Advance time with `vi.advanceTimersByTimeAsync(ms)` to process each step.

### Mocking

Mock `ink`'s `useApp` to prevent actual exit calls (same pattern as existing `app.test.tsx`):

```typescript
const mockExit = vi.fn();

vi.mock("ink", async () => {
  const actual = await vi.importActual("ink");
  return {
    ...(actual as Record<string, unknown>),
    useApp: () => ({ exit: mockExit }),
  };
});
```

**Do NOT mock `useAgent`** — the point of these tests is that `MockApp` injects `useMockAgent` via context, so `useAgent` is called but its result is ignored (overridden by context).

---

## Test Cases

### `describe("slow conversation scenario")`

**Test: "status transitions idle → running → done"**

1. Render `<MockApp scenario="slow" />`
2. Assert frame contains status indicator for idle
3. Simulate sending prompt via stdin (type text + Enter)
4. Advance timers past first delay → assert "running" state (Spinner visible — frame contains "Thinking")
5. Advance timers past all delays → assert "done" state (Spinner gone)

**Test: "messages appear in correct order"**

1. Render, send prompt, advance through all delays
2. Assert frame contains tool call name
3. Assert frame contains assistant response text
4. Assert user message appears before assistant message in frame

**Test: "spinner visible during running, hidden after done"**

1. Render, send prompt
2. Advance partially → assert frame contains "Thinking"
3. Advance fully → assert frame does NOT contain "Thinking"

### `describe("rapid burst scenario")`

**Test: "all messages render without crash"**

1. Render `<MockApp scenario="burst" />`
2. Send prompt
3. Advance through all `50 * 10ms = 500ms` of events
4. Assert no thrown errors
5. Assert frame contains the final assistant response

**Test: "final frame contains assistant response"**

1. Full run through burst scenario
2. Assert `lastFrame()` contains the expected summary text

**Test: "status bar updates token counts"**

1. Full run through burst
2. Assert frame contains non-zero token count

### `describe("mixed pressure scenario")`

**Test: "transitions between slow and fast phases"**

1. Render `<MockApp scenario="mixed" />`
2. Send prompt
3. Advance through slow phase (3 steps × 2000ms) → assert messages appearing
4. Advance through fast phase (10 steps × 10ms) → assert more messages appeared
5. Advance through final slow phase → assert done

**Test: "tool calls visible in verbose mode"**

1. Full run (verbose defaults to true in MockApp)
2. Assert frame contains tool call indicators

### `describe("long running scenario")`

**Test: "high iteration count renders without error"**

1. Render `<MockApp scenario="long" />`
2. Send prompt
3. Advance through all `20 iterations × 3 steps × 500ms`
4. Assert no errors
5. Assert frame contains final iteration's message

**Test: "status bar iteration count matches expected"**

1. Full run
2. Assert frame contains iteration count ≥ 20

### `describe("error recovery scenario")`

**Test: "error message appears"**

1. Render `<MockApp scenario="error" />`
2. Send prompt
3. Advance past the error step (500 + 500 + 1000 = 2000ms)
4. Assert frame contains "Error:" or the error message text
5. Assert status shows error state

**Test: "status transitions: running → error"**

1. Send prompt → assert "Thinking" (running)
2. Advance past error delay → assert error shown, "Thinking" gone

### `describe("human input scenario")`

**Test: "HumanInput component appears at pending_input"**

1. Render `<MockApp scenario="human" />`
2. Send prompt
3. Advance past the human_input step (500 + 500 + 500 = 1500ms)
4. Assert frame contains the question text ("Pick one")
5. Assert frame contains choices ("Option A", "Option B")

**Test: "submitting input resumes scenario"**

1. Advance to pending_input
2. Simulate typing response via stdin + Enter
3. Advance remaining delays
4. Assert frame contains assistant response after human input
5. Assert status transitions back to running then done

### `describe("large payload scenario")`

**Test: "long content renders without crash"**

1. Render `<MockApp scenario="large" />`
2. Send prompt
3. Advance past the single step (100ms)
4. Assert no errors
5. Assert `lastFrame()` is non-empty and contains content

**Test: "content is present in frame"**

1. Full run
2. Assert frame contains a substring of the large content (e.g., first 50 chars)

---

## Timing Calculations Reference

| Scenario | Total Duration          | Step Count |
| -------- | ----------------------- | ---------- |
| `slow`   | 4600ms (3 × 1500 + 100) | 5          |
| `burst`  | 510ms (51 × 10)         | 102        |
| `mixed`  | ~6100ms                 | ~15        |
| `long`   | 30000ms (20 × 3 × 500)  | 61         |
| `error`  | 2000ms                  | 3          |
| `human`  | 1500ms + pause + 600ms  | 5          |
| `large`  | 100ms                   | 2          |

---

## Acceptance Criteria

- [ ] All test cases pass with `vitest run`
- [ ] Tests use fake timers — no real delays
- [ ] `MockApp` is used (not raw `App` with mocked `useAgent`)
- [ ] No real LLM calls made during tests
- [ ] Each scenario has at least 2 test cases
- [ ] Tests cover: state transitions, message ordering, error display, human input, large content
- [ ] Tests run via `pnpm -C packages/deep-factor-cli test:backpressure`
- [ ] Tests don't interfere with existing test suite
- [ ] Test file location: `__tests__/tui/backpressure.test.tsx`
