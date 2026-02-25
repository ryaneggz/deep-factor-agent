# Plan: Create `deep-factor-cli` package with React Ink

## Context

The project currently has a single library package (`packages/deep-factor-agent`). We need a CLI/TUI companion package built with React Ink that consumes the agent library, with a proper testing environment using `ink-testing-library`. This requires converting the repo to a pnpm workspace monorepo.

---

## Step 1: Convert to pnpm workspace

The repo currently has no `pnpm-workspace.yaml` and the lock file is per-package. We need to enable workspace linking.

**Create files:**
- `/pnpm-workspace.yaml` — `packages: ["packages/*"]`
- `/package.json` — private root with `pnpm -r` scripts for build/test/type-check

**Modify:**
- `/.gitignore` — generalize paths (e.g. `node_modules/`, `dist/`, `packages/*/.env`, `coverage/`)

**Remove:**
- `packages/deep-factor-agent/pnpm-lock.yaml` — workspace lock file moves to root

**Verify:** `pnpm install` from root, then `pnpm -C packages/deep-factor-agent build && pnpm -C packages/deep-factor-agent test`

---

## Step 2: Scaffold CLI package

**Create `packages/deep-factor-cli/` with:**

```
packages/deep-factor-cli/
  package.json
  tsconfig.json
  vitest.config.ts
  scripts/postbuild.js        # Adds shebang to compiled cli.js
  src/
    cli.tsx                    # Entry point (bin)
    app.tsx                    # Root <App> component
    components/
      Chat.tsx                 # Message list display
      StatusBar.tsx            # Token usage / iteration count
      Spinner.tsx              # Thinking indicator
      ToolCall.tsx             # Tool call display
      HumanInput.tsx           # Human-in-the-loop text input
    hooks/
      useAgent.ts              # Wraps createDeepFactorAgent into React state
    tools/
      bash.ts                  # Bash execution tool (enabled via --bash flag)
    types.ts                   # CLI-specific types (ChatMessage, AgentStatus)
    index.ts                   # Re-exports for testing
  __tests__/
    app.test.tsx
    components/
      Chat.test.tsx
      StatusBar.test.tsx
```

### `package.json` key settings
```json
{
  "name": "deep-factor-cli",
  "type": "module",
  "bin": { "deep-factor": "./dist/cli.js" },
  "dependencies": {
    "deep-factor-agent": "workspace:*",
    "ink": "^6.8.0",
    "react": "^19.0.0",
    "meow": "^13.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "ink-testing-library": "^4.0.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

### `tsconfig.json` — matches agent package + adds JSX
Same as `packages/deep-factor-agent/tsconfig.json` but with `"jsx": "react-jsx"` and `.test.tsx` in exclude.

### Build pipeline
- `tsc` compiles `.ts`/`.tsx` to `dist/` (no bundler needed)
- `scripts/postbuild.js` prepends `#!/usr/bin/env node` to `dist/cli.js` and sets executable bit
- Build script: `"build": "tsc && node scripts/postbuild.js"`

---

## Step 3: Implement source skeleton

### `src/cli.tsx` — CLI entry point
- Uses `meow` for argument parsing
- Flags: `--model` / `-m` (default: `gpt-4.1-mini`), `--max-iter` / `-i` (default: 10), `--verbose` / `-v`, `--bash` (enables bash tool), `--interactive` (REPL mode)
- Single-prompt mode (default): takes prompt from positional args, runs once, exits
- Interactive mode (`--interactive`): renders REPL chat interface for multi-turn conversation
- `--bash` flag: adds a bash execution tool to the agent's tool set (runs shell commands)
- Renders `<App>` via `ink`'s `render()`

### `src/hooks/useAgent.ts` — core integration
- Creates agent via `createDeepFactorAgent()` with config (model, tools incl. optional bash tool, stop conditions)
- Runs `agent.loop(prompt)` in a `useEffect`
- Manages state: messages, status (idle/running/done/error/pending_input), usage, iterations
- Handles `isPendingResult()` for human-in-the-loop with `result.resume()`
- Extracts messages from `AgentThread.events` (MessageEvent, ToolCallEvent, ToolResultEvent)
- Exposes `sendPrompt(text)` for interactive REPL mode (creates new agent loop per prompt)

