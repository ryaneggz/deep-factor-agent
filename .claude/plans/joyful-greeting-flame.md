# Plan: Hotkey Menu (Ctrl+/) with Esc Dismiss

## Context

The TUI already has Alt+Enter for newline (keep as-is). The user wants a **hotkey menu** triggered by **Ctrl+/**, dismissed with **Esc**.

## Files to Modify

### 1. `packages/deep-factor-tui/src/hooks/useTextInput.ts`

**a) Add `onHotkeyMenu` callback option:**
- Add optional `onHotkeyMenu?: () => void` to `UseTextInputOptions`
- Ctrl+/ sends `\x1f` (Unit Separator) in most terminals. Detect with: `inputChar === "\x1f"`. Call `onHotkeyMenu()` and return.

**b) Add `onEscape` callback option:**
- Add optional `onEscape?: () => void` to `UseTextInputOptions`
- New branch before backspace: if `key.escape` and `onEscape` → call it and return

### 2. `packages/deep-factor-tui/src/components/InputBar.tsx`

- Add `onHotkeyMenu?: () => void` and `onEscape?: () => void` to `InputBarProps`
- Pass them through to `useTextInput`
- Change hint text from `"Alt+Enter for newline"` to `"Alt+Enter for newline  |  Ctrl+/ for shortcuts"`

### 3. `packages/deep-factor-tui/src/components/HotkeyMenu.tsx` (NEW)

Bordered box listing shortcuts:
- `\ + Enter` — Insert newline
- `Enter` — Submit message
- `Ctrl+/` — Show shortcuts
- `Esc` — Dismiss menu
- `Backspace` — Delete character

Footer: "Press Esc to close"

### 4. `packages/deep-factor-tui/src/components/LiveSection.tsx`

- Add `useState` for `showHotkeyMenu`
- Create `handleHotkeyMenu` / `handleEscape` callbacks
- When `showInput && showHotkeyMenu`: render `<HotkeyMenu />` above `<InputBar>`
- Pass `onHotkeyMenu` always; pass `onEscape` only when menu is showing
- Import `HotkeyMenu`

### 5. `packages/deep-factor-tui/__tests__/components.test.tsx`

- Update existing hint test to match new hint text (now includes "Ctrl+/ for shortcuts")
- Add test: hotkey menu hint contains "Ctrl+/"

## Verification

```bash
pnpm -C packages/deep-factor-tui type-check
pnpm -C packages/deep-factor-tui test
deepfactor   # manual: type \+Enter for newline, ? for menu, Esc to dismiss
```

## Notes

- **Alt+Enter for newline**: Kept as-is (already implemented)
- **Ctrl+/ detection**: Ctrl+/ sends `\x1f` in most terminals. Works regardless of input content — no conflict with normal typing.
- **No new dependencies**
