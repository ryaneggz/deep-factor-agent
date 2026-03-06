# Next Step: Commit & Create PR for Issue #13

## Context

The Claude Agent SDK provider (issue #13) is **feature-complete**. All 9 acceptance criteria are met:

- Provider adapter at `src/providers/claude-agent-sdk.ts` (511 lines)
- Works with `createDeepFactorAgent` via `ModelAdapter` interface
- SDK tool calls map to LangChain `tool_calls` format
- SDK messages map to LangChain `AIMessage` types
- Streaming correctly throws (unsupported for `ModelAdapter` by design)
- All 338 tests pass (including 3 live smoke tests)
- Comprehensive test coverage (89 SDK-specific tests across 6 files)
- `pnpm -r type-check` passes with zero errors
- README documents the provider with usage examples and options table

Additionally, error surfacing and TUI integration work done in this session:
- Error messages now appear in `stopDetail` and TUI chat
- Smoke test infrastructure fixed (dotenv, env var cleanup, auth guard)
- `isAssistantMessage()` fixed to handle SDK's wrapped message format
- Provider switching (`--provider claude-sdk`) works in TUI

## Plan

### Step 1 — Commit all uncommitted changes

Stage all modified and new files (13 modified + 4 new):

**Modified:**
- `packages/deep-factor-agent/__tests__/agent.test.ts`
- `packages/deep-factor-agent/package.json`
- `packages/deep-factor-agent/src/agent.ts`
- `packages/deep-factor-agent/src/providers/claude-agent-sdk.ts`
- `packages/deep-factor-tui/__tests__/app.test.tsx`
- `packages/deep-factor-tui/__tests__/components.test.tsx`
- `packages/deep-factor-tui/__tests__/print.test.ts`
- `packages/deep-factor-tui/src/app.tsx`
- `packages/deep-factor-tui/src/cli.tsx`
- `packages/deep-factor-tui/src/components/Header.tsx`
- `packages/deep-factor-tui/src/hooks/useAgent.ts`
- `packages/deep-factor-tui/src/print.ts`
- `packages/deep-factor-tui/src/types.ts`

**New:**
- `packages/deep-factor-agent/__tests__/claude-agent-sdk-smoke.test.ts`
- `packages/deep-factor-agent/__tests__/error-surfacing.test.ts`
- `packages/deep-factor-tui/__tests__/events-to-messages.test.ts`
- `packages/deep-factor-tui/MANUAL_TEST.md`

Commit message: "fix: surface error messages in agent loop and TUI, fix SDK adapter message parsing and smoke tests"

### Step 2 — Push branch

Push `feat/13-claude-agent-sdk` to origin.

### Step 3 — Create PR

Create PR against `master` with:
- Title: "feat: Add Claude Agent SDK as model provider (#13)"
- Body summarizing all work across the branch (US-001 through US-009 + error surfacing fixes)
- Reference issue #13 with "Closes #13"

## Verification

1. `pnpm -C packages/deep-factor-agent test` — 338 tests pass
2. `pnpm -C packages/deep-factor-tui test` — 48 tests pass
3. `pnpm -r type-check` — zero errors
