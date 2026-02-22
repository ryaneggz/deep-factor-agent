# IMPLEMENTATION PLAN

> Last updated: 2026-02-22
> Core library status: **FUNCTIONAL** (125/125 tests pass, type-check clean, no TODOs/placeholders)
> Examples status: **COMPLETE** (SPEC-01 + SPEC-02 fully implemented, all match specs exactly)
> Remaining work: **2 items** (0 bugs, 0 important gaps, 0 quality improvements, 2 nice-to-have)

---

## Completed Work

All planned spec work is fully implemented, tested, and type-checked. This covers the core library (types, stop conditions, agent loop, middleware, factory, human-in-the-loop, context management, tool adapter, barrel exports, and 125-test suite) as well as the full examples suite (7 runnable examples spanning basic usage, tools, streaming, stop conditions, middleware, human-in-the-loop, and verification). See commit history for the detailed implementation record.

---

## Remaining Work — Prioritized

### P3 — Nice-to-Have

- [ ] **#11 Tool name conflict handling** — `src/middleware.ts:28-30`. `composeMiddleware` logs conflicts via `console.warn` with no programmatic surface. **Fix (optional):** Accept an `onConflict` callback in options.

- [ ] **#12 `estimateTokens` heuristic limitations** — `src/context-manager.ts:11`. The `Math.ceil(text.length / 3.5)` heuristic is inaccurate for CJK/emoji/code. Only affects summarization trigger timing (not billing). **Fix (optional):** Document the limitation in a code comment. Optionally accept a custom tokenizer function.

---

## Recommended Execution Order

| Order | ID | Priority | Effort | Description |
|-------|-----|----------|--------|-------------|
| 1 | #11 | P3 | Small | Add `onConflict` callback to `composeMiddleware` |
| 2 | #12 | P3 | Small | Document `estimateTokens` heuristic limitations |

None of these items require a new spec — they are all fixes and improvements within existing scope.

---

## Notes

- **No `src/lib/` directory exists** — shared utilities are in individual `src/*.ts` modules per AGENTS.md conventions
- **No TODOs, FIXMEs, or placeholder code** found in source
- **No skipped or flaky tests** — all 125 tests pass deterministically
- **All examples import from `../dist/index.js`** — requires `pnpm build` before running examples
- **SPEC-02 example 05** is the only example that does NOT pass `middleware: []` (intentionally composes with defaults)
- **`stopWhen` accepts `StopCondition | StopCondition[]`** — example 05 passes a single condition, others pass arrays
- **`@langchain/anthropic` version** — Spec specified `^0.3.0` but that's incompatible with `@langchain/core@1.x`; using `^1.3.0`
- **`stream()` is intentionally non-looping** — documented in README as "Stream the first LLM turn (non-looping)"; a full `streamLoop()` would be a new feature requiring a new spec
- **Spec reconciliation** — `specs/01-examples-setup-basic.md` was updated to reflect the actual provider package chosen during implementation (`@langchain/anthropic@^1.3.0` instead of `@langchain/openai@^0.5.0`)
