# Plan: Ralph Loop Init (`--init`) + Stdin Support for Print Mode

## Context

The TUI's print mode (`-p`) only accepts prompts as positional CLI arguments. The "ralph loop" pattern (`while :; do cat PROMPT.md | node dist/cli.js -p --sandbox; done`) requires the CLI to read prompts from stdin. Users also need a quick way to scaffold the loop files (`PROMPT.md` + `loop.sh`) in any directory via `--init`.

The test case: scaffold with `--init`, set the prompt to "Create a simple express crud app at ./exp-server", and run the loop.

## Changes

### 1. Add stdin support to print mode — `packages/deep-factor-tui/src/cli.tsx`

When `-p` is used and no positional prompt is given, read stdin to EOF as the prompt. This makes `cat PROMPT.md | node dist/cli.js -p --sandbox` work.

- Add a `readStdin()` helper (inline, ~10 lines) that collects chunks into a string
- Only attempt stdin read when `!process.stdin.isTTY` (piped input detected)
- Update error message: `"Print mode requires a prompt argument or piped stdin."`

### 2. Add `--init` flag — `packages/deep-factor-tui/src/cli.tsx`

New boolean flag. When passed:
- Import and call `runInit(process.cwd())` from `./init.js`
- Exit before any print/TUI branching

### 3. Create `packages/deep-factor-tui/src/init.ts`

Scaffolding logic:
- `export async function runInit(cwd: string): Promise<void>`
- Check if `PROMPT.md` or `loop.sh` already exist → error with message, exit 1
- Write `PROMPT.md` with content: `Describe your task here.\n`
- Write `loop.sh` with content:
  ```bash
  #!/bin/bash
  while :; do cat PROMPT.md | npx deep-factor-tui -p --sandbox; done
  ```
- `chmod +x loop.sh`
- Print confirmation to stdout

### 4. Update help text in `cli.tsx`

Add `--init` to options and examples:
```
--init           Scaffold PROMPT.md + loop.sh for ralph loop
```

## Files

| File | Action | Description |
|------|--------|-------------|
| `packages/deep-factor-tui/src/init.ts` | CREATE | Scaffold PROMPT.md + loop.sh |
| `packages/deep-factor-tui/src/cli.tsx` | MODIFY | Add `--init` flag, stdin reading for `-p`, updated help |

## Verification

```bash
# Build
pnpm -C packages/deep-factor-tui build

# Typecheck
pnpm -C packages/deep-factor-tui type-check

# Test --init scaffolding
cd /tmp && mkdir ralph-test && cd ralph-test
node ~/sandbox/2026/feb/deep-factor-agent/packages/deep-factor-tui/dist/cli.js --init
cat PROMPT.md     # → "Describe your task here."
cat loop.sh       # → loop script
ls -la loop.sh    # → executable

# Test stdin piping (proves ralph loop works)
echo "What is 2+2?" | node packages/deep-factor-tui/dist/cli.js -p

# E2E: edit PROMPT.md to "Create a simple express crud app at ./exp-server"
# Then: bash loop.sh
```
