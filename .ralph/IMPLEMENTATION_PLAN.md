# Implementation Plan — Phase 0013

**Generated:** 2026-02-27
**Branch:** `ryaneggz/4-parallel-tool-calling`
**Baseline:** 288 tests passing (178 agent, 110 CLI), type-check clean

## Status: COMPLETE

## Primary Deliverable: Quality improvements P3.2, P3.3, P3.6, P3.7

---

### P0 — Quality Fixes (Phase 0013) — DONE

- [x] P3.2 — `calculateCost` warns on unknown models — `packages/deep-factor-agent/src/stop-conditions.ts`
  - Root cause: `calculateCost()` silently returned 0 for models not in `MODEL_PRICING`. This meant `maxCost` stop conditions could never trigger for unknown model IDs, allowing unbounded spend.
  - Fix: Added a `warnedModels` Set and `console.warn()` on first encounter of an unknown model. Warning fires once per unique model ID to avoid log spam. Still returns 0 (changing to throw would break existing usage).
  - Why: Users relying on `maxCost` stop conditions need to know when their model isn't recognized — otherwise budget enforcement silently fails.
  - Test: "warns once per unknown model (not on every call)" — verifies `console.warn` fires exactly once per unique model, with correct message content.

- [x] P3.3 — `findToolByName` O(n*m) → O(1) lookup — `packages/deep-factor-agent/src/agent.ts`
  - Root cause: `findToolByName(allTools, tc.name)` called on every tool call inside the inner loop, doing a linear scan of the tools array each time. With N tool calls and M tools, this was O(N*M) per step.
  - Fix: Replaced `findToolByName` import with `toolArrayToMap`. Build `toolMap = toolArrayToMap(allTools)` once before the loop, then use `toolMap[tc.name]` for O(1) lookups.
  - Why: In agents with many tools (10+) processing many tool calls per iteration, linear scans add unnecessary overhead. The `toolArrayToMap` utility already existed but wasn't being used.

- [x] P3.6 — `eventsToChatMessages` exported from CLI `index.ts` — `packages/deep-factor-cli/src/index.ts`
  - Fix: Added `eventsToChatMessages` to the named export from `./hooks/useAgent.js`.
  - Why: The function was defined and tested but not part of the CLI's public API surface, limiting reuse.

- [x] P3.7 — Barrel export test complete — `packages/deep-factor-agent/__tests__/create-agent.test.ts`
  - Fix: Added assertions for 5 missing exports: `TOOL_NAME_WRITE_TODOS`, `requestHumanInputSchema`, `TOOL_NAME_REQUEST_HUMAN_INPUT`, `serializeThreadToXml`, `escapeXml`.
  - Why: Barrel export tests catch accidental removal of public API surface. Missing assertions meant these exports could be dropped without test failure.

### P1 — Validation — DONE

- [x] Type-check passes — `pnpm -r type-check`
- [x] All 288 tests pass — `pnpm -r test` (178 agent, 110 CLI)

---

### P2 — Known Issues

- [ ] P2.3 — `stream()` is an incomplete thin wrapper — `packages/deep-factor-agent/src/agent.ts`
  - Severity: Low. Single-shot stream only; no tool loop, events, stop conditions, HITL, or verification. Documented limitation per Phase 0009 decision.

---

### P3 — Quality Improvements

- [ ] P3.1 — `XmlSerializerOptions.responsePrefix` naming is misleading — `packages/deep-factor-agent/src/xml-serializer.ts`
- [ ] P3.4 — CLI `useAgent` creates new agent per prompt (no multi-turn memory) — `packages/deep-factor-cli/src/hooks/useAgent.ts`
- [ ] P3.5 — CLI `HumanInput` and `PromptInput` duplicate `useInput` logic — `packages/deep-factor-cli/src/components/`

---

### P4 — Deferred / Low Priority (Backlog)

- [ ] P4.1 — Full streaming agent loop (implement `stream()` as full agentic loop)
- [ ] P4.2 — `bash` tool uses synchronous `execSync` (blocks event loop) — `packages/deep-factor-cli/src/tools/bash.ts`
- [ ] P4.3 — `zod` is peer-only but required at runtime — `packages/deep-factor-agent/package.json`
- [ ] P4.4 — `@langchain/openai` is unconditional runtime dependency — `packages/deep-factor-agent/package.json`
- [ ] P4.5 — Model pricing table may be stale (missing newer model IDs) — `packages/deep-factor-agent/src/stop-conditions.ts`
- [ ] P4.6 — No CI coverage integration or thresholds
- [ ] P4.7 — StatusBar separator not terminal-width-aware — `packages/deep-factor-cli/src/components/StatusBar.tsx`
- [ ] P4.8 — CLI `HumanInput` has no Ctrl+C/escape cancel — `packages/deep-factor-cli/src/components/HumanInput.tsx`

---

## Completed (Previous Phases)

- [x] Phase 0001: Project setup, core types, agent loop, stop conditions, middleware, factory, context management, HITL
- [x] Phase 0002: README and documentation
- [x] Phase 0003: Replace AI SDK with LangChain
- [x] Phase 0004: OpenAI default model, examples 01-09
- [x] Phase 0005: Loop/log readability improvements
- [x] Phase 0006: CLI package scaffold (pnpm workspace, Ink components, bash tool, tests)
- [x] Phase 0007: Testing & coverage (139 -> 245 tests, component tests, hook tests)
- [x] Phase 0008: XML thread serialization, buildMessages() retention fix, examples 10-11 (245 -> 283 tests)
- [x] Phase 0009: SPEC-01 — Example 12 — Interactive HITL with Multiple Choice (283 tests maintained)
- [x] Phase 0010: SPEC-02 — Example 13 — Parallel Tool Calling + PromptInput stale closure fix (283 tests maintained)
- [x] Phase 0011: Fix P2.1 — interruptOn orphaned tool_call event + 1 new test (283 → 284 tests)
- [x] Phase 0012: Fix P2.2 — Summarization token usage tracked in stop conditions + 3 new tests (284 → 287 tests)
- [x] Phase 0013: Quality fixes P3.2, P3.3, P3.6, P3.7 + 1 new test (287 → 288 tests)