### `src/app.tsx` — root component
- Composes: `<Chat>`, `<Spinner>`, `<HumanInput>`, `<StatusBar>`, `<PromptInput>` (interactive mode only)
- Uses `useAgent` hook for all state
- In single-prompt mode: runs prompt, shows result, exits process
- In interactive mode: shows prompt input after each completion, loops

### `src/tools/bash.ts` — bash execution tool
- Uses `createLangChainTool()` from `deep-factor-agent` to create a LangChain-compatible tool
- Executes shell commands via `child_process.execSync` (or `exec` with timeout)
- Returns stdout/stderr as string result
- Only added to agent when `--bash` flag is passed

### Components
- **Chat** — renders messages filtered by role, color-coded (blue=user, green=assistant, cyan=tool)
- **StatusBar** — shows `TokenUsage.totalTokens`, `inputTokens`, `outputTokens`, iterations count
- **Spinner** — animated dots while agent is running
- **ToolCall** — formatted tool name + args + result
- **HumanInput** — captures text input via `useInput` from ink, calls `onSubmit`
- **PromptInput** — text input for interactive REPL mode (submit new prompts)

### Key types from `deep-factor-agent` consumed
- `TokenUsage` (`types.ts:96`) — `{ inputTokens, outputTokens, totalTokens }`
- `AgentResult` (`types.ts:184`) — `{ response, thread, usage, iterations, stopReason }`
- `PendingResult` (`types.ts:193`) — same + `resume()` callback
- `AgentEvent` union (`types.ts:74`) — discriminated on `type` field
- `HumanInputRequestedEvent` (`types.ts:42`) — has `question`, `context`, `urgency`, `format`, `choices`

---

## Step 4: Set up testing environment

### Vitest config
```ts
// vitest.config.ts
{ test: { include: ["__tests__/**/*.test.{ts,tsx}"], passWithNoTests: true } }
```

### Testing approach
- **`ink-testing-library`** — `render()` components, assert on `lastFrame()` output
- **Mock `deep-factor-agent`** — `vi.mock("deep-factor-agent")` with mock agent returning canned `AgentResult`
- **Component tests** — pure rendering tests for Chat, StatusBar (no agent mocking needed)
- **App integration test** — mock the agent, verify rendering lifecycle (spinner -> messages -> status bar)

### Peer dependency compatibility
`ink-testing-library@4` targets ink@5/react@18 but works with ink@6/react@19 (validated by Gemini CLI). Suppress warnings via `pnpm.peerDependencyRules.allowedVersions` if needed.

---

## Step 5: Update Makefile and docs

### Makefile additions
- `install-cli`, `build-cli`, `dev-cli`, `test-cli`, `type-check-cli` targets
- `install-all`, `build-all`, `test-all`, `check-all` workspace-wide targets

### CLAUDE.md updates
- Add CLI package build/run/test commands
- Add CLI codebase patterns section

---

## Critical files to modify

| File | Action |
|------|--------|
| `/pnpm-workspace.yaml` | Create |
| `/package.json` | Create (root) |
| `/.gitignore` | Modify (generalize paths) |
| `/Makefile` | Modify (add CLI + workspace targets) |
| `/CLAUDE.md` | Modify (add CLI docs) |
| `packages/deep-factor-agent/pnpm-lock.yaml` | Remove (moves to root) |
| `packages/deep-factor-cli/**` | Create (entire new package) |

## Verification

1. `pnpm install` — workspace resolves, both packages install
2. `pnpm -C packages/deep-factor-agent build && pnpm -C packages/deep-factor-agent test` — existing package unbroken
3. `pnpm -C packages/deep-factor-cli build` — compiles TSX, `dist/cli.js` has shebang
4. `pnpm -C packages/deep-factor-cli test` — ink-testing-library tests pass
5. `pnpm -C packages/deep-factor-cli type-check` — no type errors
6. `node packages/deep-factor-cli/dist/cli.js --help` — shows usage info
