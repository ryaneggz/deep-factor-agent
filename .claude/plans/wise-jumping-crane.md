# Plan: Add VS Code Debug Configuration for deep-factor-tui

## Context

There is no `.vscode/launch.json` anywhere in the repository. Debugging tool calling in the TUI requires stepping through the agent loop, tool execution, and event handling — which is difficult without a debugger attached. Additionally, **source maps are not enabled** in the TUI's `tsconfig.json`, so breakpoints in `.ts` source files won't work without that fix.

## Changes

### 1. Enable source maps in TUI tsconfig.json

**File:** `packages/deep-factor-tui/tsconfig.json`

- Add `"sourceMap": true` to `compilerOptions`
- This allows the VS Code debugger to map breakpoints from `.ts` source files to the compiled `.js` output in `dist/`

### 2. Create `.vscode/launch.json` in `packages/deep-factor-tui/`

**File:** `packages/deep-factor-tui/.vscode/launch.json`

Create a launch configuration with two debug profiles:

#### a) **Debug TUI** — Launch the TUI directly
- Type: `node`
- Program: `${workspaceFolder}/dist/cli.js`
- Pre-launch task: none (user builds manually or uses `dev` watch mode)
- `sourceMaps: true` + `outFiles` pointing to `dist/**/*.js`
- `console: "integratedTerminal"` — required because the TUI uses fullscreen-ink (alternate screen buffer) and needs a real terminal for input/rendering
- Pass common args via `args` (e.g., `--model`, `--bash`)

#### b) **Debug TUI (Attach)** — Attach to a running process
- Type: `node`
- Request: `attach`
- Port: `9229` (default Node inspect port)
- User starts the TUI manually with `node --inspect dist/cli.js` or `node --inspect-brk dist/cli.js`
- Useful when the TUI is already running or launched from another script

### Key debugging entry points for tool calling

Once the debugger is attached, useful breakpoint locations:

| What to debug | File | Area |
|---|---|---|
| Tool execution dispatch | `packages/deep-factor-agent/src/agent.ts` | `runLoop()` — tool call/result sections |
| Tool invocation | `packages/deep-factor-agent/src/tool-adapter.ts` | `createLangChainTool` execute wrapper |
| Bash tool | `packages/deep-factor-tui/src/tools/bash.ts` | `execute` callback |
| Human-in-the-loop | `packages/deep-factor-agent/src/human-in-the-loop.ts` | `requestHumanInput` tool |
| Event → UI conversion | `packages/deep-factor-tui/src/hooks/useAgent.ts` | `eventsToChatMessages()` |

## Verification

1. Build the TUI: `pnpm -C packages/deep-factor-tui build`
2. Confirm `.js.map` files are generated in `dist/`
3. Open `packages/deep-factor-tui/` folder in VS Code
4. Set a breakpoint in a `.ts` source file (e.g., `src/tools/bash.ts`)
5. Press F5 → select "Debug TUI" → confirm breakpoint is hit when a tool call is made
