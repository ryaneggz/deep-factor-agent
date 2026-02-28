# Plan: Add Pre-commit Hooks with ESLint + Prettier + Husky + lint-staged

## Context

The project currently has **no linting, formatting, or git hooks** configured. Tests and type-checking exist via Vitest and `tsc`. Adding pre-commit hooks ensures code quality is enforced automatically before every commit — catching lint errors, formatting inconsistencies, type errors, and test failures before they reach the repository.

## Steps

### 1. Install dependencies at workspace root

```bash
pnpm add -Dw eslint @eslint/js typescript-eslint eslint-config-prettier \
  eslint-plugin-react eslint-plugin-react-hooks prettier husky lint-staged
```

### 2. Update root `package.json`

**File**: `package.json`

- Add `"type": "module"` (both packages already use ESM; enables ESM config files at root)
- Add scripts: `lint`, `lint:fix`, `format`, `format:check`
- Add `"prepare": "husky"` (auto-installs hooks on `pnpm install`)
- Add `lint-staged` config inline:
  - `*.{ts,tsx}` → `eslint --fix` + `prettier --write`
  - `*.{js,mjs,json,md,yaml,yml}` → `prettier --write`

### 3. Create ESLint flat config

**File**: `eslint.config.js` (new)

- Ignores: `dist/`, `node_modules/`, `.huntley/`, `.ralph/`, `.claude/`, `coverage/`
- Base: `@eslint/js` recommended + `typescript-eslint` recommended
- Agent package `.ts` files: TypeScript with `projectService: true`
- CLI package `.ts/.tsx` files: TypeScript + React + React Hooks plugins, `react-in-jsx-scope` off
- Last: `eslint-config-prettier` to disable conflicting formatting rules

### 4. Create Prettier config

**File**: `prettier.config.js` (new)

Settings matching existing code style: `semi: true`, `singleQuote: false`, `tabWidth: 2`, `trailingComma: "all"`, `printWidth: 100`

### 5. Create `.prettierignore`

**File**: `.prettierignore` (new)

Excludes: `dist`, `node_modules`, `pnpm-lock.yaml`, `coverage`, `.huntley/logs`, `.huntley/archive`, `.ralph/archives`, `.claude`

### 6. Initialize Husky & create pre-commit hook

```bash
pnpm exec husky init
```

**File**: `.husky/pre-commit` (replace generated content)

```bash
pnpm exec lint-staged && pnpm -r type-check && pnpm -r test
```

Pipeline: lint staged files → type-check all packages → run all tests. Commit aborts if any step fails.

### 7. Format & lint the existing codebase (one-time baseline)

```bash
pnpm format        # Format all files
pnpm lint:fix      # Auto-fix lint issues
```

Review and manually fix any remaining lint errors.

## Files Modified/Created

| File | Action |
|------|--------|
| `package.json` | Modified — add type, scripts, lint-staged, devDependencies |
| `eslint.config.js` | Created |
| `prettier.config.js` | Created |
| `.prettierignore` | Created |
| `.husky/pre-commit` | Created |

## Verification

1. `pnpm lint` — ESLint runs without config errors
2. `pnpm format:check` — Prettier reports no unformatted files
3. `pnpm -r type-check` — TypeScript passes
4. `pnpm -r test` — All tests pass
5. Make a test commit to verify the pre-commit hook fires and runs the full pipeline
