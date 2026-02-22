# IMPLEMENTATION PLAN

> Last updated: 2026-02-22
> Core library status: **COMPLETE** (129/129 tests pass, type-check clean, no TODOs/placeholders)
> Examples status: **COMPLETE** (SPEC-01 + SPEC-02 fully implemented, all match specs exactly)
> Remaining work: **0 items**

---

## Completed Work

All planned spec work is fully implemented, tested, and type-checked. This covers the core library (types, stop conditions, agent loop, middleware, factory, human-in-the-loop, context management, tool adapter, barrel exports, and 129-test suite) as well as the full examples suite (7 runnable examples spanning basic usage, tools, streaming, stop conditions, middleware, human-in-the-loop, and verification). See commit history for the detailed implementation record.

### Recently completed P3 items

- **#11 Tool name conflict handling** — `composeMiddleware` now accepts an optional `ComposeMiddlewareOptions` second parameter with an `onConflict` callback. When two middleware provide a tool with the same name, `onConflict(toolName, middlewareName)` is called. Defaults to `console.warn` for backwards compatibility. Exported as `ComposeMiddlewareOptions` from barrel. 1 new test added.

- **#12 `estimateTokens` heuristic limitations** — `estimateTokens` now has a doc comment explaining the `Math.ceil(text.length / 3.5)` heuristic's inaccuracy for CJK/emoji/code and its limited blast radius (summarization timing only). `ContextManagementConfig` accepts an optional `tokenEstimator` function; `ContextManager` uses it when provided, falling back to `estimateTokens`. 3 new tests added.

---

## Notes

- **No `src/lib/` directory exists** — shared utilities are in individual `src/*.ts` modules per AGENTS.md conventions
- **No TODOs, FIXMEs, or placeholder code** found in source
- **No skipped or flaky tests** — all 129 tests pass deterministically
- **All examples import from `../dist/index.js`** — requires `pnpm build` before running examples
- **SPEC-02 example 05** is the only example that does NOT pass `middleware: []` (intentionally composes with defaults)
- **`stopWhen` accepts `StopCondition | StopCondition[]`** — example 05 passes a single condition, others pass arrays
- **`@langchain/anthropic` version** — Spec specified `^0.3.0` but that's incompatible with `@langchain/core@1.x`; using `^1.3.0`
- **`stream()` is intentionally non-looping** — documented in README as "Stream the first LLM turn (non-looping)"; a full `streamLoop()` would be a new feature requiring a new spec
- **Spec reconciliation** — `specs/01-examples-setup-basic.md` was updated to reflect the actual provider package chosen during implementation (`@langchain/anthropic@^1.3.0` instead of `@langchain/openai@^0.5.0`)
