# IMPLEMENTATION PLAN

> Last updated: 2026-02-22
> Core library status: **FUNCTIONAL** (123/123 tests pass, type-check clean, no TODOs/placeholders)
> Examples status: **COMPLETE** (SPEC-01 + SPEC-02 fully implemented, all match specs exactly)
> Remaining work: **3 items** (0 bugs, 0 important gaps, 0 quality improvements, 2 nice-to-have, 1 partial test gap)

---

## Completed Work

All planned spec work is fully implemented, tested, and type-checked. This covers the core library (types, stop conditions, agent loop, middleware, factory, human-in-the-loop, context management, tool adapter, barrel exports, and 123-test suite) as well as the full examples suite (7 runnable examples spanning basic usage, tools, streaming, stop conditions, middleware, human-in-the-loop, and verification). See commit history for the detailed implementation record.

### Recently Completed

- [x] **#2 Magic string coupling** — Exported `TOOL_NAME_REQUEST_HUMAN_INPUT` from `human-in-the-loop.ts` and `TOOL_NAME_WRITE_TODOS` from `middleware.ts`. `agent.ts` now imports and uses these constants instead of raw strings. A rename in the defining module now causes a compile-time error in `agent.ts`. Constants also re-exported from `index.ts` for consumer use.
- [x] **#4 Missing public API exports** — `requestHumanInputSchema`, `ComposedMiddleware`, `TOOL_NAME_REQUEST_HUMAN_INPUT`, and `TOOL_NAME_WRITE_TODOS` are now re-exported from `src/index.ts`.
- [x] **#5 tool-adapter.test.ts** — Created 13 unit tests covering: `createLangChainTool` (name/description, string passthrough, auto-stringification for objects/arrays/numbers/null), `toolArrayToMap` (basic conversion, empty array, duplicate name last-wins), `findToolByName` (match, correct selection, missing name, empty array).
- [x] **#7 `stream()` return type fixed** — Return type corrected to `AsyncIterable<AIMessageChunk>` per AGENTS.md. 5 new tests added: chunk iteration, message reconstruction from chunks, error propagation, tool binding smoke test, and the existing basic definedness test retained.
- [x] **#6 Inner tool loop cap made configurable** — `maxToolCallsPerIteration` added to `DeepFactorAgentSettings` (default: 20). Inner loop now uses `this.maxToolCallsPerIteration` instead of the magic literal `20`. README Defaults table updated. 2 new tests.
- [x] **#3 All `as any` casts removed** — All 5 `as any` casts in production code eliminated. `extractUsage` uses `in` operator duck-typing for `usage_metadata`. `extractTextContent` uses a typed `TextContentBlock` interface with an `isTextContentBlock` type guard. Model ID extraction uses an `extractModelId` helper with `in` operator checks. Zero `as any` in production code.
- [x] **#8 Silent catch in `write_todos` handling made observable** — The silent catch in `agent.ts` write_todos handling now logs via `console.warn` with a descriptive message. 1 new test added verifying warning behavior.
- [x] **#9 Event sub-types documented in README** — All event sub-types (`BaseEvent`, `ToolCallEvent`, `ToolResultEvent`, `ErrorEvent`, `HumanInputRequestedEvent`, `HumanInputReceivedEvent`, `MessageEvent`, `CompletionEvent`, `SummaryEvent`, `AgentEventType`) added to the README Types table. Also documented: `TOOL_NAME_WRITE_TODOS`, `TOOL_NAME_REQUEST_HUMAN_INPUT`, `requestHumanInputSchema`, `ComposedMiddleware`.
- [x] **#13 (partial) Remaining test gaps filled** — 5 new tests added: `summarize()` fallback path when model throws, `maxCost` with unknown model (returns 0), multiple tool calls in a single model response, `isPendingResult` type guard direct test, `verifyCompletion` + stop condition combined.

---

## Remaining Work — Prioritized

### P3 — Nice-to-Have

- [ ] **#11 Tool name conflict handling** — `src/middleware.ts:28-30`. `composeMiddleware` logs conflicts via `console.warn` with no programmatic surface. **Fix (optional):** Accept an `onConflict` callback in options.

- [ ] **#12 `estimateTokens` heuristic limitations** — `src/context-manager.ts:11`. The `Math.ceil(text.length / 3.5)` heuristic is inaccurate for CJK/emoji/code. Only affects summarization trigger timing (not billing). **Fix (optional):** Document the limitation in a code comment. Optionally accept a custom tokenizer function.

- [ ] **#13 Remaining test gap** — One scenario still lacks coverage:
  - Context summarization triggering automatically during `loop()`

---

## Recommended Execution Order

| Order | ID | Priority | Effort | Description |
|-------|-----|----------|--------|-------------|
| 1 | #13 | P3 | Medium | Cover context summarization auto-trigger in `loop()` |
| 2 | #11 | P3 | Small | Add `onConflict` callback to `composeMiddleware` |
| 3 | #12 | P3 | Small | Document `estimateTokens` heuristic limitations |

None of these items require a new spec — they are all fixes and improvements within existing scope.

---

## Spec Reconciliation

`specs/01-examples-setup-basic.md` was updated to reflect the actual provider package chosen during implementation. The spec originally listed `@langchain/openai@^0.5.0`, but the project uses `@langchain/anthropic@^1.3.0`. The `^0.3.x` release of `@langchain/anthropic` has a peer dependency on `@langchain/core >=0.3.58 <0.4.0`, which is incompatible with this project's `@langchain/core@^1.1.27`. Version `^1.3.0` satisfies the `1.x` peer requirement and is what is installed.

---

## Notes

- **No `src/lib/` directory exists** — shared utilities are in individual `src/*.ts` modules per AGENTS.md conventions
- **No TODOs, FIXMEs, or placeholder code** found in source
- **No skipped or flaky tests** — all 123 tests pass deterministically
- **All examples import from `../dist/index.js`** — requires `pnpm build` before running examples
- **SPEC-02 example 05** is the only example that does NOT pass `middleware: []` (intentionally composes with defaults)
- **`stopWhen` accepts `StopCondition | StopCondition[]`** — example 05 passes a single condition, others pass arrays
- **`@langchain/anthropic` version** — Spec specified `^0.3.0` but that's incompatible with `@langchain/core@1.x`; using `^1.3.0`
- **`stream()` is intentionally non-looping** — documented in README as "Stream the first LLM turn (non-looping)"; a full `streamLoop()` would be a new feature requiring a new spec
