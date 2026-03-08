# Spec: Grouped Assistant Turns for the Inline Deep Factor TUI

## Summary

Create a readability-focused redesign of the current inline `deepfactor` transcript so each user prompt and its resulting agent activity render as one coherent conversational unit rather than a flat event log. The design explicitly reduces dependence on bright per-role colors and instead uses structure, spacing, labels, indentation, and a restrained high-contrast palette.

This spec targets the current shipped inline TUI, not the future fullscreen `--ui` work.

## Problem Statement

The current inline TUI is hard to scan because:

- Transcript items are rendered as flat independent rows instead of grouped conversational turns.
- Tool calls, tool results, and assistant messages compete visually with equal weight.
- Role distinction depends too much on color.
- The current blue/green/cyan/magenta-heavy palette is less readable than the Claude reference.
- Long tool-heavy runs look like logs, not a conversation.

## Goals

- Make each prompt-response cycle readable as a single unit.
- Preserve all existing agent information while reducing transcript noise.
- Improve readability in low-color and inconsistent terminal themes.
- Keep the current inline app architecture and CLI entrypoints intact.

## Non-Goals

- No fullscreen `--ui` panel layout.
- No new CLI flags.
- No theme customization system.
- No transcript scrolling/viewport redesign in this phase.
- No collapsible/expandable tool details in this phase.
- No change to session log file format in this phase.

## User Experience Specification

### Turn Model

A transcript turn is:

1. One user message.
2. All subsequent assistant and tool events until the next user message.

Each rendered turn contains:

- A user prompt row.
- A nested assistant activity block.
- Zero or more assistant text segments.
- Zero or more tool activity segments.
- Optional status metadata tied to the turn.

### Rendering Rules

#### User row

- Render the turn with a bold `You` label.
- Keep user text high contrast.
- Insert a blank line after the user row only when the turn contains assistant activity.
- Do not render the full user row in saturated blue.

#### Assistant activity block

- Render all assistant-side activity as a nested block under the user row.
- Use a visible neutral gutter such as `|` plus indentation.
- Preserve event order exactly.
- Make tool activity feel like part of the same response instead of a new top-level entry.

#### Assistant prose segments

- Render assistant text as compact nested rows.
- Use a bold neutral marker instead of a bright role color.
- Keep message bodies in default terminal foreground.

#### Tool call segments

- Render tool calls as compact nested action rows.
- Emphasize the tool name.
- Prefer readable inline summaries over raw JSON.
- For `bash`, show the command directly when possible.

Examples:

- `Bash(date)`
- `Bash(pwd)`
- `Tool request_human_input(question="...")`

#### Tool result segments

- Render tool results directly under the matching tool call.
- Keep result text neutral.
- Render duration and parallel metadata dimly.
- Preview only a short excerpt.
- For multiline output, show the first meaningful lines plus an overflow marker such as `... +2 more lines`.

### Color and Contrast Specification

Use a low-color accessible palette.

Rules:

- Role and hierarchy must still be understandable if color is removed.
- Use color only as a secondary cue.
- Keep body text in terminal default or bright white.
- Use dim text sparingly for metadata.
- Reserve color for a few states only:
  - `red` for errors
  - `yellow` for running state
  - `green` for approved or completed plan state
  - `blue` for input focus
- Do not color full transcript bodies by role.

### Spacing Rules

- Separate turns with one blank line.
- Avoid blank lines between every event within a turn.
- Keep assistant activity compact.
- Keep the status line visually separate from the transcript.

## Data and Rendering Design

### Internal Types

Add display-only transcript types in `packages/deep-factor-tui/src/types.ts`:

- `TranscriptTurn`
- `TranscriptSegment`

`ChatMessage` remains the persisted event-level transcript type.

### Grouping Algorithm

Implement a pure display adapter:

- `groupMessagesIntoTurns(messages: ChatMessage[]): TranscriptTurn[]`

Rules:

1. Start a new turn on each user message.
2. Append subsequent assistant, tool-call, and tool-result messages to the current turn.
3. Pair tool results with the most recent unmatched tool call sharing `toolCallId` when available.
4. If transcript content starts with assistant or tool activity, create a carryover turn.
5. Preserve original message order.
6. Do not mutate input messages.

### Component Changes

- Replace direct `MessageBubble`-per-message rendering in `app.tsx` with grouped turn rendering.
- Add:
  - `TranscriptTurn.tsx`
  - `TranscriptSegment.tsx`
- Add tool-formatting helpers for readable labels and compact result previews.

## Interaction and State

No new keyboard interactions in this phase.

These behaviors must remain unchanged:

- Prompt submission
- Human-input workflow
- Plan review flow
- Status bar updates
- Session resume behavior

## Public APIs / Interfaces / Types

External impact:

- No CLI changes
- No package-level API changes
- No session log format changes

Internal additions:

- Display-only transcript types in `packages/deep-factor-tui/src/types.ts`
- A grouped transcript adapter
- Grouped transcript rendering components

## Acceptance Criteria

- A user prompt followed by tool activity and assistant output renders as one turn block.
- Tool calls and their results appear nested under the same user turn.
- Assistant text is no longer rendered as a separate top-level row when it belongs to an existing turn.
- The transcript remains readable without relying on role-specific colors.
- `bash` tool calls render as readable commands rather than raw JSON.
- Tool results are previewed compactly and do not dominate the transcript.
- Resumed sessions still render correctly.
- Plan review and human-input states still render correctly in the live section.
- Existing agent behavior and CLI commands remain unchanged.

## Test Cases and Scenarios

Add or update tests covering:

1. `user -> tool_call -> tool_result -> assistant` grouping into one turn.
2. Multiple tool calls in one turn while preserving order.
3. Carryover assistant activity before the first user message.
4. `bash` tool-call formatting.
5. Multiline tool-result preview truncation with overflow marker.
6. Readable transcript structure that does not depend on color.
7. Unchanged plan-review live UI behavior.
8. Unchanged error visibility.
9. Unchanged input bar and status line behavior.

## File Plan

Implementation touches:

- `specs/grouped-assistant-turns-inline-tui.md`
- `packages/deep-factor-tui/src/app.tsx`
- `packages/deep-factor-tui/src/types.ts`
- `packages/deep-factor-tui/src/transcript.ts`
- `packages/deep-factor-tui/src/components/TranscriptTurn.tsx`
- `packages/deep-factor-tui/src/components/TranscriptSegment.tsx`
- Supporting component tests

## Assumptions and Defaults

- The target is the current inline TUI.
- Readability takes priority over colorful role styling.
- Session persistence remains event-based, not turn-based.
- This phase includes compact tool previews but not interactive expand/collapse.
- This phase does not redesign scrolling or viewport behavior.
