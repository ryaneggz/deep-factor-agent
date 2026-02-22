## Build & Run

- Package manager: `pnpm` (install globally with `npm install -g pnpm` if needed)
- Install deps: `pnpm install`
- Build: `pnpm build` (runs `tsc`)
- Dev mode: `pnpm dev` (runs `tsc --watch`)

## Validation

- Tests: `pnpm test`
- Typecheck: `pnpm type-check`
- Build check: `pnpm build` then check `dist/` has `.js` and `.d.ts` files

## Operational Notes

- ESM only (`"type": "module"` in package.json)
- LangChain `BaseChatModel` is the model type; `initChatModel` resolves string IDs lazily
- Tools use LangChain `tool()` factory from `@langchain/core/tools` — returns `StructuredToolInterface`
- Messages use LangChain classes: `HumanMessage`, `AIMessage`, `SystemMessage`, `ToolMessage`
- `stream()` is async, returns `AsyncIterable<AIMessageChunk>`
- Agent loop manually handles tool calling (bind tools, invoke, check tool_calls, execute, loop)
- Token usage from `response.usage_metadata` (`input_tokens`, `output_tokens`, `total_tokens`)

### Codebase Patterns

- All types in `src/types.ts`, re-exported from `src/index.ts`
- Stop condition factories in `src/stop-conditions.ts`
- Middleware system in `src/middleware.ts` (composeMiddleware, todoMiddleware, errorRecoveryMiddleware)
- Agent loop in `src/agent.ts` (DeepFactorAgent class with loop() and stream())
- Context management in `src/context-manager.ts` (ContextManager, estimateTokens)
- Factory function in `src/create-agent.ts` (createDeepFactorAgent)
- Human-in-the-loop in `src/human-in-the-loop.ts` (requestHumanInput tool)
- Tool adapter utilities in `src/tool-adapter.ts` (createLangChainTool, findToolByName, toolArrayToMap)
- Tests co-located: `src/*.test.ts`
