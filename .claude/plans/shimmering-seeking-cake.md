# Plan: Input History with Up/Down Arrow Keys

## Context
Users want to cycle through previously submitted queries using up/down arrow keys in the TUI input bar, matching the behavior of Claude Code and standard shell history.

## Approach
Add input history tracking to `useTextInput` hook. The hook already manages all input state, so this is the natural place to add history.

### Changes

**File: `packages/deep-factor-tui/src/hooks/useTextInput.ts`**

1. Add `TextInputKey` interface: add `upArrow` and `downArrow` properties
2. Add history state:
   - `historyRef = useRef<string[]>([])` — stores past submissions
   - `historyIndexRef = useRef(-1)` — current position (-1 = not browsing)
   - `draftRef = useRef("")` — saves in-progress input when user starts browsing history
3. On submit (existing `key.return` handler): push the submitted value to `historyRef` and reset `historyIndexRef` to -1
4. On `key.upArrow`:
   - If at index -1 (not browsing), save current input to `draftRef`, set index to `history.length - 1`, load that entry
   - If already browsing and index > 0, decrement index, load that entry
5. On `key.downArrow`:
   - If browsing and index < `history.length - 1`, increment index, load that entry
   - If at last history entry, reset index to -1, restore `draftRef`

No changes needed to `InputBar.tsx` or any other files — the feature is fully encapsulated in the hook.

## Verification
1. `pnpm -C packages/deep-factor-tui build` — typecheck passes
2. `pnpm -C packages/deep-factor-tui test` — existing tests pass
3. Manual test: run `deepfactor`, submit a few queries, press up/down to cycle through them
