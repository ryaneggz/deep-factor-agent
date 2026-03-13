# Plan: Optimize Chat Readability with Color Separation

## Context
User and assistant messages in the TUI are nearly indistinguishable — both use default terminal text color with only a bold label prefix ("You:" vs "AI:"). Tool calls/results also blend in. The goal is to optimize readability so users can instantly identify message ownership when scanning a conversation.

## Approach
Apply color to **both labels and content** for each message type, not just the prefixes. Use consistent colors across both the streaming view (`MessageBubble`) and the transcript view (`TranscriptTurn` + `TranscriptSegment`).

## Changes

### 1. `MessageBubble.tsx`
**File:** `packages/deep-factor-tui/src/components/MessageBubble.tsx`

- **User messages** (lines 18-23): Wrap in `color="green"` — both "You: " label and content
- **Assistant messages** (lines 25-31): Add `color="blue"` to "AI: " label (content stays default for readability of long responses)
- **Tool call** (lines 55-62): Add `color="yellow"` to the `<ToolCallBlock>` wrapper
- **Tool results** (lines 64-94): Add `color="yellow"` to "Result" label

### 2. `TranscriptTurn.tsx`
**File:** `packages/deep-factor-tui/src/components/TranscriptTurn.tsx`

- **User message** (line 23-25): Add `color="green"` to both "You" label and ": {content}" text

### 3. `TranscriptSegment.tsx`
**File:** `packages/deep-factor-tui/src/components/TranscriptSegment.tsx`

- **`renderAssistantBlock`** (lines 64-77): Add `color="blue"` to the bullet `"• "` prefix
- **`renderToolBlock`** (lines 79-134): Add `color="yellow"` to the bullet `"• "` prefix and tool name
- **Tool result connectors** (lines 121-126): Add `color="yellow"` to `"└"` characters

### 4. `ToolCallBlock.tsx`
**File:** `packages/deep-factor-tui/src/components/ToolCallBlock.tsx`

- Add `color="yellow"` to the tool label text (line 14-16)

## Color Scheme

| Message Type | Label | Content | Rationale |
|-------------|-------|---------|-----------|
| User | green bold | green | User's own input stands out clearly |
| Assistant | blue bold | default | Blue label marks AI; default body preserves long-text readability |
| Tool call | yellow bold | yellow | System activity is visually distinct |
| Tool result | yellow dim | default | Results readable but clearly scoped to tools |
| Error | red (unchanged) | red | Already distinct |
| Thinking | dim italic (unchanged) | dim italic | Already distinct via border |

## Verification
1. `pnpm -C packages/deep-factor-tui build` — typecheck passes
2. `pnpm -C packages/deep-factor-tui test` — tests pass
3. Run `deepfactor "What is 2+2?"` — visually confirm green user text, blue AI label, yellow tool activity
