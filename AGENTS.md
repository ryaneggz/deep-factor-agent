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
- Vercel AI SDK v6 uses `stopWhen` + `stepCountIs(n)`, NOT old `maxSteps`
- `LanguageModel` type is a union including strings -- check `typeof model === "object"` before `.modelId`
- `stream()` return type needs explicit annotation to avoid TS4053

### Codebase Patterns

- All types in `src/types.ts`, re-exported from `src/index.ts`
- Stop condition factories in `src/stop-conditions.ts`
- Middleware system in `src/middleware.ts` (composeMiddleware, todoMiddleware, errorRecoveryMiddleware)
- Agent loop in `src/agent.ts` (DeepFactorAgent class with loop() and stream())
- Context management in `src/context-manager.ts` (ContextManager, estimateTokens)
- Factory function in `src/create-agent.ts` (createDeepFactorAgent)
- Human-in-the-loop in `src/human-in-the-loop.ts` (requestHumanInput tool)
- Tests co-located: `src/*.test.ts`
