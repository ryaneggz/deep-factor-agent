# Plan: Scaffold `deep-factor-tui` Package

## Context

The existing monorepo has `packages/deep-factor-agent/` (core agent library) and `packages/deep-factor-cli/` (Ink-based streaming CLI). The goal is to create a new `packages/deep-factor-tui/` package providing a **fullscreen terminal UI** using `fullscreen-ink` (alternate screen buffer), modeled after [`ruska --ui`](https://github.com/ruska-ai/ruska-cli). The TUI is triggered via `deep-factor --tui` on the existing CLI binary, and also available as a standalone `deep-factor-tui` binary.

## Design Decisions

1. **Separate package** (`packages/deep-factor-tui/`) — the TUI has different dependencies (`fullscreen-ink`) and a different rendering paradigm (fixed layout with header/content/footer vs. streaming output). Clean separation.
2. **`--tui` flag on existing CLI** — add a `--tui` flag to `packages/deep-factor-cli/src/cli.tsx` that dynamically imports and delegates to the TUI package. The TUI package also exposes its own `deep-factor-tui` binary.
3. **Copy `useAgent` + `useTextInput` hooks** — same pattern as existing CLI. Extraction to a shared package is a follow-up, not part of this scaffold.
4. **Use `fullscreen-ink`** for alternate screen buffer management (`withFullScreen`, `FullScreenBox`, `useScreenSize`).
5. **pnpm overrides** to deduplicate `ink`/`react` from `fullscreen-ink` (it ships them as `dependencies`, not `peerDependencies`).

## File Tree

```
packages/deep-factor-tui/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── scripts/
│   └── postbuild.js              # shebang injection (same as CLI)
├── src/
│   ├── cli.tsx                    # Entry: meow + withFullScreen
│   ├── app.tsx                    # Root layout: Header / Content / Footer
│   ├── types.ts                   # TuiAppProps, ChatMessage, AgentStatus
│   ├── index.ts                   # Public exports (used by CLI --tui flag)
│   ├── hooks/
│   │   ├── useAgent.ts            # Copied from CLI (agent state bridge)
│   │   └── useTextInput.ts        # Copied from CLI (text input handling)
│   ├── components/
│   │   ├── Header.tsx             # Fixed: title, model, status indicator
│   │   ├── Content.tsx            # FlexGrow=1: message list + spinner + errors
│   │   ├── Footer.tsx             # Fixed: status line + input bar
│   │   ├── MessageList.tsx        # Renders visible slice of messages
│   │   ├── MessageBubble.tsx      # Single message (user/assistant/tool_call/tool_result)
│   │   ├── ToolCallBlock.tsx      # Tool name + truncated args
│   │   ├── InputBar.tsx           # Text input with cursor
│   │   └── StatusLine.tsx         # Token usage + iterations
│   └── tools/
│       └── bash.ts                # Copied from CLI (optional --bash tool)
└── __tests__/                     # Placeholder test structure
    └── app.test.tsx
```

## Implementation Steps

### Step 1: Package scaffold
Create `packages/deep-factor-tui/package.json`, `tsconfig.json`, `vitest.config.ts`, `scripts/postbuild.js`.

- **package.json**: mirrors CLI pattern. Key deps: `deep-factor-agent` (workspace:\*), `fullscreen-ink` ^0.1.0, `ink` ^6.8.0, `react` ^19, `meow` ^13, `dotenv`, `zod`. Bin: `deep-factor-tui` -> `./dist/cli.js`.
- **tsconfig.json**: identical to CLI (ES2022, ESNext, react-jsx, strict, declaration).
- **vitest.config.ts**: same as CLI (`passWithNoTests: true` for initial scaffold).
- **postbuild.js**: copied from CLI (shebang + chmod).

### Step 2: Root config updates
- **`package.json`** (root): add pnpm overrides to deduplicate `fullscreen-ink`'s bundled `ink`/`react`:
  ```json
  "pnpm": {
    "overrides": {
      "fullscreen-ink>ink": "$ink",
      "fullscreen-ink>react": "$react"
    }
  }
  ```
- **`eslint.config.js`**: add TUI package section (same as CLI section but for `packages/deep-factor-tui/`).

### Step 3: Types + hooks + tools (copy from CLI)
- `src/types.ts` — same types as CLI, with `TuiAppProps` replacing `AppProps` (no `verbose`/`interactive` flags; TUI is always interactive and always shows tool calls).
- `src/hooks/useAgent.ts` — verbatim copy from `packages/deep-factor-cli/src/hooks/useAgent.ts`.
- `src/hooks/useTextInput.ts` — verbatim copy from `packages/deep-factor-cli/src/hooks/useTextInput.ts`.
- `src/tools/bash.ts` — verbatim copy from `packages/deep-factor-cli/src/tools/bash.ts`.

### Step 4: Leaf components
Create components with no internal dependencies:
- `StatusLine.tsx` — token counts + iterations + status (dimColor text).
- `ToolCallBlock.tsx` — tool name (bold yellow) + truncated JSON args.
- `MessageBubble.tsx` — renders one ChatMessage by role (user=blue, assistant=green, tool_call->ToolCallBlock, tool_result=cyan truncated).
- `InputBar.tsx` — blue `> ` prompt + text input + `_` cursor, uses `useTextInput` hook.

### Step 5: Composite components
- `MessageList.tsx` — renders visible slice of messages (simple tail-slice for scaffold; scrolling is a follow-up).
- `Content.tsx` — wraps MessageList + "Thinking..." spinner + human input display + error display. Takes `height` prop, uses `overflow="hidden"`.
- `Header.tsx` — fixed-height box with bottom border, shows "Deep Factor TUI" title + model name + status indicator with color coding.
- `Footer.tsx` — fixed-height box with top border, shows StatusLine + InputBar (InputBar only when status is idle/done).

### Step 6: App shell (`src/app.tsx`)
- Uses `useScreenSize()` from `fullscreen-ink` for terminal dimensions.
- Calculates `contentHeight = height - HEADER_HEIGHT - FOOTER_HEIGHT`.
- Renders `<Header>` / `<Content>` / `<Footer>` in a column flex layout.
- Sends initial prompt on mount if provided via CLI args.

### Step 7: Entry point (`src/cli.tsx`)
- Loads env files (same pattern as CLI).
- Parses flags with meow: `--model`, `--max-iter`, `--bash` (no `--verbose`/`--interactive`).
- Renders `<TuiApp>` wrapped in `withFullScreen()`.
- Calls `ink.start()` + `ink.waitUntilExit()`.

### Step 8: Public exports (`src/index.ts`)
- Export `TuiApp` component and `TuiAppProps` type so the existing CLI can dynamically import and render it.

### Step 9: Wire `--tui` flag into existing CLI
Modify `packages/deep-factor-cli/src/cli.tsx`:
- Add `tui: { type: "boolean", default: false }` flag to meow config.
- When `--tui` is set, dynamically import `deep-factor-tui` and launch with `withFullScreen`.
- Add `deep-factor-tui` as a dependency in CLI's `package.json`.

### Step 10: Makefile + CLAUDE.md updates
- Add `install-tui`, `build-tui`, `dev-tui`, `test-tui`, `type-check-tui` targets to Makefile.
- Add TUI section to CLAUDE.md with build/run/test commands and codebase patterns.

### Step 11: Install + build + verify
- `pnpm install` from root.
- `pnpm -C packages/deep-factor-tui build` — verify compilation.
- `pnpm -C packages/deep-factor-tui type-check` — verify types.
- `node packages/deep-factor-tui/dist/cli.js` — verify fullscreen launches and exits cleanly with Ctrl+C.

## Key Files to Modify (Existing)

| File | Change |
|------|--------|
| `/home/ryaneggz/sandbox/2026/feb/deep-factor-agent/package.json` | Add pnpm overrides for fullscreen-ink dedup |
| `/home/ryaneggz/sandbox/2026/feb/deep-factor-agent/eslint.config.js` | Add TUI package lint section |
| `/home/ryaneggz/sandbox/2026/feb/deep-factor-agent/Makefile` | Add TUI targets |
| `/home/ryaneggz/sandbox/2026/feb/deep-factor-agent/CLAUDE.md` | Add TUI docs section |
| `/home/ryaneggz/sandbox/2026/feb/deep-factor-agent/packages/deep-factor-cli/src/cli.tsx` | Add `--tui` flag with dynamic import |
| `/home/ryaneggz/sandbox/2026/feb/deep-factor-agent/packages/deep-factor-cli/package.json` | Add `deep-factor-tui` dep |

## Key Files to Reuse (Copy)

| Source | Destination |
|--------|-------------|
| `packages/deep-factor-cli/src/hooks/useAgent.ts` | `packages/deep-factor-tui/src/hooks/useAgent.ts` |
| `packages/deep-factor-cli/src/hooks/useTextInput.ts` | `packages/deep-factor-tui/src/hooks/useTextInput.ts` |
| `packages/deep-factor-cli/src/tools/bash.ts` | `packages/deep-factor-tui/src/tools/bash.ts` |
| `packages/deep-factor-cli/scripts/postbuild.js` | `packages/deep-factor-tui/scripts/postbuild.js` |
| `packages/deep-factor-cli/tsconfig.json` | `packages/deep-factor-tui/tsconfig.json` |

## Verification

1. `pnpm install` — workspace resolves all deps including `fullscreen-ink`.
2. `pnpm -C packages/deep-factor-tui type-check` — no type errors.
3. `pnpm -C packages/deep-factor-tui build` — compiles to `dist/`, shebang added.
4. `node packages/deep-factor-tui/dist/cli.js` — fullscreen TUI launches, shows header/footer, accepts input, exits with Ctrl+C.
5. `node packages/deep-factor-cli/dist/cli.js --tui` — same fullscreen TUI via existing CLI binary.
6. `pnpm -r type-check` — all packages pass.
7. `pnpm -r test` — all packages pass (TUI has `passWithNoTests`).
