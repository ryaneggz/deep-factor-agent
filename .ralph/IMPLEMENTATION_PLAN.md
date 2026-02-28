# Implementation Plan

> Generated: 2026-02-27
> Branch: `ryaneggz/4-parallel-tool-calling`
> Status: ALL SPECS COMPLETE. All quality fixes applied.

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
**Status**: COMPLETE — 11/11 acceptance criteria met

### Implementation Notes

- `src/providers/codex-cli.ts` — `createCodexCliProvider()` factory, mirrors Claude CLI structure with Codex-specific args: `codex exec <prompt> --full-auto --sandbox read-only`
- `src/index.ts` — exports `createCodexCliProvider`, `CodexCliProviderOptions`
- `__tests__/providers/codex-cli.test.ts` — 14 tests covering all acceptance criteria

---

## Priority 3 — SPEC-03: Test Logging Infrastructure

**Dependency**: None
**Status**: COMPLETE — 11/11 acceptance criteria met

### Implementation Notes

- `src/test-logger.ts` — `writeTestLog()`, `buildTestSuiteLog()`, type interfaces
- `vitest.setup.ts` — Custom Vitest 4 reporter using `onTestRunEnd()` (not `onFinished`, which was removed in v4)
- `vitest.config.ts` — `reporters: ["default", "./vitest.setup.ts"]`
- `.gitignore` — Added `logs/`
- `__tests__/test-logger.test.ts` — 8 unit tests
- Vitest 4 reporter API: uses `onTestRunEnd(testModules)` with recursive `collectTests()` for nested describe blocks; results via `child.result()` method

---

## Priority 4 — SPEC-04: Example 14 — Claude/Codex CLI Delegation Demo

**Dependency**: SPEC-01 (COMPLETE) + SPEC-02 (COMPLETE)
**Status**: COMPLETE — 7/7 acceptance criteria met

### Implementation Notes

- `examples/14-claude-codex-delegation.ts` — Non-interactive demo with `--provider claude|codex` flag, uses `calculator` and `get_current_time` tools
- `examples/README.md` — Added Example 14 to running commands and overview table

---

## Priority 5 — Code Quality Issues (discovered during audit)

### P5.1 — FIXED: Silent tool-not-found drop (`agent.ts`)

- **Issue**: When the model calls a tool name not in `toolMap`, the call was silently dropped.
- **Fix**: Added `else` branch that pushes `ToolResultEvent` with error message and appends `ToolMessage` with `"Tool not found: ..."` content.

### P5.2 — FIXED

- Fixed as part of SPEC-01 implementation. `context-manager.ts` now uses `"usage_metadata" in response` guard consistent with `agent.ts`.

### P5.3 — FIXED: Dead `verbose` prop in `useAgent` hook

- **Issue**: `UseAgentOptions.verbose` declared but never read. Dead API surface.
- **Fix**: Removed `verbose` from `UseAgentOptions` in `packages/deep-factor-cli/src/types.ts` and removed its usage from `app.tsx`.

---

## Implementation Order Summary

```
SPEC-01 (ModelAdapter + Claude CLI) ── DONE (v0.0.28)
                                       ├──→ SPEC-04 (Example 14) ── DONE (v0.0.31)
SPEC-02 (Codex CLI, depends on 01) ──┘    DONE (v0.0.29)

SPEC-03 (Test Logging) ──────────────────→ DONE (v0.0.30)

P5.1, P5.2, P5.3 (Quality fixes) ───────→ DONE (P5.2 in v0.0.28, P5.1+P5.3 in v0.0.31)
```
