# Plan: Debug Mode for Tool Calling in deep-factor-tui

## Context

Tool calls in the TUI currently truncate args to 120 chars and results to 200 chars, with no way to see toolCallId, iteration, or timestamps. This makes it difficult to debug tool calling behavior. This plan adds a `--debug` CLI flag that enables both verbose UI display (full args/results with metadata) and NDJSON file logging of all agent events.

## Changes

### 1. Extend types — `src/types.ts`

- Add to `ChatMessage`: `toolCallId?: string`, `iteration?: number`, `timestamp?: number`
- Add to `TuiAppProps`: `debug?: boolean`
- Add to `UseAgentOptions`: `debug?: boolean`

### 2. Add `--debug` CLI flag — `src/cli.tsx`

- Add `--debug` / `-d` boolean flag to meow config
- Pass `debug={cli.flags.debug}` to `<TuiApp>`

### 3. Create debug logger — `src/debug-logger.ts` (new file)

- `createDebugLogger()` factory that writes NDJSON to `~/.deep-factor/logs/debug-<timestamp>.ndjson`
- Uses `mkdirSync` + `appendFileSync` (not in render path)
- Tracks high-water mark to avoid duplicate writes across multiple `handleResult` calls
- Exports `DebugLogger` interface with `filePath` and `logEvents(events)` method

### 4. Wire debug into `useAgent` hook — `src/hooks/useAgent.ts`

- Accept `debug` in options, pass to `eventsToChatMessages(events, debug)`
- When `debug=true`, map `toolCallId`, `iteration`, `timestamp` from agent events onto `ChatMessage`
- Lazily instantiate `createDebugLogger()` in a ref when debug is on
- Call `logger.logEvents(result.thread.events)` inside `handleResult`
- Expose `debugLogPath: string | null` in `UseAgentReturn`

### 5. Thread `debug` prop through components

- **`app.tsx`**: Destructure `debug` from props, pass to `useAgent`, `Header`, `Content`
- **`Header.tsx`**: Accept `debug` prop, show red `DEBUG` indicator when active
- **`Content.tsx`**: Accept `debug` prop, pass to `MessageList`
- **`MessageList.tsx`**: Accept `debug` prop, pass to `MessageBubble`
- **`MessageBubble.tsx`**: Accept `debug` prop, pass to `ToolCallBlock`; remove 200-char result truncation when debug=true; show `toolCallId`, `iteration`, `timestamp` on tool_result
- **`ToolCallBlock.tsx`**: Accept `debug` + metadata props; remove 120-char args truncation when debug=true; pretty-print args with `JSON.stringify(args, null, 2)`; show `toolCallId`, `iteration`, `timestamp`

### 6. Tests

- Unit test `eventsToChatMessages` with `debug=true/false` to verify metadata passthrough
- Unit test `createDebugLogger` (mock fs) to verify NDJSON format and incremental writes
- Render tests for `ToolCallBlock` and `MessageBubble` in debug vs non-debug mode

## File Summary

| File | Action |
|------|--------|
| `src/types.ts` | Modify — add debug fields |
| `src/cli.tsx` | Modify — add `--debug` flag |
| `src/debug-logger.ts` | **New** — NDJSON file logger |
| `src/hooks/useAgent.ts` | Modify — debug passthrough + logger |
| `src/app.tsx` | Modify — thread debug prop |
| `src/components/Header.tsx` | Modify — DEBUG indicator |
| `src/components/Content.tsx` | Modify — pass debug |
| `src/components/MessageList.tsx` | Modify — pass debug |
| `src/components/MessageBubble.tsx` | Modify — verbose tool_result |
| `src/components/ToolCallBlock.tsx` | Modify — verbose tool args |

All paths relative to `packages/deep-factor-tui/`.

## Verification

1. `pnpm -C packages/deep-factor-tui build` — confirm clean compile
2. `pnpm -C packages/deep-factor-tui test` — run tests
3. `node packages/deep-factor-tui/dist/cli.js --debug --bash "List files"` — verify:
   - Header shows red `DEBUG` indicator
   - Tool args shown in full (pretty-printed JSON, no truncation)
   - Tool results shown in full (no truncation)
   - `toolCallId`, `iteration`, and `timestamp` visible on tool_call and tool_result lines
   - NDJSON log file created at `~/.deep-factor/logs/debug-*.ndjson`
   - Log contains complete event objects with all fields
4. `node packages/deep-factor-tui/dist/cli.js --bash "List files"` (without --debug) — verify behavior unchanged from current
