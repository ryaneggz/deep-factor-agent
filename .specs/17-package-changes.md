# Spec: Package.json Changes

## File

`packages/deep-factor-cli/package.json`

## Purpose

Add new npm scripts and the `tsx` devDependency to support the backpressure testing scaffold.

---

## Changes

### New Scripts

Add to the `"scripts"` object:

```json
"tui:dev": "tsx scripts/tui-dev.tsx",
"test:backpressure": "vitest run --testPathPattern=tui/backpressure"
```

#### `tui:dev`

- Runs the dev script directly via `tsx` (no build step)
- Supports `--scenario <name>` argument forwarded by pnpm

#### `test:backpressure`

- Runs only the backpressure test file via vitest's `--testPathPattern` filter
- Pattern `tui/backpressure` matches `__tests__/tui/backpressure.test.tsx`
- The full suite (`pnpm test`) still picks up this test automatically (vitest config includes `__tests__/**/*.test.{ts,tsx}`)

### New DevDependency

Add to `"devDependencies"`:

```json
"tsx": "^4.0.0"
```

`tsx` enables running TypeScript/TSX files directly without a build step. Used only for the dev script.

---

## Final `package.json` (relevant sections)

```json
{
  "scripts": {
    "build": "tsc && node scripts/postbuild.js",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:backpressure": "vitest run --testPathPattern=tui/backpressure",
    "type-check": "tsc --noEmit",
    "coverage": "vitest run --coverage",
    "link": "npm i && npm run build && npm link",
    "tui:dev": "tsx scripts/tui-dev.tsx"
  },
  "devDependencies": {
    "@types/node": "^25.3.0",
    "@types/react": "^19.0.0",
    "@vitest/coverage-v8": "^4.0.18",
    "ink-testing-library": "^4.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

---

## Acceptance Criteria

- [ ] `pnpm -C packages/deep-factor-cli tui:dev` runs the dev script
- [ ] `pnpm -C packages/deep-factor-cli test:backpressure` runs only the backpressure tests
- [ ] `pnpm -C packages/deep-factor-cli test` includes backpressure tests in the full suite
- [ ] `tsx` is listed in devDependencies
- [ ] All existing scripts remain unchanged
- [ ] `pnpm install` resolves without errors after changes
