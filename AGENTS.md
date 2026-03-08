## Build & Run

- Package manager: `pnpm` (install globally with `npm install -g pnpm` if needed)
- Install all: `pnpm install` (from root — workspace resolves both packages)
- Build all: `pnpm -r build`

### Agent Package (deep-factor-agent)

- Install deps: `pnpm -C packages/deep-factor-agent install`
- Build: `pnpm -C packages/deep-factor-agent build` (runs `tsc`)
- Dev mode: `pnpm -C packages/deep-factor-agent dev` (runs `tsc --watch`)

### TUI Package (deep-factor-tui)

- Install deps: `pnpm -C packages/deep-factor-tui install`
- Build: `pnpm -C packages/deep-factor-tui build` (runs `tsc` + postbuild shebang)
- Dev mode: `pnpm -C packages/deep-factor-tui dev` (runs `tsc --watch`)
- Run: `deepfactor` (interactive TUI)
- Run: `deepfactor "Explain how React hooks work"` (with prompt)
- Run: `deepfactor -p "What is 2+2?"` (print mode)
- Run: `deepfactor -s local "Run system commands"` (local sandbox)
- Run: `cat PROMPT.md | deepfactor -p` (stdin pipe)

## Validation

- Tests (agent): `pnpm -C packages/deep-factor-agent test`
- Tests (TUI): `pnpm -C packages/deep-factor-tui test`
- Tests (all): `pnpm -r test`
- Typecheck (agent): `pnpm -C packages/deep-factor-agent type-check`
- Typecheck (TUI): `pnpm -C packages/deep-factor-tui type-check`
- Typecheck (all): `pnpm -r type-check`

## Operational Notes

- ESM only (`"type": "module"` in all packages)
- LangChain `BaseChatModel` is the model type; `initChatModel` resolves string IDs lazily
- Tools use LangChain `tool()` factory from `@langchain/core/tools` — returns `StructuredToolInterface`
- Messages use LangChain classes: `HumanMessage`, `AIMessage`, `SystemMessage`, `ToolMessage`
- Agent loop manually handles tool calling (bind tools, invoke, check tool_calls, execute, loop)
- Token usage from `response.usage_metadata` (`input_tokens`, `output_tokens`, `total_tokens`)
- TUI uses Ink (inline rendering via <Static> + React) with meow

### Agent Codebase Patterns

- All types in `packages/deep-factor-agent/src/types.ts`, re-exported from `packages/deep-factor-agent/src/index.ts`
- Stop condition factories in `packages/deep-factor-agent/src/stop-conditions.ts`
- Middleware system in `packages/deep-factor-agent/src/middleware.ts` (composeMiddleware, todoMiddleware, errorRecoveryMiddleware)
- Agent loop in `packages/deep-factor-agent/src/agent.ts` (DeepFactorAgent class with loop() and stream())
- Context management in `packages/deep-factor-agent/src/context-manager.ts` (ContextManager, estimateTokens)
- Factory function in `packages/deep-factor-agent/src/create-agent.ts` (createDeepFactorAgent)
- Human-in-the-loop in `packages/deep-factor-agent/src/human-in-the-loop.ts` (requestHumanInput tool)
- Tool adapter utilities in `packages/deep-factor-agent/src/tool-adapter.ts` (createLangChainTool, findToolByName, toolArrayToMap)
- Tests in `packages/deep-factor-agent/__tests__/*.test.ts`

### TUI Codebase Patterns

- Entry point: `packages/deep-factor-tui/src/cli.tsx` (meow + ink.render)
- App shell: `packages/deep-factor-tui/src/app.tsx` (<Static> for header/messages scrollback + <LiveSection> for active UI)
- Agent hook: `packages/deep-factor-tui/src/hooks/useAgent.ts` (React state bridge)
- Text input hook: `packages/deep-factor-tui/src/hooks/useTextInput.ts` (cursor input handling)
- Components: `packages/deep-factor-tui/src/components/` (Header, LiveSection, MessageBubble, ToolCallBlock, InputBar, StatusLine)
- Bash tool: `packages/deep-factor-tui/src/tools/bash.ts` (createBashTool factory, --sandbox flag: workspace|local|docker)
- TUI types: `packages/deep-factor-tui/src/types.ts` (TuiAppProps, ChatMessage, AgentStatus)
- Tests: `packages/deep-factor-tui/__tests__/` (components, integration, e2e)

### Huntley Layout

- `.huntley/loop.sh` — build/plan loop driver
- `.huntley/format-log.sh` — stream-json → markdown formatter
- `.huntley/review-log.sh` — log viewer
- `.huntley/archive.sh` — archive current phase
- `.huntley/PROMPT_plan.md` — plan-mode prompt
- `.huntley/PROMPT_build.md` — build-mode prompt
- `.huntley/IMPLEMENTATION_PLAN.md` — current phase plan
- `.huntley/specs/` — feature specifications
- `.huntley/logs/` — session logs
- `.huntley/archive/` — archived phases
