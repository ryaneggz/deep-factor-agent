# Spec: Export TUI Modules

## File

`packages/deep-factor-cli/src/index.ts`

## Current Exports

```typescript
// Types
export type {
  AgentStatus,
  ChatMessage,
  UseAgentOptions,
  UseAgentReturn,
  AppProps,
} from "./types.js";

// Hooks
export { useAgent, eventsToChatMessages } from "./hooks/useAgent.js";
export { useTextInput } from "./hooks/useTextInput.js";

// Components
export { App } from "./app.js";
export { Chat } from "./components/Chat.js";
export { ToolCall } from "./components/ToolCall.js";
export { Spinner } from "./components/Spinner.js";
export { StatusBar } from "./components/StatusBar.js";
export { HumanInput } from "./components/HumanInput.js";
export { PromptInput } from "./components/PromptInput.js";

// Tools
export { bashTool } from "./tools/bash.js";
```

## Required Additions

Append the following exports for TUI components:

```typescript
// TUI Components
export { TuiApp } from "./tui/TuiApp.js";
export { SideBar } from "./tui/SideBar.js";
export { ChatPane } from "./tui/ChatPane.js";
export { SettingsPane } from "./tui/SettingsPane.js";
```

## Notes

- All TUI components are exported as named exports
- Props interfaces for TUI components should also be exported as types if they are defined as standalone interfaces (not inline)
- This enables external consumers to compose their own TUI layouts using these building blocks

## Acceptance Criteria

- [ ] `TuiApp` is exported from `index.ts`
- [ ] `SideBar` is exported from `index.ts`
- [ ] `ChatPane` is exported from `index.ts`
- [ ] `SettingsPane` is exported from `index.ts`
- [ ] Existing exports are unchanged
- [ ] TypeScript compiles without errors
