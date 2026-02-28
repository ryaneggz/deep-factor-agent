# SPEC-01: Coverage Infrastructure

> Priority: **First** (enables measurement for all subsequent specs)

## Goal

Add `@vitest/coverage-v8` to both packages so `vitest run --coverage` produces text tables and lcov reports.

## Current State

- Neither `packages/deep-factor-agent/package.json` nor `packages/deep-factor-cli/package.json` has `@vitest/coverage-v8` as a devDependency.
- Neither `vitest.config.ts` has a `coverage` block.
- `.gitignore` already ignores `coverage/`.
- Root `.env` is **not** in `.gitignore` (needs adding for Step 0 symlink safety).

## Changes

### 1. Root `.gitignore` — add `.env`

```diff
 packages/*/.env
+.env
```

### 2. `packages/deep-factor-agent/package.json`

Add devDependency:
```
"@vitest/coverage-v8": "^4.0.18"
```

Add script:
```
"coverage": "vitest run --coverage"
```

### 3. `packages/deep-factor-cli/package.json`

Same devDependency and script.

### 4. `packages/deep-factor-agent/vitest.config.ts`

Add coverage block:
```ts
coverage: {
  provider: "v8",
  include: ["src/**/*.ts"],
  reporter: ["text", "lcov"],
}
```

### 5. `packages/deep-factor-cli/vitest.config.ts`

Add coverage block:
```ts
coverage: {
  provider: "v8",
  include: ["src/**/*.{ts,tsx}"],
  reporter: ["text", "lcov"],
}
```

### 6. Install

```bash
pnpm install
```

## Acceptance

- `pnpm -C packages/deep-factor-agent coverage` prints a text table with line/branch/function coverage. No existing tests break.
- `pnpm -C packages/deep-factor-cli coverage` same.
- `git diff .gitignore` shows `.env` added.
