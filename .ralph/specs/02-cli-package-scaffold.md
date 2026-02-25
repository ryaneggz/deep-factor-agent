# SPEC-02: CLI Package Scaffolding

## CONTEXT

### Problem Statement

A new `packages/deep-factor-cli/` package needs to be created with proper TypeScript + React JSX compilation, bin entry point with shebang, and workspace dependency on `deep-factor-agent`.

### RELEVANT SOURCES
- [ink@6.8.0](https://github.com/vadimdemedes/ink) — React 19 required, Node 20+
- [meow@13.2.0](https://github.com/sindresorhus/meow) — ESM-only CLI arg parser
- [TypeScript JSX](https://www.typescriptlang.org/tsconfig#jsx) — `react-jsx` transform

### RELEVANT FILES
- `packages/deep-factor-agent/package.json` — reference for conventions
- `packages/deep-factor-agent/tsconfig.json` — base tsconfig to extend patterns from

---

## OVERVIEW

Scaffold `packages/deep-factor-cli/` with package.json, tsconfig.json, vitest.config.ts, build scripts, and directory structure.

---

## USER STORIES

### US-01: Package Configuration

**As a** developer
**I want** a properly configured CLI package
**So that** it builds TSX to JS, links the agent package, and produces an executable bin

#### Acceptance Criteria

- [ ] `packages/deep-factor-cli/package.json` exists with correct config (see details below)
- [ ] `packages/deep-factor-cli/tsconfig.json` exists with JSX support
- [ ] `packages/deep-factor-cli/vitest.config.ts` exists
- [ ] `packages/deep-factor-cli/scripts/postbuild.js` adds shebang + executable bit
- [ ] `pnpm install` resolves `deep-factor-agent` via workspace link
- [ ] `pnpm -C packages/deep-factor-cli build` compiles without errors
- [ ] `dist/cli.js` has `#!/usr/bin/env node` shebang and is executable

#### `package.json`

```json
{
  "name": "deep-factor-cli",
  "version": "0.0.0",
  "type": "module",
  "bin": { "deep-factor": "./dist/cli.js" },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "scripts": {
    "build": "tsc && node scripts/postbuild.js",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "deep-factor-agent": "workspace:*",
    "ink": "^6.8.0",
    "react": "^19.0.0",
    "meow": "^13.2.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "ink-testing-library": "^4.0.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

#### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"]
}
```

#### `scripts/postbuild.js`

```js
import { readFileSync, writeFileSync, chmodSync } from "fs";
const cli = "dist/cli.js";
const content = readFileSync(cli, "utf8");
if (!content.startsWith("#!")) {
  writeFileSync(cli, `#!/usr/bin/env node\n${content}`);
}
chmodSync(cli, 0o755);
```

#### `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
  },
});
```

#### Peer Dependency Overrides

If `ink-testing-library@4` warns about react/ink peer deps, add to root `package.json`:

```json
{
  "pnpm": {
    "peerDependencyRules": {
      "allowedVersions": {
        "ink-testing-library>react": "19",
        "ink-testing-library>ink": "6"
      }
    }
  }
}
```

---

### US-02: Directory Structure

**As a** developer
**I want** the source directory scaffolded with placeholder files
**So that** the build succeeds and the structure is ready for implementation

#### Acceptance Criteria

- [ ] `src/cli.tsx` — entry point (placeholder)
- [ ] `src/app.tsx` — root App component (placeholder)
- [ ] `src/components/` — directory exists
- [ ] `src/hooks/` — directory exists
- [ ] `src/tools/` — directory exists
- [ ] `src/types.ts` — CLI-specific types (placeholder)
- [ ] `src/index.ts` — barrel re-exports for testing
- [ ] `__tests__/` — directory exists
- [ ] `__tests__/components/` — directory exists

---

## DEPENDENCY ORDER

```
SPEC-01 (workspace) → US-01 (package config) → US-02 (directory structure)
```

## VERIFICATION

1. `pnpm install` — workspace resolves, `deep-factor-agent` linked
2. `pnpm -C packages/deep-factor-cli build` — compiles TSX to JS
3. `head -1 packages/deep-factor-cli/dist/cli.js` — shows `#!/usr/bin/env node`
4. `ls -la packages/deep-factor-cli/dist/cli.js` — executable bit set
