# Spec: Fullscreen TUI Mode (`--ui`) — Overview

## Summary

Add a `--ui` flag to `deep-factor-cli` that launches a fullscreen, panel-based terminal user interface. The TUI provides a sidebar with navigation (Chat, Settings, Exit) and swappable content panes. It reuses all existing agent infrastructure (`useAgent`, components, tools).

## Motivation

The current CLI renders inline in the terminal with a simple vertical stack. A fullscreen TUI offers:

- Persistent sidebar navigation between Chat and Settings
- Dedicated content panes with borders and structure
- Polished user experience for extended sessions

Inspired by [ruska-cli](https://github.com/ruska-ai/ruska-cli).

## Scope

### In Scope

- New `--ui` boolean flag on the CLI entry point
- Four new files under `src/tui/`: `TuiApp.tsx`, `SideBar.tsx`, `ChatPane.tsx`, `SettingsPane.tsx`
- Integration with `fullscreen-ink` for fullscreen terminal rendering
- Reuse of existing `useAgent` hook, `Chat`, `StatusBar`, `Spinner`, `HumanInput`, `PromptInput` components
- Export of new TUI modules from `src/index.ts`

### Out of Scope

- Changes to existing inline rendering behavior
- New agent features or tools
- Persistent settings storage
- Theming or color customization

## New Dependencies

| Package            | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `fullscreen-ink`   | Wraps Ink render in fullscreen mode with terminal restore on exit |
| `ink-select-input` | Sidebar navigation selector component                             |
| `ink-spinner`      | Polished animated spinner for streaming/thinking state            |

Install via: `pnpm -C packages/deep-factor-cli add fullscreen-ink ink-select-input ink-spinner`

## File Inventory

| File                                                | Action  | Spec                                         |
| --------------------------------------------------- | ------- | -------------------------------------------- |
| `packages/deep-factor-cli/package.json`             | Modify  | Add 3 new dependencies                       |
| `packages/deep-factor-cli/src/cli.tsx`              | Modify  | [01-cli-flag.md](./01-cli-flag.md)           |
| `packages/deep-factor-cli/src/tui/TuiApp.tsx`       | **New** | [02-tui-app.md](./02-tui-app.md)             |
| `packages/deep-factor-cli/src/tui/SideBar.tsx`      | **New** | [03-sidebar.md](./03-sidebar.md)             |
| `packages/deep-factor-cli/src/tui/ChatPane.tsx`     | **New** | [04-chat-pane.md](./04-chat-pane.md)         |
| `packages/deep-factor-cli/src/tui/SettingsPane.tsx` | **New** | [05-settings-pane.md](./05-settings-pane.md) |
| `packages/deep-factor-cli/src/index.ts`             | Modify  | [06-exports.md](./06-exports.md)             |

## Architecture

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

## Verification Checklist

1. `pnpm -C packages/deep-factor-cli build` compiles without errors
2. `pnpm -C packages/deep-factor-cli type-check` passes
3. `node packages/deep-factor-cli/dist/cli.js --ui` launches fullscreen TUI
4. Sidebar navigation works between Chat, Settings, Exit
5. Chat pane accepts prompts and displays agent responses
6. Settings pane shows current configuration
7. Exit selection cleanly restores terminal
8. `node packages/deep-factor-cli/dist/cli.js "Hello"` still works (single-prompt mode)
9. `node packages/deep-factor-cli/dist/cli.js --interactive` still works
10. `pnpm -C packages/deep-factor-cli test` existing tests pass
