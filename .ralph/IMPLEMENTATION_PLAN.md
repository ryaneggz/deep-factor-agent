# Implementation Plan — Phase 0011

**Generated:** 2026-02-27
**Branch:** `ryaneggz/4-parallel-tool-calling`
**Baseline:** 284 tests passing (174 agent, 110 CLI), type-check clean

## Status: COMPLETE

## Primary Deliverable: Fix P2.1 — interruptOn dangling tool_call event

---

### P0 — Bug Fix: interruptOn orphaned tool_call (P2.1) — DONE

- [x] Fixed in `packages/deep-factor-agent/src/agent.ts` (~line 450-467)
  - Root cause: When `interruptOn` skipped a tool, a `tool_call` event was pushed to the thread but no matching `tool_result` event was created. This left an orphaned `AIMessage` with `tool_calls` that had no corresponding `ToolMessage`, producing an invalid message sequence that LLM APIs (OpenAI, Anthropic) would reject.
  - Fix: When `interruptOn` skips a tool, push a synthetic `tool_result` event with descriptive text `[Tool "X" not executed — interrupted for human approval]` and a matching `ToolMessage` to the local messages array. This ensures the message sequence is always structurally valid.
  - Why: LLM APIs require every `tool_call` in an `AIMessage` to have a matching `ToolMessage` response before the next user turn. Without this fix, both the inner-loop re-invocation and `buildMessages()` on resume produced malformed sequences.
- [x] Updated 2 existing tests in `agent.test.ts` to expect synthetic tool_result events
- [x] Added new test in `human-in-the-loop.test.ts`: "produces valid message sequence on resume" — validates every tool_call ID has a matching ToolMessage in the messages sent to the model on resume

### P1 — Validation — DONE

- [x] Type-check passes — `pnpm -C packages/deep-factor-agent type-check`
- [x] All 284 tests pass — `pnpm -r test` (174 agent, 110 CLI)

---

### P2 — Known Issues (Backlog)

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
- [x] Phase 0011: Fix P2.1 — interruptOn orphaned tool_call event + 1 new test (283 → 284 tests)
