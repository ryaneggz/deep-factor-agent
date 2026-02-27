# Implementation Plan — Phase 0015

**Generated:** 2026-02-27
**Branch:** `ryaneggz/4-parallel-tool-calling`
**Baseline:** 295 tests passing (178 agent, 117 CLI), type-check clean

## Status: COMPLETE

## Primary Deliverables: P3.4 — Multi-turn CLI memory + P3.1 — assistantPrefill rename

---

### P0 — Deliverable (Phase 0015) — DONE

- [x] P3.4 — CLI `useAgent` creates new agent per prompt (no multi-turn memory) — `packages/deep-factor-cli/src/hooks/useAgent.ts`
  - Root cause: Each `sendPrompt()` call created a fresh `DeepFactorAgent` and `AgentThread`. Cross-prompt context was lost because the thread (which is the single source of truth for conversation history) was discarded between calls.
  - Fix: Added `continueLoop(thread, prompt)` public method to `DeepFactorAgent` (`packages/deep-factor-agent/src/agent.ts`) that reuses an existing thread, computes the next iteration from the thread's max iteration, and pushes the new user message before entering `runLoop()`. Updated `useAgent` hook to persist the thread in a `useRef` across calls. On the first `sendPrompt()`, `loop()` is used (creates fresh thread). On subsequent calls, `continueLoop(threadRef.current, prompt)` is used, so the model sees full conversation history. Usage is now accumulated across turns via `addUsage()`.
  - Why: The CLI's interactive mode was functionally broken for multi-turn conversations — each prompt was treated as an independent session with no memory. `buildMessages()` already reconstructs the full LangChain message sequence from `thread.events`, so reusing the thread is all that's needed for multi-turn context.
  - Tests: 4 new agent tests in `__tests__/agent.test.ts` — thread reuse, iteration continuation, full history visibility, per-turn usage independence. 2 new CLI hook tests in `__tests__/hooks/useAgent.test.tsx` — `loop()` vs `continueLoop()` dispatch and usage accumulation.

- [x] P3.1 — `XmlSerializerOptions.responsePrefix` naming is misleading — `packages/deep-factor-agent/src/xml-serializer.ts`
  - Fix: Renamed `responsePrefix` to `assistantPrefill` in the interface, function body (both code paths), and both test cases. Updated JSDoc to say "assistant prefill nudge" instead of "response prefix / nudge".
  - Why: `responsePrefix` implied a prefix of the model's response, but the field is appended after the closing `</thread>` tag as a prefill nudge for the assistant turn. `assistantPrefill` accurately describes its purpose.

### P1 — Validation — DONE

- [x] Type-check passes — `pnpm -r type-check`
- [x] All 301 tests pass — `pnpm -r test` (182 agent, 119 CLI)

---

### P2 — Known Issues

- [ ] P2.3 — `stream()` is an incomplete thin wrapper — `packages/deep-factor-agent/src/agent.ts`
  - Severity: Low. Single-shot stream only; no tool loop, events, stop conditions, HITL, or verification. Documented limitation per Phase 0009 decision.

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
- [x] Phase 0014: P3.5 — Extract shared useTextInput hook + fix stale-closure bug + 7 new tests (288 → 295 tests)
- [x] Phase 0015: P3.4 — Multi-turn CLI memory + P3.1 — assistantPrefill rename + 6 new tests (295 → 301 tests)
