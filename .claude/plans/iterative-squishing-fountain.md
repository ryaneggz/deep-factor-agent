# Plan: Align CLAUDE.md with current codebase & rename bin to `deepfactor`

## Context
The `deep-factor-cli` package no longer exists — only `deep-factor-agent` and `deep-factor-tui` remain. But `CLAUDE.md` still references `deep-factor-cli` extensively. Additionally, the TUI bin command should be renamed from `deep-factor-tui` to `deepfactor`.

## Changes

### 1. Rename bin in TUI package.json
**File:** `packages/deep-factor-tui/package.json` (line 6)
- Change `"deep-factor-tui": "dist/cli.js"` → `"deepfactor": "dist/cli.js"`

### 2. Update CLAUDE.md
**File:** `CLAUDE.md`

- **Remove** the entire "CLI Package (deep-factor-cli)" section (lines 13-19)
- **Remove** the "Run (via CLI)" line (line 27: `node packages/deep-factor-cli/dist/cli.js --tui`)
- **Update** TUI run examples to reflect actual flags and new bin name:
  - `deepfactor` (interactive TUI)
  - `deepfactor "Explain how React hooks work"` (with prompt)
  - `deepfactor -p "What is 2+2?"` (print mode)
  - `deepfactor -p --sandbox "List files"` (print + sandbox)
  - `cat PROMPT.md | deepfactor -p --sandbox` (stdin pipe)
- **Remove** CLI validation lines: `pnpm -C packages/deep-factor-cli test` and `type-check`
- **Remove** "CLI uses Ink (React for terminal) with meow for arg parsing" from Operational Notes (line 48)
- **Remove** entire "CLI Codebase Patterns" section (lines 63-71)

### 3. Update TUI help text in cli.tsx
**File:** `packages/deep-factor-tui/src/cli.tsx` (line 13)
- Change `$ deep-factor-tui` → `$ deepfactor` in the usage/examples section

## Verification
- Run `pnpm -C packages/deep-factor-tui type-check` to confirm TUI package is healthy
- Grep for any remaining `deep-factor-cli` references
- Grep for any remaining `deep-factor-tui` bin references that should now be `deepfactor`
