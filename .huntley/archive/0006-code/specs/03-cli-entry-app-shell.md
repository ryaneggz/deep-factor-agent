# SPEC-03: CLI Entry Point & App Shell

## CONTEXT

### Problem Statement

The CLI needs an entry point (`cli.tsx`) that parses arguments with meow and renders the root `<App>` component with ink. The app shell (`app.tsx`) composes all child components and supports two modes: single-prompt (run once, exit) and interactive REPL.

### RELEVANT SOURCES
- [meow@13 API](https://github.com/sindresorhus/meow#api) — `importMeta`, flags, input
- [ink render()](https://github.com/vadimdemedes/ink#render) — `render(<App />)`, `waitUntilExit()`
- [ink useApp()](https://github.com/vadimdemedes/ink#useapp) — `exit()` for process termination

### RELEVANT FILES
- `packages/deep-factor-agent/src/create-agent.ts` — `createDeepFactorAgent()` signature
- `packages/deep-factor-agent/src/types.ts` — `DeepFactorAgentSettings`

---

## OVERVIEW

Implement `cli.tsx` (meow arg parsing + ink render) and `app.tsx` (root component composing Chat, Spinner, HumanInput, StatusBar, and PromptInput).

---

## USER STORIES

### US-01: CLI Entry Point (`src/cli.tsx`)

**As a** user
**I want** to run `deep-factor "my prompt"` from the terminal
**So that** I get an AI agent response rendered in my terminal

#### Flags

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--model` | `-m` | string | `gpt-4.1-mini` | Model identifier |
| `--max-iter` | `-i` | number | `10` | Maximum agent iterations |
| `--verbose` | `-v` | boolean | `false` | Verbose output |
| `--bash` | — | boolean | `false` | Enable bash execution tool |
| `--interactive` | — | boolean | `false` | REPL mode for multi-turn chat |

#### Behavior

- **Positional args** → joined as prompt string: `cli.input.join(" ")`
- **Single-prompt mode** (default): pass prompt to `<App>`, run agent loop once, exit on completion
- **Interactive mode** (`--interactive`): render REPL interface, accept multiple prompts
- **No prompt + no interactive** → show help text via `cli.showHelp()`

#### Acceptance Criteria

- [ ] `meow` parses all flags correctly with types and defaults
- [ ] `importMeta: import.meta` passed to meow
- [ ] Help text shows usage, flags, and examples
- [ ] `render(<App {...props} />)` called with parsed flags
- [ ] `waitUntilExit()` used for single-prompt mode to await completion
- [ ] Process exits with code 0 on success, 1 on error

---

### US-02: App Shell (`src/app.tsx`)

**As a** developer
**I want** a root component that composes all UI pieces
**So that** the CLI has a consistent layout regardless of mode

#### Component Tree

```
<App>
  <Chat messages={messages} verbose={verbose} />
  {status === "running" && <Spinner />}
  {status === "pending_input" && <HumanInput onSubmit={...} />}
  <StatusBar usage={usage} iterations={iterations} status={status} />
  {interactive && status === "idle" && <PromptInput onSubmit={sendPrompt} />}
</App>
```

#### Props

```ts
interface AppProps {
  prompt?: string;          // Initial prompt (single-prompt mode)
  model: string;            // Model identifier
  maxIter: number;          // Max iterations
  verbose: boolean;         // Show tool calls in detail
  enableBash: boolean;      // Include bash tool
  interactive: boolean;     // REPL mode
}
```

#### Behavior

- **Single-prompt mode**: runs prompt on mount, shows result, calls `useApp().exit()` when done
- **Interactive mode**: shows `<PromptInput>` after each completion, user submits new prompts
- **Error handling**: catches agent errors, displays with `<Text color="red">`, exits with code 1

#### Acceptance Criteria

- [ ] Composes Chat, Spinner, HumanInput, StatusBar, PromptInput components
- [ ] Single-prompt mode: runs once, exits process on completion
- [ ] Interactive mode: loops prompt → response → prompt
- [ ] Error state rendered in red
- [ ] Uses `useAgent` hook for all state management

---

## DEPENDENCY ORDER

```
SPEC-02 (scaffold) → US-01 (cli.tsx) + US-02 (app.tsx)
                          |                |
                          +--- both depend on SPEC-04 (useAgent) ---+
```
