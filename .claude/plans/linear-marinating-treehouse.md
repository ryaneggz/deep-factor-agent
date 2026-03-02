# Plan: Non-Interactive Print Mode (`-p`) and `--sandbox` Flag

## Context

The TUI currently only supports fullscreen interactive mode. Users need a way to run single queries non-interactively (like `claude -p "query"`) that outputs just the final answer to stdout — ideal for scripting, piping, and automation. Additionally, a `--sandbox` flag will opt-in to enabling system tools (bash) in print mode, while keeping it safe by default (no tools = pure reasoning).

The `--parallel` flag is being removed since parallel tool execution should always be on by default.

## Changes

### 1. Create `packages/deep-factor-tui/src/print.ts` (new file)

Headless agent runner — no React/Ink dependencies:

- Export `runPrintMode(options)` async function
- Create agent via `createDeepFactorAgent` from `deep-factor-agent`
- Tools: empty array by default; include `bashTool` only when `sandbox: true`
- Always set `parallelToolCalls: true`, no `requestHumanInput` tool, `interruptOn: []`
- Run `agent.loop(prompt)` and write `result.response` to `process.stdout`
- Exit code 0 on success, 1 on error (stderr for error messages)
- Handle `human_input_needed` and `max_errors` stop reasons as errors

### 2. Modify `packages/deep-factor-tui/src/cli.tsx` (entry point)

Flag changes:
- **Remove** `--parallel` / `-p` flag entirely
- **Add** `--print` / `-p` flag (boolean) — enables non-interactive print mode
- **Add** `--sandbox` flag (boolean) — enables bash tool in print mode

Execution branching:
- If `--print`: validate prompt exists (error if missing), dynamically import `./print.js`, call `runPrintMode()`
- Else (TUI mode): dynamically import `react`, `fullscreen-ink`, `./app.js`, render TUI with `parallelToolCalls: true` hardcoded
- Use `React.createElement(TuiApp, {...})` instead of JSX to avoid static React import in print mode path

### 3. Modify `packages/deep-factor-tui/src/hooks/useAgent.ts` (one-line change)

Line 114: Default `parallelToolCalls` to `true`:
```
parallelToolCalls: options.parallelToolCalls ?? true,
```

## Files

| File | Action | Description |
|------|--------|-------------|
| `packages/deep-factor-tui/src/print.ts` | CREATE | Headless agent runner for print mode |
| `packages/deep-factor-tui/src/cli.tsx` | MODIFY | Remove `--parallel`, add `--print`/`--sandbox`, branch logic |
| `packages/deep-factor-tui/src/hooks/useAgent.ts` | MODIFY | Default `parallelToolCalls` to `true` |
| `packages/deep-factor-tui/__tests__/print.test.ts` | CREATE | Unit tests for print mode |
| `packages/deep-factor-tui/__tests__/cli-e2e.test.ts` | CREATE | E2E tests for CLI flag routing |

### Existing code to reuse
- `createDeepFactorAgent` / `maxIterations` from `deep-factor-agent` (factory + stop condition)
- `bashTool` from `./tools/bash.js` (existing bash tool, no changes needed)
- `AgentResult` type from `deep-factor-agent` (`.response` field has final answer)
- Mock model pattern from `packages/deep-factor-agent/__tests__/integration.test.ts` (`makeMockModel`, `makeAIMessage`)

## Tests

### 4. Create `packages/deep-factor-tui/__tests__/print.test.ts` (unit tests)

Mock `deep-factor-agent` module to avoid real LLM calls (same pattern as agent package integration tests). Test `runPrintMode` directly:

**Test cases:**
- `runPrintMode` writes `result.response` to stdout on success (mock `process.stdout.write`, verify called with response)
- `runPrintMode` calls `process.exit(0)` on successful completion
- `runPrintMode` calls `process.exit(1)` and writes to stderr when `stopReason === "max_errors"`
- `runPrintMode` calls `process.exit(1)` when `stopReason === "human_input_needed"` (should never happen but defensive)
- When `sandbox: false`: `createDeepFactorAgent` called with `tools: []` (no tools)
- When `sandbox: true`: `createDeepFactorAgent` called with tools array containing `bashTool`
- Always passes `parallelToolCalls: true` to `createDeepFactorAgent`
- Always passes `interruptOn: []` (no human-in-the-loop)
- Passes correct `model` and `maxIter` through to agent config
- Handles thrown errors (e.g., network failure) gracefully — writes to stderr, exits 1

**Approach:** Mock `deep-factor-agent` with `vi.mock()` and spy on `process.stdout.write`, `process.stderr.write`, `process.exit`.

### 5. Create `packages/deep-factor-tui/__tests__/cli-e2e.test.ts` (e2e validation)

Runs the actual compiled CLI binary via `child_process.execFile` and validates output/exit codes. Requires a build step first (`pnpm -C packages/deep-factor-tui build`).

**Test cases:**
- `-p` without a prompt: exits with code 1, stderr contains "requires a prompt"
- `-p "query"`: exits with code 0 (requires valid API key — skip in CI or mock env)
- `--sandbox` without `--print`: launches TUI mode (no error, validate it doesn't crash immediately)
- `--help`: outputs usage text containing `--print`, `--sandbox`, no `--parallel`
- Flag parsing: `-p` is recognized as `--print` (not `--parallel`)

**Approach:** Use `child_process.execFile` with `node dist/cli.js` as the command. Set a short timeout (5s) to prevent hanging. For tests that need a real API key, use `describe.skipIf(!process.env.OPENAI_API_KEY)` to conditionally skip.

## Verification

```bash
# Build
pnpm -C packages/deep-factor-tui build

# Run unit tests
pnpm -C packages/deep-factor-tui test

# Manual e2e — print mode, pure reasoning
node packages/deep-factor-tui/dist/cli.js -p "What is 2+2?"
# Expected: prints answer to stdout, exits 0

# Manual e2e — missing prompt
node packages/deep-factor-tui/dist/cli.js -p
# Expected: "Error: Print mode requires a prompt argument." to stderr, exits 1

# Manual e2e — with sandbox (bash enabled)
node packages/deep-factor-tui/dist/cli.js -p --sandbox "List files in the current directory"
# Expected: uses bash tool, prints result to stdout, exits 0

# Manual e2e — TUI mode unchanged
node packages/deep-factor-tui/dist/cli.js
# Expected: fullscreen TUI launches as before

# Manual e2e — TUI with bash
node packages/deep-factor-tui/dist/cli.js --bash "List files"
# Expected: fullscreen TUI with bash tool, parallel on by default
```
