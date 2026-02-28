# Spec: Add `--ui` Flag to CLI Entry Point

## File

`packages/deep-factor-cli/src/cli.tsx`

## Current State

The CLI entry point uses `meow` to parse flags and renders the `<App>` component via Ink's `render()`. Current flags:

- `--model, -m` (string, default: `"gpt-4.1-mini"`)
- `--max-iter, -i` (number, default: `10`)
- `--verbose, -v` (boolean, default: `false`)
- `--bash` (boolean, default: `false`)
- `--interactive` (boolean, default: `false`)

Flow: parse args → load env → validate → `render(<App {...props} />)`

## Required Changes

### 1. Add `ui` flag to meow config

Add to the `flags` object in the `meow()` call:

```typescript
ui: {
  type: "boolean",
  default: false,
}
```

### 2. Update help text

Add `--ui` to the help string displayed by meow:

```
Options
  --model, -m     Model to use (default: gpt-4.1-mini)
  --max-iter, -i  Maximum iterations (default: 10)
  --verbose, -v   Show tool calls
  --bash          Enable bash tool
  --interactive   Interactive mode
  --ui            Launch fullscreen TUI mode       ← NEW
```

### 3. Add TUI launch branch

After env loading and before the existing `render(<App>)` call, add a conditional branch:

```typescript
if (cli.flags.ui) {
  const { withFullScreen } = await import("fullscreen-ink");
  const { TuiApp } = await import("./tui/TuiApp.js");
  await withFullScreen(
    <TuiApp
      model={cli.flags.model}
      maxIter={cli.flags.maxIter}
      enableBash={cli.flags.bash}
    />
  ).start();
} else {
  // existing behavior: single-prompt or interactive mode
}
```

### 4. Behavior Notes

- `--ui` takes precedence: if both `--ui` and `--interactive` are passed, TUI mode wins.
- `--ui` does not require a positional `<prompt>` argument (the TUI provides its own input).
- `--ui` does not accept `--verbose` since the TUI defaults verbose to `true` internally.
- Dynamic imports are used so `fullscreen-ink` and TUI components are only loaded when needed.
- If `--ui` is not set, the existing code path is completely unchanged.

## Props Passed to TuiApp

| Prop         | Source              | Type      |
| ------------ | ------------------- | --------- |
| `model`      | `cli.flags.model`   | `string`  |
| `maxIter`    | `cli.flags.maxIter` | `number`  |
| `enableBash` | `cli.flags.bash`    | `boolean` |

## Acceptance Criteria

- [ ] `deep-factor --help` shows `--ui` in the options list
- [ ] `deep-factor --ui` launches the fullscreen TUI (no error, no inline rendering)
- [ ] `deep-factor "Hello"` still works as single-prompt mode
- [ ] `deep-factor --interactive` still works as interactive mode
- [ ] No new imports at the top of the file (dynamic import only)
- [ ] TypeScript compiles without errors
