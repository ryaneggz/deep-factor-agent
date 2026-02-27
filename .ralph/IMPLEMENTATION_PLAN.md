# Implementation Plan — Phase 0010

**Generated:** 2026-02-27
**Branch:** `ryaneggz/4-parallel-tool-calling`
**Baseline:** 283 tests passing (173 agent, 110 CLI), type-check clean, 0 TODOs/FIXMEs in source

## Status: COMPLETE

## Primary Deliverable: SPEC-02 — Example 13: Parallel Tool Calling

---

### P0 — Immediate (SPEC-02 Implementation) — DONE

- [x] Created `packages/deep-factor-agent/examples/13-parallel-tool-calls.ts` by forking Example 12
- [x] Added `performance` import from `node:perf_hooks`
- [x] Added `ParallelResult` interface and `executeToolsParallel()` helper function
- [x] Modified `runToolLoop()` to use parallel execution via `executeToolsParallel()`
- [x] Updated system prompt to encourage multi-tool responses
- [x] Updated banner text in `main()`
- [x] Updated `packages/deep-factor-agent/examples/README.md` with Example 13

### Bug Fix (discovered during validation)

- [x] Fixed stale closure bug in `packages/deep-factor-cli/src/components/PromptInput.tsx`
  - Root cause: `useInput` handler's `key.return` branch read `input` from the render closure, which could be stale when React hadn't yet committed the latest state update from a preceding character keystroke
  - Fix: Added `useRef` to track the latest input value synchronously, eliminating the stale closure race condition
  - This fixed the flaky "enter submits the input" test in `PromptInput.test.tsx`

---

### P1 — Validation — DONE

- [x] Build passes — `pnpm -C packages/deep-factor-agent build`
- [x] Type-check passes — `pnpm -C packages/deep-factor-agent type-check`
- [x] All 283 tests pass — `pnpm -r test` (173 agent, 110 CLI)
- [ ] Manual smoke test — `npx tsx examples/13-parallel-tool-calls.ts` (requires API key, deferred to user)

---

### P2 — Known Issues (Backlog, out of scope for this phase)

- [ ] P2.1 — `interruptOn` leaves dangling unmatched `tool_call` event — `packages/deep-factor-agent/src/agent.ts` (~line 421-454)
  - Severity: Medium. `buildMessages()` produces invalid message sequence after interrupt+resume (missing `ToolMessage` for interrupted tool). LLM APIs may reject.
- [ ] P2.2 — Summarization token usage invisible to stop conditions — `packages/deep-factor-agent/src/context-manager.ts` + `agent.ts`
  - Severity: Low-Medium. `ContextManager.summarize()` internal `model.invoke()` not tracked in `totalUsage`. Cost tracking inaccurate for long-running agents with summarization.
- [ ] P2.3 — `stream()` is an incomplete thin wrapper — `packages/deep-factor-agent/src/agent.ts`
  - Severity: Low. Single-shot stream only; no tool loop, events, stop conditions, HITL, or verification. Documented limitation per Phase 0009 decision.

---

### P3 — Quality Improvements (Backlog)

- [ ] P3.1 — `XmlSerializerOptions.responsePrefix` naming is misleading — `packages/deep-factor-agent/src/xml-serializer.ts`
- [ ] P3.2 — `calculateCost` silently returns 0 for unknown models — `packages/deep-factor-agent/src/stop-conditions.ts`
- [ ] P3.3 — `findToolByName` linear scan in hot loop — `packages/deep-factor-agent/src/agent.ts`
- [ ] P3.4 — CLI `useAgent` creates new agent per prompt (no multi-turn memory) — `packages/deep-factor-cli/src/hooks/useAgent.ts`
- [ ] P3.5 — CLI `HumanInput` and `PromptInput` duplicate `useInput` logic — `packages/deep-factor-cli/src/components/`
- [ ] P3.6 — CLI `eventsToChatMessages` not exported from `index.ts` — `packages/deep-factor-cli/src/index.ts`
- [ ] P3.7 — Barrel export test incomplete — `packages/deep-factor-agent/__tests__/create-agent.test.ts`

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
