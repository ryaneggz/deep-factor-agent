# Restore Bordered InputBar with Light Gray Border

## Context
At commit b34ee81, the InputBar had a nice rounded border box. Commit 539a5c7 ("Refine TUI styling") removed the border. The user wants the bordered input restored with a light gray border color.

## Changes

**File: `packages/deep-factor-tui/src/components/InputBar.tsx`**

1. Restore `borderStyle="round"` on the outer `<Box>`
2. Set `borderColor="gray"` (Ink's gray = light gray in terminal)
3. Restore `paddingLeft={1}` and `paddingRight={1}`
4. Restore the `> ` prefix with `color="gray"` (matching border) and `bold`
5. Change the default `borderColor` prop from `"blue"` to `"gray"` and remove the `_` prefix (it was renamed to `_borderColor` since it became unused)

### Diff summary
```tsx
// Line 39: rename back
borderColor = "gray",

// Line 54: restore border props
<Box
  borderStyle="round"
  borderColor={borderColor}
  flexDirection="column"
  paddingLeft={1}
  paddingRight={1}
>

// Line 57: restore colored prefix
<Text color={borderColor} bold>{i === 0 ? "> " : "  "}</Text>
```

## Verification
- `pnpm -C packages/deep-factor-tui build` to confirm it compiles
- Run `deepfactor` to visually confirm the bordered input with light gray border
