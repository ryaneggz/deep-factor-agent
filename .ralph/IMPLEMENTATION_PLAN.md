# IMPLEMENTATION PLAN

> Last updated: 2026-02-24
> Status: **COMPLETE**
> Phase: **Testing & Coverage**

---

## Status Summary

Comprehensive testing phase for both `deep-factor-agent` and `deep-factor-cli` packages. Coverage infrastructure is now live. Agent package fixes are complete (dead code removed, Claude 4.6 pricing added, interruptOn tests added, conditional assertion fixed).

### Current Test Inventory

| Package | Test Files | Tests | Coverage Infra |
|---------|-----------|-------|----------------|
| `deep-factor-agent` | 8 | 135/135 pass | `@vitest/coverage-v8` active (94.1% stmts) |
| `deep-factor-cli` | 9 | 94/94 pass | `@vitest/coverage-v8` active |

### Remaining Untested CLI Source Files (0 of 9)

All CLI source files now have dedicated test coverage. Only `cli.tsx` (entry point) is deferred.

---

## Execution Order

| Order | Spec | Description | Status | Est. Tests | Dependencies |
|-------|------|-------------|--------|------------|--------------|
| 1 | SPEC-01 | Coverage infrastructure | **DONE** | 0 (infra) | — |
| 2 | SPEC-06 | Agent package fixes | **DONE** | +6 actual | — |
| 3a | SPEC-02 | `useAgent` hook tests | **DONE** | +25 actual | SPEC-01 ✓ |
| 3b | SPEC-03 | Component tests | **DONE** | +49 actual | SPEC-01 ✓ |
| 3c | SPEC-04 | Bash tool tests | **DONE** | +14 actual | SPEC-01 ✓ |
| 4 | SPEC-05 | App integration tests | **DONE** | +16 actual | SPEC-02 ✓ |

SPEC-02, SPEC-03, and SPEC-04 are parallelizable (no shared state or pattern dependencies).

---

## SPEC-02: useAgent Hook Tests (DONE)

### Delivered

- [x] Exported `eventsToChatMessages` from `packages/deep-factor-cli/src/hooks/useAgent.ts`
- [x] Created `packages/deep-factor-cli/__tests__/hooks/useAgent.test.tsx` (25 tests)
- [x] `eventsToChatMessages` pure function tests (8 tests)
- [x] Initial state tests (3 tests)
- [x] `sendPrompt()` tests (8 tests)
- [x] `submitHumanInput()` tests (6 tests)
- [x] Uses `vi.hoisted()` pattern for ESM-compatible mock variable references

---

## SPEC-03: Component Tests (DONE)

### Delivered

- [x] Created `ToolCall.test.tsx` (9 tests) — includes truncation, null value handling
- [x] Created `Spinner.test.tsx` (7 tests) — `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()`
- [x] Created `HumanInput.test.tsx` (16 tests) — async `stdin.write()` with `vi.waitFor()` + `delay()`
- [x] Created `PromptInput.test.tsx` (10 tests) — same async stdin pattern
- [x] Extended `Chat.test.tsx` (+3 tests for tool_call rendering, tool_result verbose, truncation)
- [x] Fixed `ToolCall.tsx` source bug: `JSON.stringify(undefined)` crash (added `?? String(value)` fallback)

---

## SPEC-04: Bash Tool Tests (DONE)

### Delivered

- [x] Created `packages/deep-factor-cli/__tests__/tools/bash.test.ts` (14 tests)
- [x] Mocks both `child_process` and `deep-factor-agent` (`createLangChainTool`)
- [x] Tests metadata, success path (execSync args, encoding, timeout, maxBuffer), error handling

---

## SPEC-05: Extended App Integration Tests (DONE)

### Delivered

- [x] Rewrote `app.test.tsx` from 2 to 18 tests using direct `useAgent` mock
- [x] Mocked `useApp` from `ink` to capture `exit()` calls
- [x] Mocked `bashTool` for `enableBash` flag tests
- [x] Interactive mode (4 tests): PromptInput visibility, no auto-exit
- [x] Pending input (3 tests): HumanInput rendering, choices, submit wiring
- [x] Error state (3 tests): error display, exit behavior (interactive vs single-prompt)
- [x] enableBash flag (2 tests): tools array passed to useAgent
- [x] Spinner (2 tests): visibility tied to running status
- [x] Single-prompt mode (2 tests): auto-send on mount, exit on completion

