# IMPLEMENTATION PLAN

> Last updated: 2026-02-22
> Core library status: **FUNCTIONAL** (110/110 tests pass, type-check clean, no TODOs/placeholders)
> Examples status: **COMPLETE** (SPEC-01 + SPEC-02 fully implemented, all match specs exactly)
> Remaining work: **8 items** (0 bugs, 2 important gaps, 3 quality improvements, 3 nice-to-have)

---

## Completed Work

All planned spec work is fully implemented, tested, and type-checked. This covers the core library (types, stop conditions, agent loop, middleware, factory, human-in-the-loop, context management, tool adapter, barrel exports, and 110-test suite) as well as the full examples suite (7 runnable examples spanning basic usage, tools, streaming, stop conditions, middleware, human-in-the-loop, and verification). See commit history for the detailed implementation record.

### Recently Completed

- [x] **#2 Magic string coupling** — Exported `TOOL_NAME_REQUEST_HUMAN_INPUT` from `human-in-the-loop.ts` and `TOOL_NAME_WRITE_TODOS` from `middleware.ts`. `agent.ts` now imports and uses these constants instead of raw strings. A rename in the defining module now causes a compile-time error in `agent.ts`. Constants also re-exported from `index.ts` for consumer use.
- [x] **#4 Missing public API exports** — `requestHumanInputSchema`, `ComposedMiddleware`, `TOOL_NAME_REQUEST_HUMAN_INPUT`, and `TOOL_NAME_WRITE_TODOS` are now re-exported from `src/index.ts`.
- [x] **#5 tool-adapter.test.ts** — Created 13 unit tests covering: `createLangChainTool` (name/description, string passthrough, auto-stringification for objects/arrays/numbers/null), `toolArrayToMap` (basic conversion, empty array, duplicate name last-wins), `findToolByName` (match, correct selection, missing name, empty array).

---

## Remaining Work — Prioritized

### P1 — Important Gaps

- [ ] **#3 `as any` casts in production code** — `src/agent.ts:52,64,117-119`. Four `as any` casts work around LangChain typing gaps. Fragile across LangChain version bumps. **Fix:** Use duck-typed property checks with `in` operator for `usage_metadata` (line 52). Define a helper for model ID extraction (lines 117-119). Use a discriminated union for content blocks (line 64).

- [ ] **#6 Inner tool loop hardcapped at 20 steps** — `src/agent.ts:308`. The `while (stepCount < 20)` inner loop is not configurable and not documented. Complex workflows may silently hit this ceiling. **Fix:** Add optional `maxToolCallsPerIteration` to `DeepFactorAgentSettings` (default: 20). Update the README Defaults table.

### P2 — Quality Improvements

- [ ] **#7 `stream()` return type is `AsyncIterable<any>` and undertested** — `src/agent.ts:613-639`. The README documents `stream()` as "non-looping" (intentional), but the return type should be `AsyncIterable<AIMessageChunk>` per AGENTS.md. Only one test exists: `expect(result).toBeDefined()`. **Fix:** Type the return value. Add tests for chunk iteration, message construction, and error propagation.

- [ ] **#8 Silent catch blocks** — `src/agent.ts:385` silently swallows JSON parse errors from `write_todos`; `src/context-manager.ts:87` silently falls back on summarization failure. **Fix:** Add `console.warn` to `agent.ts:385` for observability. `context-manager.ts:87` is acceptable as-is (graceful degradation). Add test for summarization fallback path.

- [ ] **#9 Event sub-types exported but not documented** — `BaseEvent`, `ToolCallEvent`, `ToolResultEvent`, `ErrorEvent`, `HumanInputRequestedEvent`, `HumanInputReceivedEvent`, `MessageEvent`, `CompletionEvent`, `SummaryEvent`, `AgentEventType` are all exported from `index.ts` but not individually listed in the README Types table. **Fix:** Add rows to README.

### P3 — Nice-to-Have

- [ ] **#11 Tool name conflict handling** — `src/middleware.ts:28-30`. `composeMiddleware` logs conflicts via `console.warn` with no programmatic surface. **Fix (optional):** Accept an `onConflict` callback in options.

- [ ] **#12 `estimateTokens` heuristic limitations** — `src/context-manager.ts:11`. The `Math.ceil(text.length / 3.5)` heuristic is inaccurate for CJK/emoji/code. Only affects summarization trigger timing (not billing). **Fix (optional):** Document the limitation in a code comment. Optionally accept a custom tokenizer function.

- [ ] **#13 Remaining test gaps** — Multiple scenarios lack coverage:
  - Context summarization triggering automatically during `loop()`
  - Multiple tool calls in a single model response
  - `verifyCompletion` + `interruptOn` combined
  - `summarize()` fallback path when model throws
  - `isPendingResult` type guard direct test
  - `maxCost` with unknown model (silently returns 0)

---

## Recommended Execution Order

| Order | ID | Priority | Effort | Description |
|-------|-----|----------|--------|-------------|
| 1 | #7 | P2 | Small | Fix `stream()` return type and add tests |
| 2 | #6 | P1 | Small | Make inner tool loop cap configurable |
| 3 | #3 | P1 | Medium | Replace `as any` casts with safer patterns |
| 4 | #8 | P2 | Small | Add observability to silent catch blocks |
| 5 | #9 | P2 | Small | Document event sub-types in README |
| 6 | #13 | P3 | Medium | Fill remaining test gaps |
| 7 | #11 | P3 | Small | Add `onConflict` callback to `composeMiddleware` |
| 8 | #12 | P3 | Small | Document `estimateTokens` heuristic limitations |

None of these items require a new spec — they are all fixes and improvements within existing scope.

---

## Spec Reconciliation

`specs/01-examples-setup-basic.md` was updated to reflect the actual provider package chosen during implementation. The spec originally listed `@langchain/openai@^0.5.0`, but the project uses `@langchain/anthropic@^1.3.0`. The `^0.3.x` release of `@langchain/anthropic` has a peer dependency on `@langchain/core >=0.3.58 <0.4.0`, which is incompatible with this project's `@langchain/core@^1.1.27`. Version `^1.3.0` satisfies the `1.x` peer requirement and is what is installed.

---

## Notes

- **No `src/lib/` directory exists** — shared utilities are in individual `src/*.ts` modules per AGENTS.md conventions
- **No TODOs, FIXMEs, or placeholder code** found in source
- **No skipped or flaky tests** — all 110 tests pass deterministically
- **All examples import from `../dist/index.js`** — requires `pnpm build` before running examples
- **SPEC-02 example 05** is the only example that does NOT pass `middleware: []` (intentionally composes with defaults)
- **`stopWhen` accepts `StopCondition | StopCondition[]`** — example 05 passes a single condition, others pass arrays
- **`@langchain/anthropic` version** — Spec specified `^0.3.0` but that's incompatible with `@langchain/core@1.x`; using `^1.3.0`
- **`stream()` is intentionally non-looping** — documented in README as "Stream the first LLM turn (non-looping)"; a full `streamLoop()` would be a new feature requiring a new spec
