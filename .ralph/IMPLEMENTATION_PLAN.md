# Implementation Plan — Phase 0014

**Generated:** 2026-02-27
**Branch:** `ryaneggz/4-parallel-tool-calling`
**Baseline:** 295 tests passing (178 agent, 117 CLI), type-check clean

## Status: COMPLETE

## Primary Deliverable: P3.5 — Extract shared `useTextInput` hook + fix stale-closure bug

---

### P0 — Deliverable (Phase 0014) — DONE

- [x] P3.5 — CLI `HumanInput` and `PromptInput` duplicate `useInput` logic — `packages/deep-factor-cli/src/components/`
  - Root cause: Both `HumanInput.tsx` and `PromptInput.tsx` independently implemented the same 17-line `useInput` callback (character append, backspace, enter-to-submit). `HumanInput` used functional updaters (`prev => ...`) which avoids stale closure on append/backspace but still reads `input` directly in the `key.return` branch — a latent stale-closure bug. `PromptInput` used `useRef` correctly throughout.
  - Fix: Extracted `useTextInput` hook (`packages/deep-factor-cli/src/hooks/useTextInput.ts`) using the ref-based approach. Both components now call `useTextInput({ onSubmit })` and own only their UI layout. The hook is exported from `packages/deep-factor-cli/src/index.ts`.
  - Why: Single source of truth for text-input behavior. Eliminates the stale-closure bug in HumanInput's submit path. Future input components (e.g. Ctrl+C cancel per P4.8) only need to modify the hook.
  - Tests: 7 new tests in `__tests__/hooks/useTextInput.test.tsx` — accumulation, backspace, backspace-on-empty, submit-with-trim, empty-submit-noop, ctrl-ignore, and explicit stale-closure regression test. All 23 existing HumanInput + PromptInput tests pass unchanged.

### P1 — Validation — DONE

- [x] Type-check passes — `pnpm -r type-check`
- [x] All 295 tests pass — `pnpm -r test` (178 agent, 117 CLI)

---

### P2 — Known Issues

- [ ] P2.3 — `stream()` is an incomplete thin wrapper — `packages/deep-factor-agent/src/agent.ts`
  - Severity: Low. Single-shot stream only; no tool loop, events, stop conditions, HITL, or verification. Documented limitation per Phase 0009 decision.

---

### P3 — Quality Improvements

- [ ] P3.1 — `XmlSerializerOptions.responsePrefix` naming is misleading — `packages/deep-factor-agent/src/xml-serializer.ts`
  - `responsePrefix` is appended after `</thread>` as a prefill nudge but the name suggests it's a prefix of the response. Better name: `assistantPrefill`. Only used in tests — never consumed by the live agent loop. Rename requires updating the type, function, tests, and re-export.
- [ ] P3.4 — CLI `useAgent` creates new agent per prompt (no multi-turn memory) — `packages/deep-factor-cli/src/hooks/useAgent.ts`
  - Each `sendPrompt()` call creates a fresh `DeepFactorAgent` and `AgentThread`. Cross-prompt context is lost. Fix requires either a public `continueLoop(thread, prompt)` API on the agent, or persisting agent+thread refs across calls.

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
