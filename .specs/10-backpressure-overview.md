# Spec: Backpressure Testing Scaffold — Overview

## Summary

Create a mock agent testing infrastructure that exercises the CLI's rendering under various load conditions (slow streaming, rapid bursts, large payloads, error recovery, human input) without calling a real LLM. This enables deterministic, fast, cost-free UX testing both manually and in CI — critical groundwork before implementing the fullscreen TUI.

## Motivation

- The existing `useAgent` hook calls a real LLM, making UX testing slow, expensive, and non-deterministic.
- A mock agent with configurable timing profiles will validate rendering, state transitions, and backpressure handling.
- This scaffold is reusable: once the TUI is built, the same mock scenarios can test the TUI panes.

## Scope

### In Scope

- `useMockAgent` hook — drop-in replacement for `useAgent` driven by configurable scenario scripts
- 7 preset scenario factories covering slow, burst, mixed, long-running, error, human-input, and large-payload patterns
- `AgentContext` — React context for injecting `useAgent`/`useMockAgent` without changing component props
- Minimal refactor of `App` component (1-line change) to consume agent context when available
- `MockApp` wrapper component for test rendering
- Dev script (`scripts/tui-dev.tsx`) for manual UX testing with scenario selection
- Automated `ink-testing-library` + vitest backpressure tests
- npm script entries (`tui:dev`, `test:backpressure`)
- `tsx` added as devDependency

### Out of Scope

- TUI implementation (fullscreen mode, sidebar, panes)
- Changes to the agent package itself
- Changes to any existing component's rendering logic

## New Dependencies

| Package | Type          | Purpose                                        |
| ------- | ------------- | ---------------------------------------------- |
| `tsx`   | devDependency | Run `.tsx` scripts directly without build step |

## File Inventory

| File                                                           | Action  | Spec                                                   |
| -------------------------------------------------------------- | ------- | ------------------------------------------------------ |
| `packages/deep-factor-cli/src/testing/mock-agent.ts`           | **New** | [11-mock-agent.md](./11-mock-agent.md)                 |
| `packages/deep-factor-cli/src/testing/agent-context.tsx`       | **New** | [12-agent-context.md](./12-agent-context.md)           |
| `packages/deep-factor-cli/src/testing/MockApp.tsx`             | **New** | [13-mock-app.md](./13-mock-app.md)                     |
| `packages/deep-factor-cli/src/testing/index.ts`                | **New** | [14-testing-exports.md](./14-testing-exports.md)       |
| `packages/deep-factor-cli/src/app.tsx`                         | Modify  | [12-agent-context.md](./12-agent-context.md)           |
| `packages/deep-factor-cli/scripts/tui-dev.tsx`                 | **New** | [15-dev-script.md](./15-dev-script.md)                 |
| `packages/deep-factor-cli/__tests__/tui/backpressure.test.tsx` | **New** | [16-backpressure-tests.md](./16-backpressure-tests.md) |
| `packages/deep-factor-cli/package.json`                        | Modify  | [17-package-changes.md](./17-package-changes.md)       |

## Architecture

```
Production path (unchanged):
  cli.tsx → render(<App />) → useAgent() → real LLM

Testing path (new):
  cli.tsx → render(<App />) → useAgentContext() → useMockAgent() → scenario script
                                  ↑
              MockApp wraps App with <AgentProvider value={useMockAgent(config)}>

Dev script path (new):
  scripts/tui-dev.tsx → render(<MockApp scenario="burst" />) → useMockAgent()
```

### Context Injection Pattern

```
AgentContext (React context)
  │
  ├── null (default) → App falls back to real useAgent(options)
  │
  └── UseAgentReturn (from MockApp) → App uses injected mock state
```

## Verification Checklist

1. `pnpm -C packages/deep-factor-cli build` compiles without errors
2. `pnpm -C packages/deep-factor-cli type-check` passes
3. `pnpm -C packages/deep-factor-cli test` — all existing tests still pass
4. `pnpm -C packages/deep-factor-cli test:backpressure` — new backpressure tests pass
5. `pnpm -C packages/deep-factor-cli tui:dev` — launches mock app with default scenario
6. `pnpm -C packages/deep-factor-cli tui:dev --scenario burst` — rapid events render
7. `pnpm -C packages/deep-factor-cli tui:dev --scenario slow` — delays visible
8. `pnpm -C packages/deep-factor-cli tui:dev --scenario human` — human input flow works
9. Normal CLI unchanged: `node packages/deep-factor-cli/dist/cli.js --interactive`
