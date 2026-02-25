# SPEC-05: Extended App Integration Tests

> Priority: **Lower** — depends on mock patterns established in SPEC-02
> Depends on: SPEC-02 (useAgent mock patterns)

## Goal

Expand `packages/deep-factor-cli/__tests__/app.test.tsx` from 2 tests to ~18, covering all UI states and prop combinations.

## File to Modify

`packages/deep-factor-cli/__tests__/app.test.tsx`

## Current Coverage (2 tests)

1. `shows assistant response after agent completes` — basic response rendering
2. `shows status bar with usage after completion` — token counts display

## Mock Strategy

The existing file already mocks `useAgent`. Extend the mock to support different return states:

```ts
const mockUseAgent = vi.fn().mockReturnValue({
  status: "idle",
  messages: [],
  usage: { input: 0, output: 0, total: 0 },
  iterations: 0,
  error: null,
  humanInputRequest: null,
  sendPrompt: vi.fn(),
  submitHumanInput: vi.fn(),
});
```

Override per-test with `mockUseAgent.mockReturnValueOnce(...)`.

## New Test Groups (~16 additional tests)

### Interactive Mode (4 tests)

| # | Test | Assert |
|---|------|--------|
| 1 | PromptInput visible when idle + interactive | Contains "> " prompt |
| 2 | PromptInput hidden when not interactive | No "> " prompt |
| 3 | PromptInput re-appears after completion in interactive mode | Returns to idle |
| 4 | No auto-exit in interactive mode | `exit()` not called |

### Pending Input State (3 tests)

| # | Test | Assert |
|---|------|--------|
| 5 | HumanInput rendered when status=`pending_input` | Question text visible |
| 6 | HumanInput shows choices when provided | Choice list visible |
| 7 | `submitHumanInput` called on HumanInput submit | Mock invoked |

### Error State (3 tests)

| # | Test | Assert |
|---|------|--------|
| 8 | Error message displayed in red | Contains error text |
| 9 | Exits in single-prompt mode on error | `exit()` called |
| 10 | Does not exit in interactive mode on error | `exit()` not called |

### `enableBash` Flag (2 tests)

| # | Test | Assert |
|---|------|--------|
| 11 | `enableBash=true` → bashTool in tools array | Mock receives tool |
| 12 | `enableBash=false` → no bashTool | Empty tools array |

### Spinner (2 tests)

| # | Test | Assert |
|---|------|--------|
| 13 | Spinner visible when status=`running` | Contains "Thinking" |
| 14 | Spinner hidden when status=`idle` | No "Thinking" |

### Single-prompt mode (2 tests)

| # | Test | Assert |
|---|------|--------|
| 15 | Auto-sends prompt on mount | `sendPrompt` called |
| 16 | Exits after completion | `exit()` called |

## Implementation Notes

- Use `ink-testing-library` `render()` for all tests.
- Mock `useApp()` from `ink` to capture `exit()` calls.
- Use `vi.useFakeTimers()` for Spinner tests within this file.
