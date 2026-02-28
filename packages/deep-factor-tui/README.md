# deep-factor-tui

Fullscreen terminal UI for the [deep-factor-agent](../deep-factor-agent) — an LLM agent loop with tool use, human-in-the-loop, and token tracking. Built with [fullscreen-ink](https://github.com/DaniGuardiola/fullscreen-ink) (alternate screen buffer), [Ink](https://github.com/vadimdemedes/ink) (React for the terminal), and [meow](https://github.com/sindresorhus/meow) for arg parsing.

Unlike the streaming [CLI](../deep-factor-cli), the TUI renders a fixed layout with header, scrollable content area, and footer — similar to [`ruska --ui`](https://github.com/ruska-ai/ruska-cli).

## Prerequisites

- **Node.js** >= 18
- **pnpm** (install globally: `npm install -g pnpm`)
- An OpenAI-compatible API key

## Setup

Create `~/.deep-factor/.env` with your API key. This is the global config directory shared across projects:

```bash
mkdir -p ~/.deep-factor
echo "OPENAI_API_KEY=sk-..." > ~/.deep-factor/.env
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
  --model, -m      Model identifier (default: gpt-4.1-mini)
  --max-iter, -i   Maximum agent iterations (default: 10)
  --bash           Enable bash execution tool
```

### Examples

```bash
# Use a different model with more iterations
node dist/cli.js -m gpt-4.1 -i 20 "Summarize this project"

# Bash tool for coding tasks
node dist/cli.js --bash "What OS is this?"

# Launch with no prompt — type interactively in the TUI
node dist/cli.js
```

## Architecture

```
src/
├── cli.tsx              # Entry point — meow arg parsing + withFullScreen
├── app.tsx              # Root layout — Header / Content / Footer
├── types.ts             # Shared types (TuiAppProps, ChatMessage, AgentStatus)
├── index.ts             # Public exports (TuiApp + TuiAppProps)
├── hooks/
│   ├── useAgent.ts      # React hook bridging agent events to UI state
│   └── useTextInput.ts  # Text input with cursor (ref-based to avoid stale closures)
├── components/
│   ├── Header.tsx       # Fixed: title, model name, color-coded status indicator
│   ├── Content.tsx      # Flex-grow: message list + spinner + human input + errors
│   ├── Footer.tsx       # Fixed: status line + input bar
│   ├── MessageList.tsx  # Tail-sliced message rendering
│   ├── MessageBubble.tsx # Single message by role (user/assistant/tool_call/tool_result)
│   ├── ToolCallBlock.tsx # Tool name (bold yellow) + truncated JSON args
│   ├── InputBar.tsx     # Blue "> " prompt + text + cursor
│   └── StatusLine.tsx   # Token usage, iteration count, status
└── tools/
    └── bash.ts          # Optional bash execution tool (30s timeout)
```

**Layout:**

```
┌─────────────────────────────────────────┐
│ Deep Factor TUI    Model: gpt-4.1  ● idle │  ← Header (fixed)
├─────────────────────────────────────────┤
│                                         │
│ You: Explain React hooks                │
│ AI: React hooks are functions that...   │  ← Content (flex-grow)
│                                         │
├─────────────────────────────────────────┤
│ Tokens: 150  Iterations: 1  Status: done│  ← Footer (fixed)
│ > _                                     │
└─────────────────────────────────────────┘
```

**Data flow:**

1. `cli.tsx` parses flags and renders `<TuiApp>` via `withFullScreen()`
2. `<TuiApp>` uses `useScreenSize()` to calculate content height and renders Header/Content/Footer
3. `useAgent()` creates a `DeepFactorAgent` and runs the loop
4. Agent events (messages, tool calls, tool results) are converted to `ChatMessage[]`
5. Components render messages, status, spinner, and input prompts
6. Human-in-the-loop: agent pauses → question displayed in Content → user responds via Footer input → agent resumes

## Testing

```bash
# All TUI tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage report
pnpm coverage
```

## Development

```bash
# Watch mode (rebuilds on file changes)
pnpm dev

# Type-check without emitting
pnpm type-check
```

## Tech stack

| Concern           | Library                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| CLI args          | [meow](https://github.com/sindresorhus/meow) v13                       |
| Fullscreen        | [fullscreen-ink](https://github.com/DaniGuardiola/fullscreen-ink) v0.1 |
| Terminal UI       | [Ink](https://github.com/vadimdemedes/ink) v6 + React 19               |
| Agent loop        | [deep-factor-agent](../deep-factor-agent) (LangChain-based)            |
| Schema validation | [Zod](https://github.com/colinhacks/zod) v4                            |
| Test runner       | [Vitest](https://vitest.dev/) v4                                       |
| Coverage          | [@vitest/coverage-v8](https://vitest.dev/guide/coverage)               |
| Module system     | ESM only (`"type": "module"`)                                          |
