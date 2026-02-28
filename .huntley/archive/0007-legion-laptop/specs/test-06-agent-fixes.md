# SPEC-06: Agent Package Minor Fixes

> Priority: **High** — clean foundation before adding CLI tests
> No dependencies on CLI specs

## Goal

Address 4 confirmed issues in `packages/deep-factor-agent`.

## Changes

### Fix 1: Remove dead `isPendingHumanInput()` method

**File:** `packages/deep-factor-agent/src/agent.ts` (lines 237–245)

**Evidence:** Grep confirms the method is defined but never called anywhere in the codebase. The logic is superseded by `checkInterruptOn()` and direct event handling in the human input flow.

**Action:** Delete the method entirely:

```ts
// DELETE lines 237-245:
private isPendingHumanInput(thread: AgentThread): boolean {
  const requestEvents = thread.events.filter(
    (e) => e.type === "human_input_requested",
  );
  const responseEvents = thread.events.filter(
    (e) => e.type === "human_input_received",
  );
  return requestEvents.length > responseEvents.length;
}
```

**Tests:** Existing tests should continue to pass (method was never tested or used).

---

### Fix 2: Add Claude 4.6 pricing

**File:** `packages/deep-factor-agent/src/stop-conditions.ts` (MODEL_PRICING map, ~lines 10-60)

**Current models present:** `claude-sonnet-4-5`, `claude-opus-4-5`, `claude-haiku-4-5`, OpenAI models, Gemini models.

**Action:** Add two entries:

```ts
"claude-sonnet-4-6": { input: 3.0, output: 15.0 },
"claude-opus-4-6":   { input: 15.0, output: 75.0 },
```

(Pricing based on published Anthropic rates for Claude 4.6 family.)

**New tests in `__tests__/stop-conditions.test.ts`** (4 tests):

| # | Test |
|---|------|
| 1 | `maxCost` recognizes `claude-sonnet-4-6` |
| 2 | `maxCost` recognizes `claude-opus-4-6` |
| 3 | `claude-sonnet-4-6` cost calculation matches expected |
| 4 | `claude-opus-4-6` cost calculation matches expected |

---

### Fix 3: Add `interruptOn` edge case tests

**File:** `packages/deep-factor-agent/__tests__/agent.test.ts`

**Evidence:** The `interruptOn` feature is fully implemented in `agent.ts` (lines 142, 161, 251–264, 399–403, 502–530) but has zero test coverage.

**New tests** (2 tests in a new `describe("interruptOn")` block):

| # | Test | Scenario |
|---|------|----------|
| 1 | Interrupts when tool name matches | Agent calls tool in `interruptOn` list → returns `PendingResult` |
| 2 | Mixed tool responses — one matches | AI requests 2 tools, one in `interruptOn` → interrupt after executing both |

**Mock setup:** Configure `mockModel` to return `AIMessage` with `tool_calls` containing the target tool name.

---

### Fix 4: Fix conditional assertion

**File:** `packages/deep-factor-agent/__tests__/agent.test.ts` (line 745)

**Evidence:** Line 745 wraps an assertion in `if (systemMessages.length > 0)`, which silently passes when there are no system messages — a test anti-pattern.

**Action:** Replace the conditional with a proper assertion:

```diff
-if (systemMessages.length > 0) {
-  const systemContent = systemMessages[0].content;
-  expect(systemContent).toContain("Previous Iteration Summaries");
-}
+expect(systemMessages.length).toBeGreaterThan(0);
+const systemContent = systemMessages[0].content;
+expect(systemContent).toContain("Previous Iteration Summaries");
```

## Acceptance

- `pnpm -C packages/deep-factor-agent test` — all existing tests pass + 7 new tests pass.
- `pnpm -C packages/deep-factor-agent type-check` — no type errors.
- No references to `isPendingHumanInput` remain in codebase.
