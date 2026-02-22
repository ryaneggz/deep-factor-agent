## Build & Run

- Package manager: `pnpm` (install globally with `npm install -g pnpm` if needed)
- Install deps: `pnpm -C packages/deep-factor-agent install`
- Build: `pnpm -C packages/deep-factor-agent build` (runs `tsc`)
- Dev mode: `pnpm -C packages/deep-factor-agent dev` (runs `tsc --watch`)

## Validation

- Tests: `pnpm -C packages/deep-factor-agent test`
- Typecheck: `pnpm -C packages/deep-factor-agent type-check`
- Build check: `pnpm -C packages/deep-factor-agent build` then check `packages/deep-factor-agent/dist/` has `.js` and `.d.ts` files

## Operational Notes

- ESM only (`"type": "module"` in package.json)
- LangChain `BaseChatModel` is the model type; `initChatModel` resolves string IDs lazily
- Tools use LangChain `tool()` factory from `@langchain/core/tools` — returns `StructuredToolInterface`
- Messages use LangChain classes: `HumanMessage`, `AIMessage`, `SystemMessage`, `ToolMessage`
- `stream()` is async, returns `AsyncIterable<AIMessageChunk>`
- Agent loop manually handles tool calling (bind tools, invoke, check tool_calls, execute, loop)
- Token usage from `response.usage_metadata` (`input_tokens`, `output_tokens`, `total_tokens`)

### Codebase Patterns

- All types in `packages/deep-factor-agent/src/types.ts`, re-exported from `packages/deep-factor-agent/src/index.ts`
- Stop condition factories in `packages/deep-factor-agent/src/stop-conditions.ts`
- Middleware system in `packages/deep-factor-agent/src/middleware.ts` (composeMiddleware, todoMiddleware, errorRecoveryMiddleware)
- Agent loop in `packages/deep-factor-agent/src/agent.ts` (DeepFactorAgent class with loop() and stream())
- Context management in `packages/deep-factor-agent/src/context-manager.ts` (ContextManager, estimateTokens)
- Factory function in `packages/deep-factor-agent/src/create-agent.ts` (createDeepFactorAgent)
- Human-in-the-loop in `packages/deep-factor-agent/src/human-in-the-loop.ts` (requestHumanInput tool)
- Tool adapter utilities in `packages/deep-factor-agent/src/tool-adapter.ts` (createLangChainTool, findToolByName, toolArrayToMap)
- Tests co-located: `packages/deep-factor-agent/src/*.test.ts`

### Ralph Layout

- `.ralph/loop.sh` — build/plan loop driver
- `.ralph/format-log.sh` — stream-json → markdown formatter
- `.ralph/review-log.sh` — log viewer
- `.ralph/archive.sh` — archive current phase
- `.ralph/PROMPT_plan.md` — plan-mode prompt
- `.ralph/PROMPT_build.md` — build-mode prompt
- `.ralph/IMPLEMENTATION_PLAN.md` — current phase plan
- `.ralph/specs/` — feature specifications
- `.ralph/logs/` — session logs
- `.ralph/archive/` — archived phases
