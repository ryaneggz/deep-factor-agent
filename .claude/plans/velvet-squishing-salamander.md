# Plan: Reproducible Smoke Test Environment

## Context

The output-capture smoke tests (and existing `claude-cli.smoke.ts`, `codex-cli.smoke.ts`) depend on API keys and CLI auth that vary per developer machine. There's no `.env.example` in the TUI package, no setup script, and no documentation on how to configure the environment for smoke tests. We need to make the smoke test environment reproducible so any contributor can clone, configure, and run them.

## Approach

### 1. Create `.env.example` in TUI package

**File:** `packages/deep-factor-tui/.env.example`

Document all env vars the smoke tests need:
```
# LangChain provider smoke tests (required for langchain tests)
OPENAI_API_KEY=your-openai-api-key

# Optional: Override default model (default: gpt-4.1-mini)
# MODEL_ID=gpt-4.1-mini

# Claude provider tests require `claude` CLI auth instead of env vars.
# Run: claude auth login
#
# Codex provider tests require `codex` CLI auth instead of env vars.
# Run: codex login
```

### 2. Add vitest `globalSetup` to load `.env` before smoke tests

**File:** `packages/deep-factor-tui/vitest.smoke.setup.ts`

```typescript
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function setup(): void {
  const dir = dirname(fileURLToPath(import.meta.url));
  // Load TUI package .env (highest priority, loaded second so it overrides)
  config({ path: join(dir, ".env") });
}
```

This ensures that a contributor who places a `.env` file in `packages/deep-factor-tui/` gets it loaded automatically for all smoke tests, without needing to export vars in their shell. The existing `describe.skipIf()` guards still apply — tests skip gracefully when credentials are absent.

### 3. Wire globalSetup into smoke vitest config

**File:** `packages/deep-factor-tui/vitest.smoke.config.ts`

Add `globalSetup` to the existing config:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.smoke.ts"],
    passWithNoTests: false,
    globalSetup: ["./vitest.smoke.setup.ts"],
  },
});
```

### 4. Add `.env` to TUI `.gitignore` (already covered by root)

The root `.gitignore` already has `**/.env*`, so `packages/deep-factor-tui/.env` is already ignored. No change needed.

## Files to modify

| File | Action |
|------|--------|
| `packages/deep-factor-tui/.env.example` | **Create** — documents required env vars |
| `packages/deep-factor-tui/vitest.smoke.setup.ts` | **Create** — globalSetup that loads `.env` via dotenv |
| `packages/deep-factor-tui/vitest.smoke.config.ts` | **Edit** — add `globalSetup` reference |

## Verification

```bash
# 1. Copy and fill in env
cp packages/deep-factor-tui/.env.example packages/deep-factor-tui/.env
# Edit .env with real OPENAI_API_KEY

# 2. Build
pnpm -C packages/deep-factor-tui build

# 3. Run smoke tests (env loaded automatically via globalSetup)
pnpm -C packages/deep-factor-tui test:smoke

# 4. Verify output files written
ls packages/deep-factor-tui/__tests__/output/
```

## Key references

- Existing agent `.env.example`: `packages/deep-factor-agent/.env.example`
- Smoke config: `packages/deep-factor-tui/vitest.smoke.config.ts`
- dotenv already a dependency in TUI `package.json`
- Root `.gitignore` already excludes `**/.env*`
