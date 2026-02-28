## Build & Run

- Package manager: `pnpm` (install globally with `npm install -g pnpm` if needed)
- Install all: `pnpm install` (from root — workspace resolves both packages)
- Build all: `pnpm -r build`

### Agent Package (deep-factor-agent)

- Install deps: `pnpm -C packages/deep-factor-agent install`
- Build: `pnpm -C packages/deep-factor-agent build` (runs `tsc`)
- Dev mode: `pnpm -C packages/deep-factor-agent dev` (runs `tsc --watch`)

### CLI Package (deep-factor-cli)

- Install deps: `pnpm -C packages/deep-factor-cli install`
- Build: `pnpm -C packages/deep-factor-cli build` (runs `tsc` + postbuild shebang)
- Dev mode: `pnpm -C packages/deep-factor-cli dev` (runs `tsc --watch`)
- Run: `node packages/deep-factor-cli/dist/cli.js "your prompt"`
- Run (interactive): `node packages/deep-factor-cli/dist/cli.js --interactive`

### TUI Package (deep-factor-tui)

- Install deps: `pnpm -C packages/deep-factor-tui install`
- Build: `pnpm -C packages/deep-factor-tui build` (runs `tsc` + postbuild shebang)
- Dev mode: `pnpm -C packages/deep-factor-tui dev` (runs `tsc --watch`)
- Run: `node packages/deep-factor-tui/dist/cli.js`
- Run (via CLI): `node packages/deep-factor-cli/dist/cli.js --tui`

## Validation

- Tests (agent): `pnpm -C packages/deep-factor-agent test`
- Tests (CLI): `pnpm -C packages/deep-factor-cli test`
- Tests (TUI): `pnpm -C packages/deep-factor-tui test`
- Tests (all): `pnpm -r test`
- Typecheck (agent): `pnpm -C packages/deep-factor-agent type-check`
- Typecheck (CLI): `pnpm -C packages/deep-factor-cli type-check`
- Typecheck (TUI): `pnpm -C packages/deep-factor-tui type-check`
- Typecheck (all): `pnpm -r type-check`

## Operational Notes

- ESM only (`"type": "module"` in all packages)
- LangChain `BaseChatModel` is the model type; `initChatModel` resolves string IDs lazily
- Tools use LangChain `tool()` factory from `@langchain/core/tools` — returns `StructuredToolInterface`
- Messages use LangChain classes: `HumanMessage`, `AIMessage`, `SystemMessage`, `ToolMessage`
- Agent loop manually handles tool calling (bind tools, invoke, check tool_calls, execute, loop)
- Token usage from `response.usage_metadata` (`input_tokens`, `output_tokens`, `total_tokens`)
- CLI uses Ink (React for terminal) with meow for arg parsing
- TUI uses fullscreen-ink (alternate screen buffer) with Ink + meow

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

### CLI Codebase Patterns

- Entry point: `packages/deep-factor-cli/src/cli.tsx` (meow + ink render)
- App shell: `packages/deep-factor-cli/src/app.tsx` (root component)
- Agent hook: `packages/deep-factor-cli/src/hooks/useAgent.ts` (React state bridge)
- Components: `packages/deep-factor-cli/src/components/` (Chat, StatusBar, Spinner, ToolCall, HumanInput, PromptInput)
- Bash tool: `packages/deep-factor-cli/src/tools/bash.ts` (optional, --bash flag)
- CLI types: `packages/deep-factor-cli/src/types.ts` (ChatMessage, AgentStatus)
- Tests: `packages/deep-factor-cli/__tests__/` (ink-testing-library)

### TUI Codebase Patterns

- Entry point: `packages/deep-factor-tui/src/cli.tsx` (meow + withFullScreen)
- App shell: `packages/deep-factor-tui/src/app.tsx` (Header/Content/Footer layout)
- Agent hook: `packages/deep-factor-tui/src/hooks/useAgent.ts` (React state bridge)
- Text input hook: `packages/deep-factor-tui/src/hooks/useTextInput.ts` (cursor input handling)
- Components: `packages/deep-factor-tui/src/components/` (Header, Content, Footer, MessageList, MessageBubble, ToolCallBlock, InputBar, StatusLine)
- Bash tool: `packages/deep-factor-tui/src/tools/bash.ts` (optional, --bash flag)
- TUI types: `packages/deep-factor-tui/src/types.ts` (TuiAppProps, ChatMessage, AgentStatus)
- Tests: `packages/deep-factor-tui/__tests__/` (placeholder)

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
