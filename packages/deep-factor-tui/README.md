# deep-factor-tui

Inline terminal UI for the [deep-factor-agent](../deep-factor-agent) — an LLM agent loop with tool use, human-in-the-loop, and token tracking. Built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal) and [meow](https://github.com/sindresorhus/meow) for arg parsing.

Unlike the streaming [CLI](../deep-factor-cli), the TUI renders messages inline using Ink's `<Static>` component for scrollback and a `<LiveSection>` for the active input area at the bottom of the terminal.

## Prerequisites

- **Node.js** >= 18
- **pnpm** (install globally: `npm install -g pnpm`)
- An OpenAI-compatible API key

## Setup

Create `~/.deepfactor/.env` with your API key. This is the global config directory shared across projects:

```bash
mkdir -p ~/.deepfactor
echo "OPENAI_API_KEY=sk-..." > ~/.deepfactor/.env
```

A local `.env` in the working directory is also supported and takes precedence over the global one. You can also export directly in your shell:

```bash
export OPENAI_API_KEY=sk-...
```

## Install

From the **repository root**:

```bash
pnpm install
pnpm -r build
```

Or build just the TUI package (after the agent package is built):

```bash
pnpm -C packages/deep-factor-agent build
pnpm -C packages/deep-factor-tui build
```

## Usage

### Standalone binary

```bash
node dist/cli.js
node dist/cli.js "Explain how React hooks work"
```

### Via existing CLI

The TUI is also accessible from the main CLI binary with the `--tui` flag:

```bash
node packages/deep-factor-cli/dist/cli.js --tui
node packages/deep-factor-cli/dist/cli.js --tui "Explain React hooks"
```

### With bash tool

Enable the optional bash execution tool so the agent can run shell commands:

```bash
node dist/cli.js --bash "List all TypeScript files in this directory"
```

### All flags

```
Options
  --provider       Provider: langchain, claude (default: langchain)
  --model, -m      Model identifier (default: gpt-4.1-mini)
  --max-iter, -i   Maximum agent iterations (default: 10)
  --mode           Execution mode: plan, approve, yolo (default: yolo)
  --sandbox, -s    Sandbox mode: workspace (default), local, docker
  --print, -p      Non-interactive print mode (output answer to stdout)
```

### Examples

```bash
# Use a different model with more iterations
deepfactor -m gpt-4.1 -i 20 "Summarize this project"

# Planning mode
deepfactor --mode plan "Plan a refactor for this repo"

# Approval-gated writes
deepfactor --mode approve "Make the requested code changes"

# Local sandbox (full system access)
deepfactor -s local "What OS is this?"

# Launch with no prompt — type interactively in the TUI
deepfactor

# Print mode — non-interactive, outputs answer to stdout
deepfactor -p "What is 2+2?"

# Claude CLI provider using existing CLI auth
deepfactor --provider claude -p "Reply with exactly: hello"

# Print mode with local sandbox
deepfactor -p -s local "List files in the current directory"

# Pipe stdin in print mode
cat PROMPT.md | deepfactor -p
```

## Architecture

```
src/
├── cli.tsx              # Entry point — meow arg parsing + ink.render
├── app.tsx              # Root layout — <Static> for scrollback + <LiveSection> for active UI
├── types.ts             # Shared types (TuiAppProps, ChatMessage, AgentStatus)
├── index.ts             # Public exports (TuiApp + TuiAppProps)
├── hooks/
│   ├── useAgent.ts      # React hook bridging agent events to UI state
│   └── useTextInput.ts  # Text input with cursor (ref-based to avoid stale closures)
├── components/
│   ├── Header.tsx       # Title, model name, color-coded status indicator
│   ├── LiveSection.tsx  # Active UI: spinner, errors, status line, input bar
│   ├── MessageBubble.tsx # Single message by role (user/assistant/tool_call/tool_result)
│   ├── ToolCallBlock.tsx # Tool name (bold yellow) + truncated JSON args
│   ├── InputBar.tsx     # Blue "> " prompt + text + cursor
│   └── StatusLine.tsx   # Token usage, iteration count, status
└── tools/
    └── bash.ts          # Optional bash execution tool (30s timeout)
```

**Layout:**

```
Deep Factor TUI    Model: gpt-4.1  ● idle     ← Header (static, scrolls up)

You: Explain React hooks                      ← Messages (static, scroll into
AI: React hooks are functions that...            terminal scrollback)

Tokens: 150  Iterations: 1  Status: done      ← LiveSection (always visible
> _                                              at bottom)
```

**Data flow:**

1. `cli.tsx` parses flags and renders `<TuiApp>` via `ink.render()`
2. `<TuiApp>` uses Ink's `<Static>` to emit header and messages into terminal scrollback, with `<LiveSection>` always visible at the bottom
3. `useAgent()` creates a `DeepFactorAgent` and runs the loop
4. Agent events (messages, tool calls, tool results) are converted to `ChatMessage[]`
5. Components render messages, status, spinner, and input prompts
6. Human-in-the-loop: agent pauses → question displayed → user responds via input bar → agent resumes

## Testing

```bash
# All TUI tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage report
pnpm coverage
```

Test suite:

| File                  | Type        | Coverage                                                                                 |
| --------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `components.test.tsx` | Unit        | Header, StatusLine, LiveSection, MessageBubble, ToolCallBlock, InputBar                  |
| `app.test.tsx`        | Integration | TuiApp with mocked useAgent — verifies inline rendering, messages display, status states |
| `print.test.ts`       | Unit        | Print mode headless agent output                                                         |
| `cli-e2e.test.ts`     | E2E         | Binary startup smoke test, provider parsing, print mode errors                           |
| `claude-cli.smoke.ts` | Smoke       | Built CLI wrapper validation against local `claude` auth                                 |

## Development

```bash
# Watch mode (rebuilds on file changes)
pnpm dev

# Type-check without emitting
pnpm type-check
```

## Tech stack

| Concern           | Library                                                     |
| ----------------- | ----------------------------------------------------------- |
| CLI args          | [meow](https://github.com/sindresorhus/meow) v13            |
| Terminal UI       | [Ink](https://github.com/vadimdemedes/ink) v6 + React 19    |
| Agent loop        | [deep-factor-agent](../deep-factor-agent) (LangChain-based) |
| Schema validation | [Zod](https://github.com/colinhacks/zod) v4                 |
| Test runner       | [Vitest](https://vitest.dev/) v4                            |
| Coverage          | [@vitest/coverage-v8](https://vitest.dev/guide/coverage)    |
| Module system     | ESM only (`"type": "module"`)                               |
