# deep-factor-cli

Terminal UI for the [deep-factor-agent](../deep-factor-agent) — an LLM agent loop with tool use, human-in-the-loop, and token tracking. Built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal) and [meow](https://github.com/sindresorhus/meow) for arg parsing.

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

Or build just the CLI package (after the agent package is built):

```bash
pnpm -C packages/deep-factor-agent build
pnpm -C packages/deep-factor-cli build
```

## Usage

### Single-prompt mode

Pass a prompt as a positional argument. The CLI runs the agent loop, prints the response, and exits.

```bash
node dist/cli.js "Explain how React hooks work"
```

### Interactive mode

Start a multi-turn REPL. Type prompts, press Enter, and the agent responds. Repeat as needed.

```bash
node dist/cli.js --interactive
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
  --verbose, -v    Show tool calls and detailed output
  --bash           Enable bash execution tool
  --interactive    Interactive REPL mode for multi-turn chat
```

### Examples

```bash
# Use a different model with more iterations
node dist/cli.js -m gpt-4.1 -i 20 "Summarize this project"

# Verbose output shows tool calls and results
node dist/cli.js -v --bash "What OS is this?"

# Interactive + bash for a coding assistant session
node dist/cli.js --interactive --bash -m gpt-4.1
```

### Global install (optional)

Link the CLI as a global `deep-factor` command:

```bash
pnpm -C packages/deep-factor-cli link
deep-factor "Hello, agent"
```

## Architecture

```
src/
├── cli.tsx              # Entry point — meow arg parsing + ink render
├── app.tsx              # Root component — orchestrates modes and state
├── types.ts             # Shared types (ChatMessage, AgentStatus, AppProps)
├── index.ts             # Public API barrel export
├── hooks/
│   └── useAgent.ts      # React hook bridging agent events to UI state
├── components/
│   ├── Chat.tsx         # Message list (Static rendering, color-coded roles)
│   ├── StatusBar.tsx    # Token usage, iteration count, color-coded status
│   ├── Spinner.tsx      # Animated "Thinking..." indicator
│   ├── ToolCall.tsx     # Verbose tool call display (name + truncated args)
│   ├── HumanInput.tsx   # Human-in-the-loop input (question + choices)
│   └── PromptInput.tsx  # Interactive mode text input
└── tools/
    └── bash.ts          # Optional bash execution tool (execSync, 30s timeout)
```

**Data flow:**

1. `cli.tsx` parses flags and renders `<App>` via Ink
2. `<App>` calls `useAgent()` which creates a `DeepFactorAgent` and runs the loop
3. Agent events (messages, tool calls, tool results) are converted to `ChatMessage[]`
4. Components render messages, status, spinner, and input prompts
5. Human-in-the-loop: agent pauses → `HumanInput` shown → user responds → agent resumes

## Testing

### Run tests

```bash
# All CLI tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage report
pnpm coverage
```

### Test suite

| File | Description | Tests |
|------|-------------|-------|
| `__tests__/app.test.tsx` | App integration (single-prompt, interactive, error, bash flag) | 18 |
| `__tests__/hooks/useAgent.test.tsx` | `useAgent` hook + `eventsToChatMessages` pure function | 25 |
| `__tests__/components/Chat.test.tsx` | Message rendering, verbose toggle, truncation | 8 |
| `__tests__/components/StatusBar.test.tsx` | Token display, status colors, formatting | 3 |
| `__tests__/components/Spinner.test.tsx` | Dot animation cycling, timer cleanup | 7 |
| `__tests__/components/ToolCall.test.tsx` | Arg truncation, nested objects, null handling | 9 |
| `__tests__/components/HumanInput.test.tsx` | Keypress accumulation, choices, submit, backspace | 16 |
| `__tests__/components/PromptInput.test.tsx` | Input handling, submit, empty rejection | 10 |
| `__tests__/tools/bash.test.ts` | execSync args, timeout, error paths | 14 |

**Total: 110 tests** — all mocked, no API calls.

### Test patterns

- **Rendering**: `ink-testing-library` for component tests
- **Mocking**: `vi.hoisted()` + `vi.mock()` for ESM-compatible dependency isolation
- **Async stdin**: `stdin.write()` with `vi.waitFor()` and `delay()` for React 19 batching
- **Fake timers**: `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` for Spinner tests

## Development

```bash
# Watch mode (rebuilds on file changes)
pnpm dev

# Type-check without emitting
pnpm type-check
```

## Tech stack

| Concern | Library |
|---------|---------|
| CLI args | [meow](https://github.com/sindresorhus/meow) v13 |
| Terminal UI | [Ink](https://github.com/vadimdemedes/ink) v6 + React 19 |
| Agent loop | [deep-factor-agent](../deep-factor-agent) (LangChain-based) |
| Schema validation | [Zod](https://github.com/colinhacks/zod) v4 |
| Test runner | [Vitest](https://vitest.dev/) v4 |
| Coverage | [@vitest/coverage-v8](https://vitest.dev/guide/coverage) |
| Module system | ESM only (`"type": "module"`) |
