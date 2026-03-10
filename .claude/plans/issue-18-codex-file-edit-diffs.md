# Plan: Codex Diff-Style File Edit Rendering

## Issue

- GitHub issue: #18
- Branch: `feat/18-codex-file-edit-diffs`
- PR title: `FROM feat/18-codex-file-edit-diffs TO master`

## Context

The repo already has the right abstraction for richer file-edit rendering:

- `packages/deep-factor-agent/src/types.ts` defines `ToolDisplayMetadata`, `ToolFileChangeSummary`, and diff preview fields.
- `packages/deep-factor-agent/src/tool-display.ts` already contains generic file-change and diff extraction helpers.
- `packages/deep-factor-tui/src/transcript.ts` and transcript components can already render `fileChanges` and `diffPreviewLines`.

The missing piece is Codex-specific normalization. The current Codex provider path focuses on assistant text, tool calls, usage, and contract enforcement. It does not explicitly preserve Codex edit presentation so the transcript can look like a reviewable patch instead of generic tool JSON.

OpenAI's Codex docs/help center describe Codex as proposing edits and printing patches inline. Deep Factor should preserve enough of that signal to make Codex runs reviewable inside the existing transcript UI.

## Goal

When a Codex-driven run edits files, the transcript should show a compact diff-style block:

- touched path(s)
- change kind (`created`, `edited`, `deleted`)
- short patch preview when available
- overflow indicators when the patch is larger than the preview budget

## Non-Goals

- No change to the provider contract that currently blocks native command execution.
- No full-screen or side-by-side diff viewer.
- No new transcript event family just for Codex.
- No CLI flag; this should be the default Codex rendering when metadata exists.

## Recommended Approach

### Phase 1: Capture Codex edit signals

Inspect real Codex CLI output for small edit scenarios and add provider fixtures for:

- single-file edit
- file create
- file delete
- multi-file patch
- edit response with no structured diff details

Primary file:

- `packages/deep-factor-agent/src/providers/codex-cli.ts`

Decision:

- Prefer extracting edit metadata directly from Codex JSONL items when the stream exposes it.
- Fall back to parsing the final assistant/tool text only when structured item data is absent.

### Phase 2: Normalize into existing display metadata

Convert the Codex edit signal into `ToolDisplayMetadata` rather than adding Codex-only transcript types.

Primary files:

- `packages/deep-factor-agent/src/tool-display.ts`
- `packages/deep-factor-agent/src/types.ts`
- `packages/deep-factor-agent/src/agent.ts`
- `packages/deep-factor-agent/src/providers/types.ts`

Implementation direction:

- Reuse `fileChanges`, `diffPreviewLines`, and overflow fields where possible.
- Extend provider update payloads only if the current `ModelInvocationUpdate` shape cannot carry edit metadata without ambiguity.
- Keep generic fallback behavior intact when Codex output is incomplete or malformed.

### Phase 3: Render as Codex-style transcript blocks

Use the existing TUI transcript pipeline to make Codex edits look reviewable.

Primary files:

- `packages/deep-factor-tui/src/transcript.ts`
- `packages/deep-factor-tui/src/components/ToolCallBlock.tsx`
- `packages/deep-factor-tui/src/components/TranscriptSegment.tsx`
- `packages/deep-factor-tui/src/components/MessageBubble.tsx`

Implementation direction:

- Prefer concise labels such as `edited path/to/file.ts (+4 -1)`.
- Show a short hunk preview below the file summary.
- For multi-file edits, summarize the first few files and expose overflow counts.
- Preserve the current generic renderer for non-edit cases.

### Phase 4: Lock behavior with tests and docs

Primary files:

- `packages/deep-factor-agent/__tests__/providers/`
- `packages/deep-factor-agent/__tests__/tool-display.test.ts`
- `packages/deep-factor-tui/__tests__/components.test.tsx`
- `packages/deep-factor-tui/__tests__/events-to-messages.test.ts`
- `packages/deep-factor-tui/README.md`

Tests to add or update:

- provider parsing for Codex edit-oriented output
- diff/file-change normalization
- transcript rendering for created, edited, deleted, and overflow cases
- fallback rendering when no structured diff metadata exists

## Open Questions To Resolve During Implementation

1. Does the Codex JSONL stream expose structured patch/file-change items consistently enough to make text parsing a fallback instead of the primary path?
2. Should edit metadata be attached to the tool call event, the tool result event, or both?
3. Do multi-file edits need grouped transcript treatment beyond the current per-segment rendering?
4. Are there Codex-specific path or patch formats that require separate normalization from the generic diff helper?

## Validation

Run after implementation:

```bash
pnpm -r build
pnpm -r test
pnpm -C packages/deep-factor-agent type-check
pnpm -C packages/deep-factor-tui type-check
```

Manual provider/TUI verification:

```bash
pnpm -C packages/deep-factor-tui build
node packages/deep-factor-tui/dist/cli.js --provider codex
```

Suggested manual prompts:

- `Make a one-line comment change in an existing test file, then explain the patch.`
- `Create one small helper file and update one import to use it.`
- `Delete a temporary file and summarize the resulting patch.`

## Manual Human Review

1. Run the built CLI with `--provider codex`.
2. Ask Codex to make a small single-file edit and confirm the transcript shows the file path, change kind, and a short diff preview.
3. Ask Codex to make a multi-file edit and confirm the transcript summarizes multiple files with overflow handling.
4. Verify a malformed or unstructured edit response falls back to generic rendering instead of crashing.
5. Confirm non-edit Codex interactions still render the same way they do today.
