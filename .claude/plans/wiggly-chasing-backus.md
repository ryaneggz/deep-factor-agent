# Fix TUI Initial Fullscreen Layout + Add Tests

## Context

When starting the TUI (`npx deep-factor-tui`), the content area between the Header and Footer doesn't properly fill the terminal height on initial render (before any query is sent). The layout uses fragile manual height arithmetic (`HEADER_HEIGHT = 2`, `FOOTER_HEIGHT = 3`) instead of Ink's flex-based Yoga layout. Additionally, the `MessageList` and `Content` boxes lack `flexGrow` properties, so when empty they collapse to zero height instead of claiming the remaining space.

The test suite is essentially a placeholder (`it.todo()`). The user wants both unit and e2e tests.

## Part 1: Layout Fix (3 files)

### 1. `packages/deep-factor-tui/src/app.tsx`
- **Remove** `HEADER_HEIGHT` and `FOOTER_HEIGHT` constants (lines 12-13)
- **Remove** `contentHeight` calculation (line 32)
- **Remove** `height={contentHeight}` prop from `<Content>` (line 58)
- Root `<Box flexDirection="column" height={height}>` stays — it constrains total height to terminal
- Header/Footer auto-size to content; Content fills the rest via flex

### 2. `packages/deep-factor-tui/src/components/Content.tsx`
- **Remove** `height: number` from `ContentProps` interface
- **Remove** `height` from destructured props
- **Change** `<Box flexDirection="column" height={height} overflow="hidden">` → `<Box flexDirection="column" flexGrow={1} overflow="hidden">`

### 3. `packages/deep-factor-tui/src/components/MessageList.tsx`
- **Add** `flexGrow={1}` to outer `<Box>`: `<Box flexDirection="column" flexGrow={1} gap={0}>`
- Ensures empty message list still claims space, pushing status text to bottom of content area

## Part 2: Unit Tests (new file)

### 4. Create `packages/deep-factor-tui/__tests__/components.test.tsx`

Unit tests for all leaf components using `ink-testing-library`'s `render()`:

| Component | Tests |
|-----------|-------|
| **Header** | Renders "Deep Factor TUI", model name, status for each AgentStatus value |
| **StatusLine** | Renders token counts (in/out/total), iterations, status text |
| **MessageList** | Empty renders without error; renders user/assistant messages; truncates to `maxVisible` |
| **MessageBubble** | User → "You:" prefix; assistant → "AI:" prefix; tool_result truncation at 200 chars |
| **Content** | Renders messages; shows "Thinking..." when running; shows error; shows human input request with choices |
| **Footer** | Renders StatusLine; shows InputBar when idle/done; hides InputBar when running |

## Part 3: Integration Test (rewrite placeholder)

### 5. Rewrite `packages/deep-factor-tui/__tests__/app.test.tsx`

Mock `fullscreen-ink` (`useScreenSize → { height: 24, width: 80 }`) and `useAgent` hook to control state. Tests:

- Renders header + content + footer in initial idle state
- Output spans meaningful height (>5 lines), confirming flex layout works
- Displays messages when useAgent returns them
- Shows "Thinking..." when status is "running"
- Shows error when status is "error"
- Reset `mockUseAgent` between tests via `beforeEach`

## Part 4: E2E Smoke Test

### 6. Extend `packages/deep-factor-tui/__tests__/cli-e2e.test.ts`

Add a "TUI startup" test that spawns the actual binary, closes stdin, and verifies no JS crash errors in stderr (no `SyntaxError`, `Cannot find module`, etc.).

## Implementation Order

1. Layout fix (Steps 1-3) — core bug fix
2. Component tests (Step 4) — unit coverage
3. Integration test (Step 5) — layout validation
4. E2E test (Step 6) — smoke test
5. Build & validate

## Verification

```bash
pnpm -C packages/deep-factor-tui build
pnpm -C packages/deep-factor-tui test
# Manual: run `npx deep-factor-tui` and confirm fullscreen fills terminal on startup
```
