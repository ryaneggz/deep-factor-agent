# Plan: Match Claude Code TUI styling (user message bars)

## Context
The deepfactor TUI should visually match the Claude Code screenshot (`specs/claude.png`). Previous changes already updated bullets (`●`), input prompt (`›`), and status line (`▸▸`). Two things are still missing:

1. **User messages need a `›` prefix** — the screenshot shows `› Who won the 2001 world series?` with a right-chevron before the message text
2. **User messages need a darker background bar** — in the screenshot, user message rows have a subtle gray background spanning the full width, distinguishing them from assistant messages

## Changes

### 1. `packages/deep-factor-tui/src/components/TranscriptTurn.tsx` (line 22-25)

Add `›` prefix and a gray background bar to user messages:

```tsx
// Current:
<Box>
  <Text bold> {turn.userMessage.content}</Text>
</Box>

// New:
<Box backgroundColor="gray">
  <Text bold>{" ›  "}</Text>
  <Text bold>{turn.userMessage.content}</Text>
</Box>
```

The `backgroundColor="gray"` on the `Box` creates the full-width background bar. The `›` is separated as its own `<Text>` for clarity.

### 2. `packages/deep-factor-tui/src/components/MessageBubble.tsx` (line 18-22)

Same change for the `"user"` case:

```tsx
// Current:
<Box>
  <Text bold> {message.content}</Text>
</Box>

// New:
<Box backgroundColor="gray">
  <Text bold>{" ›  "}</Text>
  <Text bold>{message.content}</Text>
</Box>
```

## Verification
- Run `pnpm -C packages/deep-factor-tui build` to confirm it compiles
- Run `deepfactor` and send a message to visually confirm:
  - User messages show `›` prefix with gray background bar
  - Assistant messages still show `●` bullet without background
