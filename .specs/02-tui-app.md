# Spec: TuiApp — Root Fullscreen Component

## File

`packages/deep-factor-cli/src/tui/TuiApp.tsx` (new file)

## Purpose

Root component for the fullscreen TUI. Manages navigation state and renders the sidebar alongside the active content pane. Launched via `withFullScreen(<TuiApp />)` from the CLI entry point.

## Props Interface

```typescript
interface TuiAppProps {
  model: string; // Initial model identifier (e.g., "gpt-4.1-mini")
  maxIter: number; // Maximum agent iterations
  enableBash: boolean; // Whether to include the bash tool
}
```

## State

| State Variable | Type                   | Default            | Description           |
| -------------- | ---------------------- | ------------------ | --------------------- |
| `currentPane`  | `"chat" \| "settings"` | `"chat"`           | Active content pane   |
| `model`        | `string`               | `props.model`      | Mutable model setting |
| `enableBash`   | `boolean`              | `props.enableBash` | Mutable bash toggle   |

## Navigation Items

```typescript
const navItems = [
  { label: "Chat", value: "chat" },
  { label: "Settings", value: "settings" },
  { label: "Exit", value: "exit" },
];
```

## Layout

Horizontal flex container filling the terminal:

```
┌─────────────────────────────────────────────────────────────┐
│ ┌────────────┐ ┌──────────────────────────────────────────┐ │
│ │  Deep Factor│ │                                          │ │
│ │             │ │  Active Content Pane                     │ │
│ │  > Chat     │ │  (ChatPane or SettingsPane)              │ │
│ │    Settings │ │                                          │ │
│ │    Exit     │ │                                          │ │
│ │             │ │                                          │ │
│ │             │ │                                          │ │
│ └────────────┘ └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Ink Box Structure

```tsx
<Box flexDirection="row" width="100%" height="100%">
  <SideBar items={navItems} onSelect={handleSelect} />
  <Box flexDirection="column" flexGrow={1} borderStyle="single" paddingX={1}>
    {currentPane === "chat" && <ChatPane model={model} maxIter={maxIter} enableBash={enableBash} />}
    {currentPane === "settings" && (
      <SettingsPane
        model={model}
        enableBash={enableBash}
        maxIter={maxIter}
        onModelChange={setModel}
        onBashToggle={() => setEnableBash((prev) => !prev)}
      />
    )}
  </Box>
</Box>
```

## Event Handlers

### `handleSelect(item: { value: string })`

```typescript
const handleSelect = (item: { value: string }) => {
  if (item.value === "exit") {
    exit(); // from useApp()
    return;
  }
  setCurrentPane(item.value as "chat" | "settings");
};
```

## Exit Behavior

- When "Exit" is selected, call `useApp().exit()` from Ink
- `fullscreen-ink` handles terminal restoration (alt screen buffer cleanup, cursor restore)

## Imports

```typescript
import React, { useState } from "react";
import { Box, useApp } from "ink";
import { SideBar } from "./SideBar.js";
import { ChatPane } from "./ChatPane.js";
import { SettingsPane } from "./SettingsPane.js";
```

## Acceptance Criteria

- [ ] Renders a horizontal layout with sidebar on left, content on right
- [ ] Default pane is "chat" on launch
- [ ] Selecting "Chat" shows ChatPane
- [ ] Selecting "Settings" shows SettingsPane
- [ ] Selecting "Exit" calls `useApp().exit()` and cleanly exits
- [ ] Model and bash settings are mutable from SettingsPane and propagate to ChatPane
- [ ] Content pane has a border (`borderStyle="single"`)
- [ ] Fills available terminal width and height
- [ ] TypeScript compiles without errors