---

## Confirmed Complete

- [x] CLI implementation (previous phase, archived to `0006-code`)
- [x] Agent package core tests: 129/129 pass across 8 test files
- [x] CLI baseline tests: 10/10 pass across 3 test files
- [x] `.gitignore` covers `coverage/`, `packages/*/.env`, and root `.env`
- [x] **SPEC-01**: `@vitest/coverage-v8` installed, `coverage` scripts added, vitest configs updated, both packages produce coverage tables
- [x] **SPEC-06**: Dead `isPendingHumanInput()` removed, Claude 4.6 pricing added (sonnet + opus), 2 interruptOn edge case tests, conditional assertion fixed, `gpt-4.1-mini` added to required models test
- [x] **SPEC-02**: 25 useAgent hook tests (`eventsToChatMessages`, initial state, `sendPrompt()`, `submitHumanInput()`)
- [x] **SPEC-03**: 49 component tests (ToolCall 9, Spinner 7, HumanInput 16, PromptInput 10, Chat +3 extensions, ToolCall.tsx source bug fix)
- [x] **SPEC-04**: 14 bash tool tests (metadata, success path, error handling)
- [x] **SPEC-05**: 18 app integration tests (rewrote from 2 → 18 with useAgent mock, useApp exit capture)

---

## Learnings

- **interruptOn behavior**: The inner tool loop does NOT break when encountering an interrupt tool — it skips execution via `continue` and the inner loop continues. `checkInterruptOn()` fires AFTER the inner loop exits naturally. Tests must mock a second model response (no tool calls) for the inner loop to exit.
- **SPEC-06 test count**: Plan estimated +7 new tests, actual was +6 (the conditional assertion fix improved an existing test, not a new one). Updated final target accordingly.
- **React 19 stdin batching**: `stdin.write()` in ink-testing-library doesn't flush React state synchronously. Tests using `stdin.write()` must be async with `vi.waitFor()` and `await delay()` between writes.
- **Fake timers + React**: `vi.advanceTimersByTimeAsync()` needs to advance past the exact interval boundary — at exactly N*interval the callback may not have flushed to React state. Split advances (e.g., `advanceTimersByTimeAsync(300)` then `advanceTimersByTimeAsync(50)`) ensure the timer fires and React re-renders.
- **ESM mock patterns**: `vi.hoisted()` is essential for ESM-compatible mock variable references in `vi.mock()` factory functions. Without it, mock variables are not accessible inside the factory.
- **ToolCall.tsx bug**: `JSON.stringify(undefined)` returns primitive `undefined` (not a string), causing `.length` to crash. Fixed with `?? String(value)` fallback.
- **SPEC-03 actual test count**: Spec estimated 45, actual was 49 (extras from extended Chat tests and additional edge cases).

---

## Deferred / Low Priority

- **`verbose` prop unused in `useAgent`** — Intentional no-op for now
- **`stream()` thin wrapper** — Documented limitation
- **`cli.tsx` entry point tests** — High effort / low value
- **StatusBar color-mapping exhaustive tests** — Existing 3 tests adequate
- **Duplicate `useInput` logic** in HumanInput/PromptInput — Refactor opportunity
- **`any` type in mock model pattern** — Cleanup opportunity
- **No coverage thresholds** — Consider adding after testing phase establishes baselines
- **No CI coverage integration** — Future spec opportunity

---

## Final Target State

| Metric | Before | Final |
|--------|--------|-------|
| Agent tests | 129 | 135 |
| CLI tests | 10 | 110 |
| Total tests | 139 | 245 |
| Coverage infra | None | Active (`@vitest/coverage-v8`) |
| Untested CLI source files | 7 of 9 | 0 of 9 |
| Known agent issues | 4 | 0 |

---

## Notes

- All new CLI tests use `ink-testing-library` for rendering, `vi.mock` for dependencies.
- Agent tests use existing mock patterns (`mockModel`, `mockThread`).
- No API calls in any test — all mocked.
- ESM-only project: all mocking must be compatible with `"type": "module"` configuration.
