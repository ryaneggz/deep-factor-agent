# Spec: SettingsPane — Settings Content Pane

## File

`packages/deep-factor-cli/src/tui/SettingsPane.tsx` (new file)

## Purpose

Displays current agent configuration and allows the user to modify settings (model name, bash tool toggle). Changes propagate to the parent `TuiApp` and take effect on the next agent invocation.

## Props Interface

```typescript
interface SettingsPaneProps {
  model: string; // Current model identifier
  enableBash: boolean; // Current bash tool state
  maxIter: number; // Current max iterations
  onModelChange: (model: string) => void; // Callback to update model
  onBashToggle: () => void; // Callback to toggle bash
}
```

## Layout

```
┌──────────────────────────────────────────┐
│  Settings                                │
│                                          │
│  Model: gpt-4.1-mini                     │
│  Press 'm' to change model               │
│                                          │
│  Bash Tool: enabled                      │
│  Press 'b' to toggle                     │
│                                          │
│  Max Iterations: 10                      │
│                                          │
│  Environment Files:                      │
│    ~/.deep-factor/.env (global)          │
│    .env (local)                          │
└──────────────────────────────────────────┘
```

### Ink Box Structure

```tsx
<Box flexDirection="column" padding={1}>
  <Text bold underline>
    Settings
  </Text>

  <Box marginTop={1} flexDirection="column">
    {/* Model setting */}
    {editingModel ? (
      <Box>
        <Text>Model: </Text>
        <TextInput value={modelDraft} onChange={setModelDraft} onSubmit={handleModelSubmit} />
      </Box>
    ) : (
      <Box flexDirection="column">
        <Text>
          Model: <Text bold>{model}</Text>
        </Text>
        <Text dimColor> Press 'm' to change model</Text>
      </Box>
    )}

    {/* Bash toggle */}
    <Box marginTop={1} flexDirection="column">
      <Text>
        Bash Tool:{" "}
        <Text bold color={enableBash ? "green" : "red"}>
          {enableBash ? "enabled" : "disabled"}
        </Text>
      </Text>
      <Text dimColor> Press 'b' to toggle</Text>
    </Box>

    {/* Max iterations (read-only) */}
    <Box marginTop={1}>
      <Text>
        Max Iterations: <Text bold>{maxIter}</Text>
      </Text>
    </Box>

    {/* Environment info */}
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>Environment Files:</Text>
      <Text dimColor> ~/.deep-factor/.env (global)</Text>
      <Text dimColor> .env (local)</Text>
    </Box>
  </Box>
</Box>
```

## Internal State

| State Variable | Type      | Default       | Description                        |
| -------------- | --------- | ------------- | ---------------------------------- |
| `editingModel` | `boolean` | `false`       | Whether model text input is active |
| `modelDraft`   | `string`  | `props.model` | Draft model value while editing    |

## Keyboard Interaction

Uses Ink's `useInput` hook for keyboard shortcuts:

```typescript
useInput((input, key) => {
  if (editingModel) return; // Don't handle shortcuts while editing

  if (input === "b") {
    onBashToggle();
  }
  if (input === "m") {
    setEditingModel(true);
    setModelDraft(model);
  }
});
```

### Model Editing Flow

1. User presses `m` → `editingModel = true`, text input appears with current model value
2. User types new model name
3. User presses Enter → `onModelChange(modelDraft)`, `editingModel = false`
4. User presses Escape → `editingModel = false` (cancel, no change)

```typescript
const handleModelSubmit = (value: string) => {
  if (value.trim()) {
    onModelChange(value.trim());
  }
  setEditingModel(false);
};
```

**Note**: For the text input when editing the model, use `ink-text-input` if available as a dependency, or implement a simple input using `useTextInput` from the existing hooks.

## Imports

```typescript
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
```

## Acceptance Criteria

- [ ] Shows current model name
- [ ] Shows bash tool status (enabled/disabled) with color coding
- [ ] Shows max iterations value
- [ ] Shows environment file paths
- [ ] Pressing `b` toggles bash tool status
- [ ] Pressing `m` enters model editing mode with text input
- [ ] Pressing Enter in model edit confirms the change
- [ ] Pressing Escape in model edit cancels without changing
- [ ] Settings header is bold and underlined
- [ ] Hint text is dimmed
- [ ] TypeScript compiles without errors
