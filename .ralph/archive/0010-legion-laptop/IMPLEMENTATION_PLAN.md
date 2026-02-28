# Implementation Plan — Phase 0016

**Generated:** 2026-02-27
**Branch:** `ryaneggz/4-parallel-tool-calling`
**Baseline:** 301 tests passing (182 agent, 119 CLI), type-check clean

## Status: COMPLETE

## Primary Deliverables: P4.2 — Async bash tool + P4.7 — Terminal-width StatusBar separator

---

### P0 — Deliverable (Phase 0016) — DONE

- [x] P4.2 — `bash` tool uses synchronous `execSync` (blocks event loop) — `packages/deep-factor-cli/src/tools/bash.ts`
  - Root cause: `execSync` from `node:child_process` blocks the entire Node.js event loop for up to 30 seconds while the subprocess runs. Ink's React render loop, timers, I/O callbacks, and other promises all freeze — the terminal UI appears stuck/unresponsive during bash command execution.
  - Fix: Replaced `execSync` with async `exec` (callback-based `node:child_process.exec` wrapped in a manual Promise via `execAsync` helper). Same options preserved (`encoding: 'utf8'`, `timeout: 30_000`, `maxBuffer: 1MB`). Error propagation unchanged — exec errors (non-zero exit, timeout, maxBuffer exceeded) reject the promise with the same error objects.
  - Why: The CLI's bash tool is the only tool that runs external processes. Blocking the event loop prevents Ink from rendering spinner updates, status bar changes, or handling user input (Ctrl+C). With async exec, the UI remains responsive while commands run.
  - Tests: Updated all 14 existing tests to mock `node:child_process.exec` (callback-based) instead of `execSync`. Added 1 new test verifying async execution (deferred callback via `Promise.resolve().then()`). Total: 15 bash tests.

- [x] P4.7 — StatusBar separator not terminal-width-aware — `packages/deep-factor-cli/src/components/StatusBar.tsx`
  - Fix: Changed `"─".repeat(50)` to `"─".repeat(process.stdout.columns || 50)`. Falls back to 50 when `process.stdout.columns` is unavailable (piped output, non-TTY).
  - Why: The hardcoded 50-char separator looked wrong on terminals wider or narrower than 50 columns.
  - Tests: Added 2 new tests — one verifying the separator uses terminal width (80 cols), one verifying fallback to 50 when columns is undefined. Total: 5 StatusBar tests.

### P1 — Validation — DONE

- [x] Type-check passes — `pnpm -r type-check`
- [x] All 304 tests pass — `pnpm -r test` (182 agent, 122 CLI)

---

### P2 — Known Issues

- [ ] P2.3 — `stream()` is an incomplete thin wrapper — `packages/deep-factor-agent/src/agent.ts`
  - Severity: Low. Single-shot stream only; no tool loop, events, stop conditions, HITL, or verification. Documented limitation per Phase 0009 decision.

---

### P4 — Deferred / Low Priority (Backlog)

- [ ] P4.1 — Full streaming agent loop (implement `stream()` as full agentic loop)
- [ ] P4.3 — `zod` is peer-only but required at runtime — `packages/deep-factor-agent/package.json`
- [ ] P4.4 — `@langchain/openai` is unconditional runtime dependency — `packages/deep-factor-agent/package.json`
- [ ] P4.5 — Model pricing table may be stale (missing newer model IDs) — `packages/deep-factor-agent/src/stop-conditions.ts`
- [ ] P4.6 — No CI coverage integration or thresholds
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
- [x] Phase 0016: P4.2 — Async bash tool + P4.7 — Terminal-width StatusBar separator + 3 new tests (301 → 304 tests)
