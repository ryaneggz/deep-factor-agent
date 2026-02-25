# Move test files from `src/` to `__tests__/`

## Context

Test files (`.test.ts`) are currently co-located with source files in `src/`. This means they ship alongside production code unless explicitly excluded. Moving them to a dedicated `__tests__/` directory at the package level cleanly separates test code from production code, making the project structure more organized and ensuring tests never leak into deployments.

## Files to move (8 test files)

| Current location | New location |
|---|---|
| `src/agent.test.ts` | `__tests__/agent.test.ts` |
| `src/context-manager.test.ts` | `__tests__/context-manager.test.ts` |
| `src/create-agent.test.ts` | `__tests__/create-agent.test.ts` |
| `src/human-in-the-loop.test.ts` | `__tests__/human-in-the-loop.test.ts` |
| `src/integration.test.ts` | `__tests__/integration.test.ts` |
| `src/middleware.test.ts` | `__tests__/middleware.test.ts` |
| `src/stop-conditions.test.ts` | `__tests__/stop-conditions.test.ts` |
| `src/tool-adapter.test.ts` | `__tests__/tool-adapter.test.ts` |

All paths relative to `packages/deep-factor-agent/`.

## Steps

### 1. Create `__tests__/` directory and move files

```bash
mkdir packages/deep-factor-agent/__tests__
git mv packages/deep-factor-agent/src/*.test.ts packages/deep-factor-agent/__tests__/
```

### 2. Update imports in all test files

All test files currently use `./` relative imports to source modules (e.g., `import { DeepFactorAgent } from "./agent.js"`). These need to change to `../src/` (e.g., `import { DeepFactorAgent } from "../src/agent.js"`).

Replace `"./` with `"../src/` in every import statement across all 8 test files.

### 3. Update `vitest.config.ts`

Change the `include` pattern from `src/**/*.test.ts` to `__tests__/**/*.test.ts`:

```ts
// packages/deep-factor-agent/vitest.config.ts
export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    passWithNoTests: true,
  },
});
```

### 4. Update `tsconfig.json`

The current config already excludes `**/*.test.ts`, so test files in `__tests__/` are already excluded from compilation. No change needed — the existing exclude glob covers both locations.

### 5. Update `CLAUDE.md`

Update the "Codebase Patterns" section to reflect:
```
- Tests in `packages/deep-factor-agent/__tests__/*.test.ts`
```
(Replace the current "Tests co-located: `packages/deep-factor-agent/src/*.test.ts`" line.)

## Verification

1. **Tests pass:** `pnpm -C packages/deep-factor-agent test`
2. **Type-check passes:** `pnpm -C packages/deep-factor-agent type-check`
3. **Build succeeds and dist/ has no test files:** `pnpm -C packages/deep-factor-agent build && ls packages/deep-factor-agent/dist/`
4. **No test files remain in src/:** `ls packages/deep-factor-agent/src/*.test.ts` should return "No such file"
