# Implementation Plan

> Generated: 2026-02-27
> Branch: `ryaneggz/4-parallel-tool-calling`
> Status: SPEC-01 **COMPLETE**, SPEC-02/03/04 unimplemented.

---

## Priority 1 — SPEC-01: ModelAdapter Interface + Claude CLI Provider

**Dependency**: None (foundation for SPEC-02, SPEC-04)
**Status**: COMPLETE — 17/17 acceptance criteria met

### Implementation Notes

- `src/providers/types.ts` — `ModelAdapter` interface + `isModelAdapter()` type guard (discriminates via `_generate` absence)
- `src/providers/claude-cli.ts` — `createClaudeCliProvider()` factory with `execFileAsync`, `messagesToPrompt`, `parseToolCalls`, `TOOL_CALL_FORMAT`
- `src/types.ts` — `model` union widened to `BaseChatModel | ModelAdapter | string`
- `src/agent.ts` — `ensureModel()` returns `BaseChatModel | ModelAdapter`, `extractModelId` guarded with `isModelAdapter`, `stream()` throws for `ModelAdapter`, summarization skipped for `ModelAdapter`
- `src/context-manager.ts` — `summarize()` param widened to `BaseChatModel | ModelAdapter`
- `src/index.ts` — exports `ModelAdapter`, `isModelAdapter`, `createClaudeCliProvider`, `ClaudeCliProviderOptions`
- `__tests__/providers/claude-cli.test.ts` — 20 tests covering all acceptance criteria
- All existing test mocks updated with `_generate: vi.fn()` to properly simulate `BaseChatModel`

### Resolved Caveats

- **`stream()`**: Runtime check throws "Streaming is not supported for ModelAdapter providers. Use loop() instead."
- **`context-manager.ts` summarize**: Type widened; summarization skipped in agent loop when model is `ModelAdapter` (CLI providers can't summarize)
- **P5.2 fixed**: `context-manager.ts` now uses the same `"usage_metadata" in response` guard as `agent.ts`

---

## Priority 2 — SPEC-02: Codex CLI Provider

**Dependency**: SPEC-01 (COMPLETE)
**Status**: NOT STARTED — 0/11 acceptance criteria met

### Tasks

- [ ] Create `packages/deep-factor-agent/src/providers/codex-cli.ts`
  - `CodexCliProviderOptions` interface (`model?`, `cliPath?`, `timeout?`, `maxBuffer?`)
  - Reuse pattern from `claude-cli.ts` (duplicated `messagesToPrompt`, `parseToolCalls`, `execFileAsync`, `TOOL_CALL_FORMAT` — intentional per Rule of Three)
  - `createCodexCliProvider()` factory returning `ModelAdapter`
  - CLI invocation: `codex exec <prompt> --full-auto --sandbox read-only` with optional `--model` flag
  - Key difference from Claude: `["exec", prompt, "--full-auto", "--sandbox", "read-only"]` vs `["-p", prompt, "--no-input"]`

- [ ] Modify `packages/deep-factor-agent/src/index.ts`
  - Export `createCodexCliProvider`, `CodexCliProviderOptions` (type)

- [ ] Create `packages/deep-factor-agent/__tests__/providers/codex-cli.test.ts`
  - Same test pattern as Claude CLI test
  - Test: calls `codex exec` with `--full-auto --sandbox read-only`
  - Test: passes `--model` flag
  - Test: custom `cliPath`
  - Test: error propagation
  - Test: tool call parsing
  - Test: plain text response
  - Test: tool definition injection

---

## Priority 3 — SPEC-03: Test Logging Infrastructure

**Dependency**: None (independent of SPEC-01/02)
**Status**: NOT STARTED — 0/11 acceptance criteria met

### Tasks

- [ ] Create `packages/deep-factor-agent/src/test-logger.ts`
  - `TestResult` interface: `{ name, status: "passed"|"failed"|"skipped", duration, error? }`
  - `TestSuiteLog` interface: `{ suite, timestamp, passed, failed, skipped, duration, tests }`
  - `TestLoggerOptions` interface: `{ logDir? }`
  - `writeTestLog(suiteLog, options?)` — creates `./logs/` dir, writes JSON with filename `agent-<timestamp>-<suite>.json`
  - `buildTestSuiteLog(suite, tests, totalDuration)` — counts pass/fail/skip from test array

- [ ] Create `packages/deep-factor-agent/vitest.setup.ts`
  - Custom Vitest reporter implementing `onFinished(files?)`
  - Iterates over test files, maps tasks to `TestResult[]`, calls `writeTestLog`

- [ ] Modify `packages/deep-factor-agent/vitest.config.ts`
  - Add `reporters: ["default", "./vitest.setup.ts"]` to test config
  - Existing config has `include`, `passWithNoTests`, `coverage` — only add `reporters`

- [ ] Modify `.gitignore`
  - Add `logs/` (currently only `.ralph/logs/` exists)

- [ ] Create `packages/deep-factor-agent/__tests__/test-logger.test.ts`
  - Test: `buildTestSuiteLog` counts passed/failed/skipped
  - Test: `writeTestLog` creates dir and writes JSON file
  - Test: suite name sanitized in filename
  - Test: JSON file is parseable with correct structure

---

## Priority 4 — SPEC-04: Example 14 — Claude/Codex CLI Delegation Demo

**Dependency**: SPEC-01 (COMPLETE) + SPEC-02 (NOT STARTED)
**Status**: NOT STARTED — 0/7 acceptance criteria met

### Tasks

- [ ] Create `packages/deep-factor-agent/examples/14-claude-codex-delegation.ts`
- [ ] Modify `packages/deep-factor-agent/examples/README.md`

---

## Priority 5 — Code Quality Issues (discovered during audit)

### P5.1 — HIGH: Silent tool-not-found drop (`agent.ts:500-538`)

- **Issue**: When the model calls a tool name not in `toolMap`, the call is silently dropped — no `ToolMessage` appended, no error event. This leaves the LangChain message sequence inconsistent.
- **Fix**: Add an `else` branch that pushes a `ToolResultEvent` with an error message and appends a `ToolMessage`.

### P5.2 — FIXED

- Fixed as part of SPEC-01 implementation. `context-manager.ts` now uses `"usage_metadata" in response` guard consistent with `agent.ts`.

### P5.3 — LOW: Dead `verbose` prop in `useAgent` hook

- **Issue**: `UseAgentOptions.verbose` declared but never read. Dead API surface.
- **Fix**: Remove the prop or implement verbose logging.

---

## Implementation Order Summary

```
SPEC-01 (ModelAdapter + Claude CLI) ── DONE
                                       ├──→ SPEC-04 (Example 14)
SPEC-02 (Codex CLI, depends on 01) ──┘

SPEC-03 (Test Logging) ──────────────────→ Independent, can parallel with 02

P5.1, P5.3 (Quality fixes) ────────────→ Independent, can be done anytime
```
