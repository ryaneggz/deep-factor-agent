# Implementation Plan — deep-factor-cli

> Last updated: 2026-02-24
> Agent library (`packages/deep-factor-agent`): **COMPLETE** — 129/129 tests passing, all source files implemented.
> CLI package (`packages/deep-factor-cli`): **COMPLETE** — 10/10 tests passing, all specs implemented.

---

## Current State Summary

The `deep-factor-agent` library is fully implemented with:
- Core agent loop with tool calling, verification, human-in-the-loop (`agent.ts`)
- Factory function with opinionated defaults (`create-agent.ts`)
- Stop conditions: maxIterations, maxTokens, maxInputTokens, maxOutputTokens, maxCost (`stop-conditions.ts`)
- Middleware system: composeMiddleware, todoMiddleware, errorRecoveryMiddleware (`middleware.ts`)
- Context management with auto-summarization (`context-manager.ts`)
- Human-in-the-loop pause/resume via sentinel tool pattern (`human-in-the-loop.ts`)
- Tool adapter utilities: createLangChainTool, toolArrayToMap, findToolByName (`tool-adapter.ts`)
- Full type system with discriminated union events (`types.ts`)
- 129 tests across 8 test files, all passing

The `deep-factor-cli` package is fully implemented with:
- pnpm workspace configuration at repo root
- CLI entry point with meow flags, Ink render (`src/cli.tsx`)
- App shell composing all components (`src/app.tsx`)
- useAgent hook with full lifecycle management (`src/hooks/useAgent.ts`)
- 6 Ink components: Chat, ToolCall, Spinner, StatusBar, HumanInput, PromptInput
- Bash tool using createLangChainTool (`src/tools/bash.ts`)
- 10 tests across 3 test files (Chat, StatusBar, App integration), all passing
- Makefile CLI and workspace targets, updated AGENTS.md

**Implementation notes:**
- CLI package required `zod` as a direct dependency and `@types/node` as a devDependency (not in original spec)
- `AgentTools` type is derived from `NonNullable<DeepFactorAgentSettings["tools"]>` to avoid direct `@langchain/core` import from CLI

---

## Completed Specs

### SPEC-01: pnpm Workspace Conversion ✅
- Created `/pnpm-workspace.yaml` with `packages: ["packages/*"]`
- Created root `/package.json` (private, workspace scripts: `build`, `test`, `type-check` using `pnpm -r`)
- Removed `packages/deep-factor-agent/pnpm-lock.yaml`
- Root `pnpm-lock.yaml` generated
- Generalized `/.gitignore` with global patterns; root `pnpm-lock.yaml` not ignored

### SPEC-02: CLI Package Scaffold ✅
- Created `packages/deep-factor-cli/package.json` with all required deps and devDeps
- Created `packages/deep-factor-cli/tsconfig.json`
- Created `packages/deep-factor-cli/vitest.config.ts`
- Created `packages/deep-factor-cli/scripts/postbuild.js` (shebang + chmod 755)
- All source files and directories created

### SPEC-03: CLI Entry & App Shell ✅
- Implemented `src/cli.tsx` with meow flags: `--model`, `--max-iter`, `--verbose`, `--bash`, `--interactive`
- Implemented `src/app.tsx` composing all components

### SPEC-04: useAgent Hook ✅
- Implemented `src/hooks/useAgent.ts` with full lifecycle management
- Handles all AgentEvent types, pending input, token accumulation, re-entrant sendPrompt()

### SPEC-05: Ink Components ✅
- **Chat** (`src/components/Chat.tsx`)
- **ToolCall** (`src/components/ToolCall.tsx`)
- **Spinner** (`src/components/Spinner.tsx`)
- **StatusBar** (`src/components/StatusBar.tsx`)
- **HumanInput** (`src/components/HumanInput.tsx`)
- **PromptInput** (`src/components/PromptInput.tsx`)

### SPEC-06: Bash Tool ✅
- Implemented `src/tools/bash.ts` using `createLangChainTool`
- Schema: `{ command: z.string() }`, execSync with 30s timeout, 1MB buffer

### SPEC-07: Testing ✅
- `__tests__/components/Chat.test.tsx` — 3 tests passing
- `__tests__/components/StatusBar.test.tsx` — 3 tests passing
- `__tests__/app.test.tsx` — 4 tests passing
- All 10 CLI tests passing

### SPEC-08: Makefile & Docs ✅
- Added CLI targets: `install-cli`, `build-cli`, `dev-cli`, `test-cli`, `type-check-cli`
- Added workspace targets: `install-all`, `build-all`, `test-all`, `check-all`
- Updated AGENTS.md with CLI and workspace documentation

---

## Agent Library — Minor Issues (low priority, non-blocking)

These are defects/gaps in `packages/deep-factor-agent` that do not block CLI development but should be addressed:

- [ ] **Dead code:** `isPendingHumanInput()` private method in `agent.ts:237` is defined but never called — remove or use it
- [ ] **Missing model pricing:** `MODEL_PRICING` in `stop-conditions.ts` lacks entries for `claude-sonnet-4-6` and `claude-opus-4-6` — `maxCost()` silently no-ops for these models
- [ ] **`stream()` limitation:** `DeepFactorAgent.stream()` does not loop, execute tools, or use context management — it is a single LLM call wrapper, which may surprise consumers expecting an agentic stream (document or enhance)
- [ ] **`interruptOn` edge case:** When a tool is in `interruptOn`, the inner loop uses `continue` (not `break`), so other tool calls in the same batch still execute before the interrupt check — potentially unexpected behavior
- [ ] **Conditional test assertion:** `agent.test.ts` context-summarization test uses `if (systemMessages.length > 0)` which silently passes if no SystemMessage is injected — strengthen this assertion
