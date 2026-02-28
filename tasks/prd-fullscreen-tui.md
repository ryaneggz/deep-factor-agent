# PRD: Fullscreen TUI Mode (`--ui`)

## Introduction

Add a `--ui` flag to `deep-factor-cli` that launches a fullscreen, panel-based terminal user interface. The TUI provides a persistent sidebar with navigation (Chat, Settings, Exit) and swappable content panes, giving power users a structured, polished experience for extended agent sessions. It reuses all existing agent infrastructure (`useAgent`, components, tools) and does not change the existing inline CLI behavior.

A companion **backpressure testing scaffold** provides a mock agent hook (`useMockAgent`), React context injection (`AgentContext`), and automated tests that exercise the CLI's rendering under various load conditions — without calling a real LLM. This groundwork is reusable for both the existing inline app and the new TUI panes.

Inspired by [ruska-cli](https://github.com/ruska-ai/ruska-cli).

## Goals

- Provide a fullscreen terminal UI for users running extended agent sessions
- Add sidebar-based navigation between Chat and Settings panes
- Reuse 100% of existing agent infrastructure (no new agent features or tools)
- Keep the existing inline CLI (`--interactive`, single-prompt) completely unchanged
- Enable runtime configuration changes (model, bash toggle) without restarting
- Create a mock agent testing scaffold for deterministic, cost-free UX testing
- Validate rendering correctness and backpressure resilience under slow, burst, and mixed load patterns

## User Stories

### US-001: Launch fullscreen TUI via `--ui` flag

**Description:** As a power user, I want to run `deep-factor --ui` so that I get a fullscreen terminal interface instead of inline output.

**Acceptance Criteria:**

- [ ] `--ui` boolean flag added to meow config (default: `false`)
- [ ] `deep-factor --help` shows `--ui` in the options list
- [ ] `deep-factor --ui` launches the fullscreen TUI (no error, no inline rendering)
- [ ] `--ui` takes precedence over `--interactive` if both are passed
- [ ] `--ui` does not require a positional `<prompt>` argument
- [ ] `--ui` does not accept `--verbose` (TUI defaults verbose to `true` internally)
- [ ] `fullscreen-ink` and TUI components are loaded via dynamic imports only when `--ui` is set
- [ ] No new top-level imports in `cli.tsx`
- [ ] TypeScript compiles without errors

### US-002: Navigate between panes via sidebar

**Description:** As a user, I want a sidebar with navigation items so that I can switch between Chat, Settings, and exit the app using keyboard controls.

**Acceptance Criteria:**

- [ ] Sidebar renders at fixed width of 30 characters with a single-line border
- [ ] Shows "Deep Factor" header in bold
- [ ] Sidebar accepts generic `items` array and `onSelect` callback props
- [ ] Displays three items: Chat, Settings, Exit
- [ ] Up/down arrow keys navigate between items (built into `ink-select-input`)
- [ ] Enter key selects the focused item
- [ ] Selecting "Chat" shows the ChatPane
- [ ] Selecting "Settings" shows the SettingsPane
- [ ] Default pane on launch is "Chat"
- [ ] TypeScript compiles without errors

### US-003: Exit the TUI cleanly

**Description:** As a user, I want to select "Exit" from the sidebar so that the TUI closes and my terminal is restored to normal.

**Acceptance Criteria:**

- [ ] Selecting "Exit" calls `useApp().exit()` from Ink
- [ ] `fullscreen-ink` restores the terminal (alt screen buffer cleanup, cursor restore)
- [ ] No leftover terminal artifacts after exit

### US-004: Chat with the agent in the TUI

**Description:** As a user, I want a chat pane inside the TUI so that I can have multi-turn conversations with the agent in a structured layout.

**Acceptance Criteria:**

- [ ] ChatPane accepts props: `model` (string), `maxIter` (number), `enableBash` (boolean)
- [ ] Renders chat history using existing `Chat` component with `verbose={true}`
- [ ] Shows `Spinner` when agent is running
- [ ] Shows `HumanInput` when agent requests human input
- [ ] Shows error messages in red when errors occur
- [ ] Shows `StatusBar` with token count, iteration count, and agent status
- [ ] Shows `PromptInput` when status is idle or done
- [ ] Sending a prompt invokes the agent and displays streamed responses
- [ ] Multi-turn conversation works (maintains thread via `useAgent`)
- [ ] Bash tool included when `enableBash` is true
- [ ] Chat component uses `<Static>` from Ink for efficient rendering of growing message history
- [ ] TypeScript compiles without errors

### US-005: View and modify settings in the TUI

**Description:** As a user, I want a settings pane so that I can view and change the model and bash tool toggle without restarting the CLI.

**Acceptance Criteria:**

- [ ] SettingsPane accepts props: `model`, `enableBash`, `maxIter`, `onModelChange`, `onBashToggle`
- [ ] Shows current model name
- [ ] Shows bash tool status (enabled/disabled) with green/red color coding
- [ ] Shows max iterations value (read-only)
- [ ] Shows environment file paths as hardcoded dimmed text (`~/.deep-factor/.env`, `.env`)
- [ ] Settings header is bold and underlined
- [ ] Pressing `b` calls `onBashToggle` callback
- [ ] Pressing `m` enters model editing mode with text input pre-filled
- [ ] Pressing Enter in model edit confirms the change via `onModelChange`
- [ ] Pressing Escape in model edit cancels without changing
- [ ] Keyboard shortcuts are disabled while editing model text
- [ ] Hint text for shortcuts is dimmed
- [ ] Settings changes propagate to ChatPane and take effect on the next prompt
- [ ] TypeScript compiles without errors

### US-006: Assemble TuiApp root component

**Description:** As a developer, I want TuiApp to integrate the sidebar with swappable content panes and manage shared settings state.

**Acceptance Criteria:**

- [ ] TuiApp accepts props: `model` (string), `maxIter` (number), `enableBash` (boolean)
- [ ] Manages mutable state for `model` and `enableBash` (initialized from props)
- [ ] Renders horizontal flex layout: fixed-width SideBar (left) + flex content pane (right)
- [ ] Content pane has `flexGrow={1}`, `borderStyle="single"`, and padding
- [ ] Both sidebar and content pane fill full terminal height
- [ ] Default pane on launch is "chat"
- [ ] Selecting "Chat" shows ChatPane; selecting "Settings" shows SettingsPane
- [ ] Selecting "Exit" calls `useApp().exit()`
- [ ] Settings changes from SettingsPane propagate to ChatPane props
- [ ] TypeScript compiles without errors

### US-007: Export TUI components from package index

**Description:** As a library consumer, I want the TUI components exported from the package so that I can compose custom TUI layouts.

**Acceptance Criteria:**

- [ ] `TuiApp` is exported from `src/index.ts`
- [ ] `SideBar` is exported from `src/index.ts`
- [ ] `ChatPane` is exported from `src/index.ts`
- [ ] `SettingsPane` is exported from `src/index.ts`
- [ ] Existing exports are unchanged
- [ ] TypeScript compiles without errors

### US-008: Create mock agent hook with preset scenarios

**Description:** As a developer, I want a `useMockAgent` hook that replays configurable scenario steps on a timer so that I can test the CLI rendering without calling a real LLM.

**Acceptance Criteria:**

- [ ] `useMockAgent(config)` returns the exact same `UseAgentReturn` shape as `useAgent`
- [ ] `sendPrompt()` transitions status: idle → running → (varies by scenario) → done
- [ ] `submitHumanInput()` resumes from paused human_input step
- [ ] Timeouts are cleaned up on unmount (no "state update after unmount" warnings)
- [ ] Step types supported: `message`, `tool_call`, `tool_result`, `human_input`, `error`, `done`
- [ ] 7 preset scenario factories exported: `slowConversation`, `rapidBurst`, `mixedPressure`, `longRunning`, `errorRecovery`, `humanInputFlow`, `largePayload`
- [ ] Each preset produces the documented step sequence with configurable delays
- [ ] No imports from `deep-factor-agent` runtime code (only type imports)
- [ ] TypeScript compiles without errors

### US-009: Create AgentContext for hook injection

**Description:** As a developer, I want a React context that injects `UseAgentReturn` so that `App` can use either the real `useAgent` or a mock without changing its props interface.

**Acceptance Criteria:**

- [ ] `AgentProvider` and `useAgentContext` exported from `src/testing/agent-context.tsx`
- [ ] `App` imports `useAgentContext` and uses context-first pattern: `agentFromContext ?? useAgent(options)`
- [ ] When no `AgentProvider` wraps `App`, behavior is 100% unchanged (context returns `null`, falls back to `useAgent`)
- [ ] When `AgentProvider` wraps `App` with a mock value, `App` uses the mock value
- [ ] No conditional hook calls introduced (both hooks always execute)
- [ ] All existing tests pass without modification
- [ ] TypeScript compiles without errors

### US-010: Create MockApp test wrapper component

**Description:** As a developer, I want a `MockApp` wrapper that renders `App` inside `AgentProvider` with `useMockAgent` for one-line test rendering.

**Acceptance Criteria:**

- [ ] `MockApp` renders `App` wrapped in `AgentProvider`
- [ ] Accepts `scenario` shorthand prop: `"slow" | "burst" | "mixed" | "long" | "error" | "human" | "large"`
- [ ] Accepts `config` prop for custom `MockAgentConfig`
- [ ] Default scenario is `mixedPressure()` when neither prop is given
- [ ] `verbose` defaults to `true`, `interactive` defaults to `true`
- [ ] `enableBash` is always `false` (mock doesn't execute real tools)
- [ ] Can be rendered with `ink-testing-library`'s `render()`
- [ ] TypeScript compiles without errors

### US-011: Create testing barrel export

**Description:** As a developer, I want a barrel export at `src/testing/index.ts` so test consumers can import from a single path.

**Acceptance Criteria:**

- [ ] Re-exports: `useMockAgent`, all 7 preset factories, `MockScenarioStep` and `MockAgentConfig` types
- [ ] Re-exports: `AgentProvider`, `useAgentContext`
- [ ] Re-exports: `MockApp`
- [ ] NOT added to the main `src/index.ts` (internal-only)
- [ ] TypeScript compiles without errors

### US-012: Create dev script for manual UX testing

**Description:** As a developer, I want a dev script that renders the app with a selectable mock scenario so I can manually test UX behavior.

**Acceptance Criteria:**

- [ ] `pnpm -C packages/deep-factor-cli tui:dev` runs without error
- [ ] Default scenario is `mixed` when no `--scenario` arg
- [ ] Each valid scenario name (`slow`, `burst`, `mixed`, `long`, `error`, `human`, `large`) renders the corresponding mock
- [ ] Invalid scenario name prints error and exits with code 1
- [ ] App renders interactively with prompt input
- [ ] Mock agent events fire with correct delays
- [ ] Ctrl+C cleanly exits
- [ ] No build step required (runs via `tsx`)

### US-013: Create automated backpressure tests

**Description:** As a developer, I want automated tests that exercise the app under each mock scenario so I can validate rendering correctness and resilience.

**Acceptance Criteria:**

- [ ] All test cases pass with `vitest run`
- [ ] Tests use fake timers — no real delays
- [ ] `MockApp` is used (not raw `App` with mocked `useAgent`)
- [ ] No real LLM calls made during tests
- [ ] Each of the 7 scenarios has at least 2 test cases
- [ ] Tests cover: state transitions, message ordering, error display, human input flow, large content
- [ ] Tests run via `pnpm -C packages/deep-factor-cli test:backpressure`
- [ ] Tests don't interfere with existing test suite
- [ ] Test file location: `__tests__/tui/backpressure.test.tsx`

### US-014: Update package.json with new scripts and dependencies

**Description:** As a developer, I want the package.json updated with all new dependencies, dev dependencies, and npm scripts.

**Acceptance Criteria:**

- [ ] `fullscreen-ink`, `ink-select-input`, `ink-spinner` added to dependencies
- [ ] `tsx` added to devDependencies
- [ ] `tui:dev` script added: `tsx scripts/tui-dev.tsx`
- [ ] `test:backpressure` script added: `vitest run --testPathPattern=tui/backpressure`
- [ ] All existing scripts remain unchanged
- [ ] `pnpm install` resolves without errors

### US-015: Existing CLI modes remain unaffected

**Description:** As an existing user, I want the single-prompt and interactive modes to work exactly as before so that nothing breaks.

**Acceptance Criteria:**

- [ ] `deep-factor "Hello"` still works as single-prompt mode
- [ ] `deep-factor --interactive` still works as interactive mode
- [ ] Existing tests pass (`pnpm -C packages/deep-factor-cli test`)
- [ ] No behavioral changes when `--ui` is not passed

## Functional Requirements

### TUI Components

- FR-1: Add `--ui` boolean flag to meow CLI config (default: `false`)
- FR-2: When `--ui` is set, dynamically import `fullscreen-ink` and render `<TuiApp>` via `withFullScreen()`
- FR-3: When `--ui` is not set, execute the existing code path unchanged
- FR-4: `TuiApp` accepts `model`, `maxIter`, and `enableBash` props; manages `model` and `enableBash` as mutable state
- FR-5: `TuiApp` renders a horizontal flex layout: fixed-width sidebar (left) + flex content pane (right)
- FR-6: `SideBar` accepts generic `items` and `onSelect` props; uses `ink-select-input` for keyboard-driven navigation
- FR-7: `ChatPane` accepts `model`, `maxIter`, `enableBash` props; reuses `useAgent`, `Chat`, `Spinner`, `StatusBar`, `HumanInput`, and `PromptInput` components
- FR-8: `ChatPane` always operates in interactive mode with `verbose={true}`
- FR-9: `SettingsPane` accepts `model`, `enableBash`, `maxIter`, `onModelChange`, `onBashToggle` props
- FR-10: `SettingsPane` displays model, bash toggle, max iterations, and hardcoded environment file paths
- FR-11: `SettingsPane` allows changing model (press `m` → text input → Enter/Escape) and toggling bash (press `b`)
- FR-12: Settings changes propagate from `TuiApp` state to `ChatPane` props, taking effect on next prompt
- FR-13: "Exit" navigation item calls `useApp().exit()` to cleanly close the TUI
- FR-14: Export `TuiApp`, `SideBar`, `ChatPane`, `SettingsPane` from `src/index.ts`

### Backpressure Testing Scaffold

- FR-15: `useMockAgent(config)` returns the same `UseAgentReturn` interface as `useAgent`
- FR-16: `useMockAgent` replays `MockScenarioStep[]` on a timer, supporting: `message`, `tool_call`, `tool_result`, `human_input`, `error`, `done` step types
- FR-17: `useMockAgent` pauses at `human_input` steps and resumes on `submitHumanInput()`
- FR-18: `useMockAgent` cleans up pending timeouts on unmount
- FR-19: 7 preset scenario factories: `slowConversation`, `rapidBurst`, `mixedPressure`, `longRunning`, `errorRecovery`, `humanInputFlow`, `largePayload`
- FR-20: `AgentContext` provides `AgentProvider` and `useAgentContext` for injecting mock or real agent state
- FR-21: `App` component uses context-first pattern: `useAgentContext() ?? useAgent(options)` — no conditional hook calls
- FR-22: `MockApp` renders `App` inside `AgentProvider` with `useMockAgent`, accepts `scenario` shorthand or custom `config`
- FR-23: Testing barrel export at `src/testing/index.ts` (internal-only, not in main `src/index.ts`)
- FR-24: Dev script at `scripts/tui-dev.tsx` for manual UX testing with scenario selection
- FR-25: Automated backpressure tests at `__tests__/tui/backpressure.test.tsx` with fake timers, covering all 7 scenarios

## Non-Goals (Out of Scope)

- No changes to existing inline rendering behavior
- No new agent features or tools
- No persistent settings storage (settings reset on restart)
- No theming or color customization
- No mouse support
- No resizable panes or draggable borders
- No `--verbose` support in TUI mode (always verbose)
- No automatic priority assignment for agent tasks
- No changes to the agent package itself

## Design Considerations

### TUI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ┌────────────┐ ┌──────────────────────────────────────────┐ │
│ │  Deep Factor│ │                                          │ │
│ │             │ │  Active Content Pane                     │ │
│ │  > Chat     │ │  (ChatPane or SettingsPane)              │ │
│ │    Settings │ │                                          │ │
│ │    Exit     │ │                                          │ │
│ │             │ │                                          │ │
│ └────────────┘ └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- Sidebar: fixed 30-character width, `borderStyle="single"`, padded
- Content pane: `flexGrow={1}`, `borderStyle="single"`, padded
- Both fill full terminal height

### ChatPane Layout

```
┌──────────────────────────────────────────┐
│  [Chat history - scrollable via Static]  │
│  > User message                          │
│  Assistant response...                   │
│  🔧 tool_name(args)                      │
│  ← tool result                           │
│                                          │
│  Thinking...                             │  ← Spinner (when running)
│  ? Human input question                  │  ← HumanInput (when pending)
│  ⚠ Error message                         │  ← Error (when error)
│  ─────────────────────────────────────── │
│  Tokens: 1,234 | Iter: 2 | Status: idle │  ← StatusBar
│  > _                                     │  ← PromptInput
└──────────────────────────────────────────┘
```

### Architecture

```
CLI Entry (cli.tsx)
  │
  ├── --ui flag OFF → existing App component (unchanged)
  │
  └── --ui flag ON → withFullScreen(<TuiApp />)
                       │
                       ├── <SideBar />          (fixed-width left panel)
                       │     └── SelectInput     (Chat | Settings | Exit)
                       │
                       └── Content Pane          (flex right panel)
                             ├── <ChatPane />    (when nav === "chat")
                             └── <SettingsPane />(when nav === "settings")
```

### Context Injection (Testing)

```
Production path (unchanged):
  cli.tsx → render(<App />) → useAgent() → real LLM

Testing path (new):
  cli.tsx → render(<App />) → useAgentContext() → useMockAgent() → scenario script
                                  ↑
              MockApp wraps App with <AgentProvider value={useMockAgent(config)}>

AgentContext (React context)
  │
  ├── null (default) → App falls back to real useAgent(options)
  │
  └── UseAgentReturn (from MockApp) → App uses injected mock state
```

### Existing Components Reused

- `Chat` — message history display
- `Spinner` — loading indicator during agent execution
- `StatusBar` — token/iteration/status info bar
- `HumanInput` — human-in-the-loop input component
- `PromptInput` — text input for user prompts
- `useAgent` hook — agent state management bridge
- `bashTool` — optional bash tool

## Technical Considerations

### New Dependencies

| Package            | Type          | Purpose                                                           |
| ------------------ | ------------- | ----------------------------------------------------------------- |
| `fullscreen-ink`   | dependency    | Wraps Ink render in fullscreen mode with terminal restore on exit |
| `ink-select-input` | dependency    | Sidebar navigation selector component                             |
| `ink-spinner`      | dependency    | Animated spinner for streaming/thinking state                     |
| `tsx`              | devDependency | Run `.tsx` scripts directly without build step (dev script only)  |

Install: `pnpm -C packages/deep-factor-cli add fullscreen-ink ink-select-input ink-spinner && pnpm -C packages/deep-factor-cli add -D tsx`

### New Files

| File                                  | Description                                                                   | Spec                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/tui/TuiApp.tsx`                  | Root fullscreen component — manages nav state, renders sidebar + content pane | [02-tui-app.md](.specs/02-tui-app.md)                       |
| `src/tui/SideBar.tsx`                 | Fixed-width sidebar with title and `SelectInput` navigation                   | [03-sidebar.md](.specs/03-sidebar.md)                       |
| `src/tui/ChatPane.tsx`                | Chat pane reusing `useAgent` and all existing display components              | [04-chat-pane.md](.specs/04-chat-pane.md)                   |
| `src/tui/SettingsPane.tsx`            | Settings display with `useInput` keyboard shortcuts for model/bash changes    | [05-settings-pane.md](.specs/05-settings-pane.md)           |
| `src/testing/mock-agent.ts`           | `useMockAgent` hook + 7 preset scenario factories                             | [11-mock-agent.md](.specs/11-mock-agent.md)                 |
| `src/testing/agent-context.tsx`       | `AgentProvider` + `useAgentContext` for hook injection                        | [12-agent-context.md](.specs/12-agent-context.md)           |
| `src/testing/MockApp.tsx`             | Test wrapper rendering `App` inside `AgentProvider`                           | [13-mock-app.md](.specs/13-mock-app.md)                     |
| `src/testing/index.ts`                | Barrel export for testing module (internal-only)                              | [14-testing-exports.md](.specs/14-testing-exports.md)       |
| `scripts/tui-dev.tsx`                 | Dev script for manual UX testing with scenario selection                      | [15-dev-script.md](.specs/15-dev-script.md)                 |
| `__tests__/tui/backpressure.test.tsx` | Automated backpressure tests (vitest + ink-testing-library)                   | [16-backpressure-tests.md](.specs/16-backpressure-tests.md) |

### Modified Files

| File           | Change                                                               | Spec                                                  |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| `src/cli.tsx`  | Add `--ui` flag, conditional branch with dynamic imports             | [01-cli-flag.md](.specs/01-cli-flag.md)               |
| `src/app.tsx`  | 1-line change: import `useAgentContext`, use context-first pattern   | [12-agent-context.md](.specs/12-agent-context.md)     |
| `src/index.ts` | Add 4 new TUI component exports                                      | [06-exports.md](.specs/06-exports.md)                 |
| `package.json` | Add 3 deps, 1 devDep, 2 new scripts (`tui:dev`, `test:backpressure`) | [17-package-changes.md](.specs/17-package-changes.md) |

### Architecture Notes

- ESM-only (`"type": "module"`)
- Dynamic imports for TUI code to avoid loading `fullscreen-ink` when not needed
- `useAgent` hook manages agent lifecycle; ChatPane wraps it in always-interactive mode
- Settings are held as state in `TuiApp` and passed down as props — no persistent storage
- `AgentContext` uses React context with null default; `App` always calls both `useAgentContext()` and `useAgent()` to satisfy Rules of Hooks — the nullish coalescing only selects which result to destructure
- `useMockAgent` is lazy: it only creates the real agent when `sendPrompt` is called, so calling it when unused is harmless
- `MockApp` is internal-only (not exported from main `src/index.ts`)

## Success Metrics

- `pnpm -C packages/deep-factor-cli build` compiles without errors
- `pnpm -C packages/deep-factor-cli type-check` passes
- `pnpm -C packages/deep-factor-cli test` — all existing tests pass
- `pnpm -C packages/deep-factor-cli test:backpressure` — all backpressure tests pass
- `pnpm -C packages/deep-factor-cli tui:dev` — launches mock app with default scenario
- `deep-factor --ui` launches fullscreen TUI with sidebar navigation
- Chat pane accepts prompts and displays multi-turn agent responses
- Settings pane allows model and bash changes at runtime
- Exit cleanly restores the terminal
- All existing CLI modes and tests remain unaffected

## Open Questions

- Should `ink-text-input` be added as a dependency for the model editing input, or should we reuse the existing `useTextInput` hook from the codebase? (Spec 05 notes: "use `ink-text-input` if available, or implement using existing `useTextInput`")
- Should keyboard focus management be added so sidebar shortcuts don't interfere with ChatPane's prompt input?
