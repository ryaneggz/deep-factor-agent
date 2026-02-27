# Implementation Plan — Phase 0012

**Generated:** 2026-02-27
**Branch:** `ryaneggz/4-parallel-tool-calling`
**Baseline:** 287 tests passing (177 agent, 110 CLI), type-check clean

## Status: COMPLETE

## Primary Deliverable: Fix P2.2 — Summarization token usage invisible to stop conditions

---

### P0 — Bug Fix: Summarization token usage (P2.2) — DONE

- [x] Fixed in `packages/deep-factor-agent/src/context-manager.ts`
  - Root cause: `ContextManager.summarize()` called `model.invoke()` internally (once per old iteration needing summarization) but discarded the response's `usage_metadata`. The token usage from these LLM calls was never returned to the caller.
  - Fix: Changed `summarize()` return type from `Promise<AgentThread>` to `Promise<{ thread: AgentThread; usage: TokenUsage }>`. Each internal `model.invoke()` response's `usage_metadata` is now extracted and accumulated into a `totalUsage` object that is returned alongside the thread.
  - Why: Stop conditions (`maxTokens`, `maxInputTokens`, `maxOutputTokens`, `maxCost`) rely on `totalUsage` to enforce budget limits. Without tracking summarization costs, long-running agents with context compaction could silently exceed their configured budget. This is especially significant because summarization calls can be frequent (one per old iteration) and process large context windows.
- [x] Fixed in `packages/deep-factor-agent/src/agent.ts` (~line 370-374)
  - Captures the `usage` from `summarize()` and merges it into `totalUsage` via `addUsage()`.
- [x] Updated 3 existing tests in `context-manager.test.ts` to use new `{ thread, usage }` return type
- [x] Added 3 new tests:
  - `context-manager.test.ts`: "returns accumulated token usage from summarization calls" — verifies correct usage accumulation across multiple summarize calls with known `usage_metadata`
  - `context-manager.test.ts`: "returns zero usage when model has no usage_metadata" — verifies graceful handling when model doesn't report usage
  - `agent.test.ts`: "includes summarization token usage in totalUsage" — end-to-end test verifying summarization usage flows through to the final `AgentResult.usage`

### P1 — Validation — DONE

- [x] Type-check passes — `pnpm -r type-check`
- [x] All 287 tests pass — `pnpm -r test` (177 agent, 110 CLI)

---

### P2 — Known Issues

- [x] ~~P2.2 — Summarization token usage invisible to stop conditions~~ — RESOLVED in Phase 0012
- [ ] P2.3 — `stream()` is an incomplete thin wrapper — `packages/deep-factor-agent/src/agent.ts`
  - Severity: Low. Single-shot stream only; no tool loop, events, stop conditions, HITL, or verification. Documented limitation per Phase 0009 decision.

---

### P3 — Quality Improvements

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
- [x] Phase 0011: Fix P2.1 — interruptOn orphaned tool_call event + 1 new test (283 → 284 tests)
- [x] Phase 0012: Fix P2.2 — Summarization token usage tracked in stop conditions + 3 new tests (284 → 287 tests)
