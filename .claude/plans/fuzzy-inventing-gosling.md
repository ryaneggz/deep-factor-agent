# Plan: Switch TUI from Fullscreen to Inline Terminal Rendering

## Context

The current TUI uses `fullscreen-ink` which renders in an alternate screen buffer, preventing normal terminal scrolling. The Claude Code interface (see `specs/claude-term.png`) renders inline — content flows naturally with terminal scrollback, and only the active input area is re-rendered. We need to replicate this pattern.

## Core Approach

Use Ink's `<Static>` component to render past messages into terminal scrollback (rendered once, never re-rendered), while keeping only the active section (input + status) as Ink-managed. Remove `fullscreen-ink` entirely.

## Steps

### 1. Add `id` field to `ChatMessage`

**File:** `packages/deep-factor-tui/src/types.ts`
- Add `id: string` to `ChatMessage` interface (required for `<Static>` keys)

**File:** `packages/deep-factor-tui/src/hooks/useAgent.ts`
- In `eventsToChatMessages()`, assign `id: \`msg-${index}\`` to each message

### 2. Create `LiveSection` component

**New file:** `packages/deep-factor-tui/src/components/LiveSection.tsx`

Consolidates the "active" UI that Ink manages (re-renders on state changes):
- Thinking indicator (status === "running")
- Plan review prompt (pending_input + plan_review)
- Human input request display
- Approved plan display (done + plan)
- Error display
- StatusLine
- InputBar (when idle/done/pending_input)

### 3. Rewrite `app.tsx` layout

**File:** `packages/deep-factor-tui/src/app.tsx`

Replace flex layout with `<Static>` + `<LiveSection>`:
```tsx
<>
  <Static items={staticItems}>
    {(item) => /* render Header once, then MessageBubbles */}
  </Static>
  <LiveSection ... />
</>
```

- Header renders once as first static item, scrolls away naturally
- Messages append to static list as they arrive
- LiveSection is the only Ink-managed area

### 4. Update `cli.tsx` — remove fullscreen-ink

**File:** `packages/deep-factor-tui/src/cli.tsx`

Replace lines 107-123:
```tsx
// Before: withFullScreen() + ink.start()
// After:
const { render } = await import("ink");
const instance = render(React.createElement(TuiApp, { ... }));
await instance.waitUntilExit();
```

### 5. Simplify `Header.tsx`

**File:** `packages/deep-factor-tui/src/components/Header.tsx`
- Remove `flexShrink`, `borderStyle`, `borderBottom` props
- Make it a simple one-line banner (renders once via `<Static>`, scrolls away)

### 6. Delete obsolete components

- **Delete** `packages/deep-factor-tui/src/components/Content.tsx` — responsibilities split between `<Static>` and `LiveSection`
- **Delete** `packages/deep-factor-tui/src/components/Footer.tsx` — absorbed into `LiveSection`
- **Delete** `packages/deep-factor-tui/src/components/MessageList.tsx` — `<Static>` iterates messages directly; no more 50-message truncation

### 7. Remove `fullscreen-ink` dependency

**File:** `packages/deep-factor-tui/package.json`
- Remove `"fullscreen-ink"` from dependencies

### 8. Update tests

**File:** `packages/deep-factor-tui/__tests__/*.test.ts`
- Remove `FullScreenBox` / fixed-height wrappers
- Remove "fills full height" test
- Add tests for `LiveSection`
- Note: `lastFrame()` from ink-testing-library only shows the live (non-static) portion

## Files Modified

| File | Action |
|------|--------|
| `packages/deep-factor-tui/src/types.ts` | Add `id` to `ChatMessage` |
| `packages/deep-factor-tui/src/hooks/useAgent.ts` | Generate message IDs |
| `packages/deep-factor-tui/src/components/LiveSection.tsx` | **Create** — active UI section |
| `packages/deep-factor-tui/src/app.tsx` | Rewrite with `<Static>` pattern |
| `packages/deep-factor-tui/src/cli.tsx` | Replace `fullscreen-ink` with `ink.render()` |
| `packages/deep-factor-tui/src/components/Header.tsx` | Simplify (remove borders/flex) |
| `packages/deep-factor-tui/src/components/Content.tsx` | **Delete** |
| `packages/deep-factor-tui/src/components/Footer.tsx` | **Delete** |
| `packages/deep-factor-tui/src/components/MessageList.tsx` | **Delete** |
| `packages/deep-factor-tui/package.json` | Remove `fullscreen-ink` |
| `packages/deep-factor-tui/__tests__/*` | Update for inline rendering |

## Verification

1. `pnpm -C packages/deep-factor-tui build` — compiles without errors
2. `pnpm -r type-check` — no type errors
3. `pnpm -C packages/deep-factor-tui test` — tests pass
4. `deepfactor "Hello"` — content renders inline, terminal scrollback works
5. `deepfactor -p "What is 2+2?"` — print mode still works (unchanged)
6. `cat PROMPT.md | deepfactor -p` — stdin piping still works
