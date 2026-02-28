# Spec: SideBar — Navigation Component

## File

`packages/deep-factor-cli/src/tui/SideBar.tsx` (new file)

## Purpose

Fixed-width sidebar with a title header and selectable navigation items. Uses `ink-select-input` for keyboard-driven item selection.

## Props Interface

```typescript
interface SideBarProps {
  items: Array<{ label: string; value: string }>;
  onSelect: (item: { label: string; value: string }) => void;
}
```

## Layout

```
┌────────────────────────────┐
│  Deep Factor               │
│                            │
│  > Chat                    │
│    Settings                │
│    Exit                    │
│                            │
│                            │
└────────────────────────────┘
```

### Ink Box Structure

```tsx
<Box flexDirection="column" width={30} borderStyle="single" paddingX={1} paddingY={1}>
  <Text bold>Deep Factor</Text>
  <Box marginTop={1}>
    <SelectInput items={items} onSelect={onSelect} />
  </Box>
</Box>
```

## Behavior

- Fixed width of 30 characters
- Border: `borderStyle="single"`
- Header: "Deep Factor" in bold text
- Navigation uses `<SelectInput>` from `ink-select-input`
  - Arrow keys (up/down) to navigate
  - Enter to select
  - Visual indicator (`>`) on focused item (built into `ink-select-input`)
- `onSelect` fires when user presses Enter on an item, delegating action to parent

## Imports

```typescript
import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
```

## Acceptance Criteria

- [ ] Renders at fixed width of 30 characters
- [ ] Shows "Deep Factor" header in bold
- [ ] Displays all passed navigation items
- [ ] Up/down arrow keys navigate between items
- [ ] Enter key triggers `onSelect` with the selected item
- [ ] Has single-line border on all sides
- [ ] TypeScript compiles without errors
