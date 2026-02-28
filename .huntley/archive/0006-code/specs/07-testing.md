# SPEC-07: Testing Setup

## CONTEXT

### Problem Statement

The CLI package needs tests using `ink-testing-library` for component rendering and vitest for the test runner. `ink-testing-library@4` targets ink@5/react@18 but works with ink@6/react@19 — peer dep warnings must be suppressed.

### RELEVANT SOURCES
- [ink-testing-library@4](https://github.com/vadimdemedes/ink-testing-library) — `render()`, `lastFrame()`, `stdin`
- [vitest](https://vitest.dev/) — test runner
- [vi.mock](https://vitest.dev/api/vi.html#vi-mock) — module mocking

### RELEVANT FILES
- `packages/deep-factor-agent/__tests__/` — reference for test conventions
- `packages/deep-factor-cli/vitest.config.ts` — already defined in SPEC-02

---

## OVERVIEW

Set up testing with ink-testing-library, write component tests and an app integration test with mocked agent.

---

## USER STORIES

### US-01: Component Tests

**As a** developer
**I want** unit tests for each presentational component
**So that** I can verify rendering without running the agent

#### Test Files

**`__tests__/components/Chat.test.tsx`:**
```tsx
import { render } from "ink-testing-library";
import { Chat } from "../../src/components/Chat.js";

test("renders user message in blue", () => {
  const { lastFrame } = render(
    <Chat messages={[{ role: "user", content: "hello" }]} verbose={false} />
  );
  expect(lastFrame()).toContain("hello");
});

test("hides tool messages when verbose=false", () => {
  const { lastFrame } = render(
    <Chat messages={[{ role: "tool_call", content: "read", toolName: "read", toolArgs: {} }]} verbose={false} />
  );
  expect(lastFrame()).toBe("");  // or not contain tool output
});
```

**`__tests__/components/StatusBar.test.tsx`:**
```tsx
import { render } from "ink-testing-library";
import { StatusBar } from "../../src/components/StatusBar.js";

test("renders token counts", () => {
  const { lastFrame } = render(
    <StatusBar
      usage={{ inputTokens: 100, outputTokens: 50, totalTokens: 150 }}
      iterations={3}
      status="done"
    />
  );
  expect(lastFrame()).toContain("100");
  expect(lastFrame()).toContain("50");
  expect(lastFrame()).toContain("150");
  expect(lastFrame()).toContain("3");
});
```

#### Acceptance Criteria
- [ ] Chat component tests: user message, assistant message, tool messages hidden/shown
- [ ] StatusBar component tests: token counts, iteration count, status display
- [ ] Tests use `ink-testing-library` `render()` + `lastFrame()`
- [ ] No agent mocking needed for pure component tests

---

### US-02: App Integration Test

**As a** developer
**I want** an integration test that mocks the agent
**So that** I can verify the full app lifecycle without API calls

#### Test File: `__tests__/app.test.tsx`

```tsx
import { render } from "ink-testing-library";
import { vi } from "vitest";

vi.mock("deep-factor-agent", () => ({
  createDeepFactorAgent: vi.fn(() => ({
    loop: vi.fn(async () => ({
      response: "test response",
      thread: { events: [{ type: "message", role: "assistant", content: "test response" }] },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
      stopReason: "completed",
    })),
  })),
  maxIterations: vi.fn(() => () => ({ stop: false })),
  isPendingResult: vi.fn(() => false),
  requestHumanInput: {},
}));
```

#### Acceptance Criteria
- [ ] Mocks `createDeepFactorAgent` to return canned `AgentResult`
- [ ] Verifies spinner appears during "running" state
- [ ] Verifies assistant response appears in Chat
- [ ] Verifies StatusBar shows final usage
- [ ] Test is async and waits for agent completion

---

## PEER DEPENDENCY COMPATIBILITY

`ink-testing-library@4` declares:
- `"ink": ">=5.0.0"` (we use 6.x)
- `"react": ">=18.0.0"` (we use 19.x)

These are compatible ranges. If pnpm warns, suppress via root `package.json`:

```json
{
  "pnpm": {
    "peerDependencyRules": {
      "allowedVersions": {
        "ink-testing-library>react": "19",
        "ink-testing-library>ink": "6"
      }
    }
  }
}
```

---

## DEPENDENCY ORDER

```
SPEC-05 (components) + SPEC-04 (useAgent) → US-01 (component tests)
SPEC-03 (app.tsx) → US-02 (integration test)
```
