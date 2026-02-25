# IMPLEMENTATION PLAN

> Last updated: 2026-02-24
> Status: **IN PROGRESS**
> Phase: **Testing & Coverage**

---

## Status Summary

Comprehensive testing phase for both `deep-factor-agent` and `deep-factor-cli` packages. Coverage infrastructure is now live. Agent package fixes are complete (dead code removed, Claude 4.6 pricing added, interruptOn tests added, conditional assertion fixed).

### Current Test Inventory

| Package | Test Files | Tests | Coverage Infra |
|---------|-----------|-------|----------------|
| `deep-factor-agent` | 8 | 135/135 pass | `@vitest/coverage-v8` active (94.1% stmts) |
| `deep-factor-cli` | 3 | 10/10 pass | `@vitest/coverage-v8` active (50% stmts) |

### Coverage Baselines (measured)

**Agent package** (94.1% stmts):
- `agent.ts`: 90.67% stmts, 72.07% branch
- `context-manager.ts`: 96.29% stmts
- `create-agent.ts`, `human-in-the-loop.ts`, `middleware.ts`, `stop-conditions.ts`, `tool-adapter.ts`, `types.ts`: 100%
- `index.ts`: 0% (re-export barrel, acceptable)

**CLI package** (50% stmts):
- `useAgent.ts`: 64% stmts, 35.29% branch
- `Chat.tsx`: 83.33%, `StatusBar.tsx`: 100%, `ToolCall.tsx`: 100%
- `HumanInput.tsx`, `PromptInput.tsx`, `Spinner.tsx`: 0%
- `bash.ts`: 50%
- `app.tsx`: 93.33%
- `cli.tsx`: 0% (entry point, deferred)

### Remaining Untested CLI Source Files (4 of 9)

| Source File | Coverage | Test File | Status |
|-------------|----------|-----------|--------|
| `hooks/useAgent.ts` | 64% | None | Needs dedicated test file |
| `components/Spinner.tsx` | 0% | None | ZERO coverage |
| `components/HumanInput.tsx` | 0% | None | ZERO coverage |
| `components/PromptInput.tsx` | 0% | None | ZERO coverage |

---

## Execution Order

| Order | Spec | Description | Status | Est. Tests | Dependencies |
|-------|------|-------------|--------|------------|--------------|
| 1 | SPEC-01 | Coverage infrastructure | **DONE** | 0 (infra) | — |
| 2 | SPEC-06 | Agent package fixes | **DONE** | +6 actual | — |
| 3a | SPEC-02 | `useAgent` hook tests | PENDING | +25 | SPEC-01 ✓ |
| 3b | SPEC-03 | Component tests | PENDING | +45 | SPEC-01 ✓ |
| 3c | SPEC-04 | Bash tool tests | PENDING | +14 | SPEC-01 ✓ |
| 4 | SPEC-05 | App integration tests | PENDING | +16 | SPEC-02 |

SPEC-02, SPEC-03, and SPEC-04 are parallelizable (no shared state or pattern dependencies).

---

## SPEC-02: useAgent Hook Tests (PENDING)

> **Priority: NEXT (parallelizable with SPEC-03 and SPEC-04)**
> Highest-value gap: most complex CLI logic (283 lines), 64% coverage but no dedicated test file

### Items

- [ ] Export `eventsToChatMessages` from `packages/deep-factor-cli/src/hooks/useAgent.ts`
- [ ] Create `packages/deep-factor-cli/__tests__/hooks/useAgent.test.ts`
- [ ] `eventsToChatMessages` tests (8 tests)
- [ ] Initial state tests (3 tests)
- [ ] `sendPrompt()` tests (8 tests)
- [ ] `submitHumanInput()` tests (6 tests)

---

## SPEC-03: Component Tests (PENDING)

> **Priority: NEXT (parallelizable with SPEC-02 and SPEC-04)**

### Items

- [ ] Create `ToolCall.test.tsx` (9 tests)
- [ ] Create `Spinner.test.tsx` (7 tests) — needs `vi.useFakeTimers()`
- [ ] Create `HumanInput.test.tsx` (16 tests) — needs `stdin.write()`
- [ ] Create `PromptInput.test.tsx` (10 tests)
- [ ] Extend `Chat.test.tsx` (+3 tests)

---

## SPEC-04: Bash Tool Tests (PENDING)

> **Priority: NEXT (parallelizable with SPEC-02 and SPEC-03)**

### Items

- [ ] Create `packages/deep-factor-cli/__tests__/tools/bash.test.ts` (14 tests)

---

## SPEC-05: Extended App Integration Tests (PENDING)

> **Priority: AFTER SPEC-02** — depends on useAgent mock patterns

### Items

- [ ] Extend `app.test.tsx` with 16 additional tests

---

## Confirmed Complete

- [x] CLI implementation (previous phase, archived to `0006-code`)
- [x] Agent package core tests: 129/129 pass across 8 test files
- [x] CLI baseline tests: 10/10 pass across 3 test files
- [x] `.gitignore` covers `coverage/`, `packages/*/.env`, and root `.env`
- [x] **SPEC-01**: `@vitest/coverage-v8` installed, `coverage` scripts added, vitest configs updated, both packages produce coverage tables
- [x] **SPEC-06**: Dead `isPendingHumanInput()` removed, Claude 4.6 pricing added (sonnet + opus), 2 interruptOn edge case tests, conditional assertion fixed, `gpt-4.1-mini` added to required models test

---

## Learnings

- **interruptOn behavior**: The inner tool loop does NOT break when encountering an interrupt tool — it skips execution via `continue` and the inner loop continues. `checkInterruptOn()` fires AFTER the inner loop exits naturally. Tests must mock a second model response (no tool calls) for the inner loop to exit.
- **SPEC-06 test count**: Plan estimated +7 new tests, actual was +6 (the conditional assertion fix improved an existing test, not a new one). Updated final target accordingly.

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

| Metric | Before | Current | After |
|--------|--------|---------|-------|
| Agent tests | 129 | 135 | 135 (done) |
| CLI tests | 10 | 10 | 110 (+25 hook, +45 components, +14 bash, +16 integration) |
| Total tests | 139 | 145 | 245 |
| Coverage infra | None | Active | Active |
| Untested CLI source files | 7 of 9 | 4 of 9 | 0 of 9 |
| Known agent issues | 4 | 0 | 0 |

---

## Notes

- All new CLI tests use `ink-testing-library` for rendering, `vi.mock` for dependencies.
- Agent tests use existing mock patterns (`mockModel`, `mockThread`).
- No API calls in any test — all mocked.
- ESM-only project: all mocking must be compatible with `"type": "module"` configuration.
