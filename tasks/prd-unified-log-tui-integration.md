# PRD: Unified Log <> TUI Integration

## Introduction

The unified log system defines a 20-event-type JSONL format (`UnifiedLogEntry`) with provider-agnostic mappers. Print mode (`print.ts`) already streams this format correctly. However, the interactive TUI still uses the legacy `SessionEntry` format and converts between the two via adapter functions, causing data loss, inconsistency, and preventing session replay from leveraging the full unified log.

This PRD addresses 10 identified gaps (G1-G10) across 4 phased iterations to achieve full parity between print mode and interactive TUI logging, enabling complete session replay from TUI-generated logs.

## Goals

- Achieve full logging parity between print mode and interactive TUI mode
- Enable complete session replay from TUI-generated `.jsonl` files
- Persist all event types (init, result, status, error, thinking, plan, etc.) from the TUI
- Maintain backward compatibility — `loadSession()` reads old format with legacy fallback
- Deprecate and remove legacy `SessionEntry` write path

## Iteration Plan

| Iteration | Phase                   | Gaps           | Focus                                         |
| --------- | ----------------------- | -------------- | --------------------------------------------- |
| 1         | Unified Write Path      | G1, G2, G3, G7 | Replace legacy write path with unified JSONL  |
| 2         | Complete Event Coverage | G4, G5, G6     | Persist iteration numbers, status, and errors |
| 3         | TUI Rendering           | G8, G9         | Extend ChatMessage + new UI components        |
| 4         | Deprecation             | —              | Remove legacy code and conversion functions   |

---

## Iteration 1: Unified Write Path (G1, G2, G3, G7)

### US-001: Create Shared MapperContext in useAgent

**Description:** As the agent system, I need a shared `MapperContext` initialized at session start so that all log entries use a single sequence counter and consistent provider metadata.

**Acceptance Criteria:**

- [ ] `useAgent.ts` creates a `MapperContext` when the agent is first initialized, with fields: `sessionId`, `sequence: 0`, `currentIteration: 0`, `provider`, `model`, `mode`
- [ ] The `MapperContext` is stored as a `useRef` so it persists across renders without causing re-renders
- [ ] The `_sessionSequence` module-level counter in `session-logger.ts` is removed
- [ ] All calls to `appendUnifiedSession()` use `nextSequence(mapperCtx)` from the shared context
- [ ] `pnpm -C packages/deep-factor-tui type-check` passes
- [ ] `pnpm -C packages/deep-factor-tui test` passes

**Implementation Details:**

- Import `MapperContext` and `nextSequence` from `deep-factor-agent/log-mappers/types`
- Initialize in the same block where `sessionId` is created (currently in `useAgent.ts`)
- Provider and model come from `options.provider` and `options.modelLabel`
- Mode comes from `options.sandbox` (maps to `AgentMode`)

---

### US-002: Write `init` Entry at Session Start

**Description:** As a session analyst, I want every TUI session to begin with an `init` entry so I can identify the provider, model, mode, and tools used.

**Acceptance Criteria:**

- [ ] An `init` `UnifiedLogEntry` is written to the session file when the agent is first created in `useAgent.ts`
- [ ] The `init` entry includes: `provider`, `model`, `mode`, `settings` (maxIter, sandbox), `cwd`, and `tools` (list of tool names)
- [ ] The `init` entry matches the format used in `print.ts` (lines 109-117)
- [ ] The entry uses `nextSequence()` from the shared `MapperContext` (US-001)
- [ ] Running `deepfactor` interactively produces a `.jsonl` file whose first line is a valid `init` entry
- [ ] `pnpm -C packages/deep-factor-tui type-check` passes

**Implementation Details:**

- Reference implementation in `print.ts` lines 109-117 using `buildEntry("init", {...})`
- Write after `MapperContext` is initialized but before any agent invocation
- Use `appendUnifiedSession()` from `session-logger.ts`
- Tools list available from `options.tools` (array of `StructuredToolInterface`)

---

### US-003: Replace appendSession with appendUnifiedSession

**Description:** As the logging system, I need the TUI to write unified format directly so that session logs are complete and lossless.

**Acceptance Criteria:**

- [ ] All `appendSession()` calls in `useAgent.ts` (lines 305-318) are replaced with `appendUnifiedSession()` calls
- [ ] Each message type maps correctly to unified format:
  - `assistant` messages → `type: "message"`, `role: "assistant"`
  - `tool_call` messages → `type: "tool_call"` with `toolCallId`, `toolName`, `args`
  - `tool_result` messages → `type: "tool_result"` with `toolCallId`, `result`
  - `user` messages → `type: "message"`, `role: "user"` (currently skipped — keep skipping if logged at submit time)
- [ ] Each entry includes `sessionId`, `timestamp` (ms), `sequence` (from shared MapperContext), `iteration` (from current state)
- [ ] The `appendSession()` function in `session-logger.ts` is no longer called from any TUI code
- [ ] `pnpm -C packages/deep-factor-tui type-check` passes
- [ ] `pnpm -C packages/deep-factor-tui test` passes

**Implementation Details:**

- Use `mapAgentEvent()` if agent events are available, otherwise construct `UnifiedLogEntry` objects directly
- The `handleResult` function (lines 295-345) iterates `messagesToLog` — convert each to unified format
- Preserve `toolDisplay`, `parallelGroup`, `durationMs` metadata in unified entries where supported
- The `ToolCallLog` type supports `display` and `parallelGroup` fields; `ToolResultLog` supports `durationMs`, `display`, `parallelGroup`

---

### US-004: Write `result` Entry at Session End

**Description:** As a session analyst, I want every completed TUI session to end with a `result` entry so I can determine the outcome, total cost, and final answer from the log alone.

**Acceptance Criteria:**

- [ ] A `result` `UnifiedLogEntry` is appended in `handleResult()` after logging individual messages
- [ ] The `result` entry includes: `content` (final text), `stopReason`, `usage` (token counts), `iterations`, `durationMs`, `costUsd` (if available)
- [ ] The `result` entry matches the format used in `print.ts` (lines 168-175)
- [ ] The entry is written for all result types: `AgentResult`, `PendingResult`, `PlanResult`
- [ ] Running `deepfactor -p "hello"` produces a `.jsonl` file whose last meaningful entry is a valid `result`
- [ ] `pnpm -C packages/deep-factor-tui type-check` passes

**Implementation Details:**

- In `handleResult()`, after the message logging loop, construct and append a `result` entry
- `content`: extract from `result.messages` (last assistant message content)
- `stopReason`: from `result.stopReason` (or synthesize: `"plan"` for PlanResult, `"pending_input"` for PendingResult, `"max_errors"` for error case)
- `usage`: from `result.usage` or accumulated `tokenUsage` state
- `iterations`: from `result.iterations` or `iterations` state
- `durationMs`: compute from session start time (track with `Date.now()` at send)

---

## Iteration 2: Complete Event Coverage (G4, G5, G6)

### US-005: Pass Iteration Numbers to Unified Entries

**Description:** As a session analyst, I want each tool_call and tool_result entry to include the correct iteration number so I can group actions by agent loop iteration.

**Acceptance Criteria:**

- [ ] The shared `MapperContext.currentIteration` is updated from `AgentExecutionUpdate.iterations` in the `handleUpdate` callback (line 265)
- [ ] All `tool_call` and `tool_result` unified entries include the current `iteration` value (not hardcoded `0`)
- [ ] All `message` entries for assistant responses include the current `iteration`
- [ ] The `sessionEntryToUnified()` function no longer hardcodes `iteration: 0` (lines 253, 271)
- [ ] `pnpm -C packages/deep-factor-tui type-check` passes
- [ ] `pnpm -C packages/deep-factor-tui test` passes

**Implementation Details:**

- `handleUpdate` already receives `update.iterations` and stores it in state (line 265)
- Update `mapperCtxRef.current.currentIteration = update.iterations` in the same callback
- All subsequent entries constructed via the shared context will inherit the correct iteration

---

### US-006: Persist Status Events

**Description:** As a session analyst, I want agent status transitions logged so that session replay can reconstruct timing and detect when the agent was blocked on human input.

**Acceptance Criteria:**

- [ ] A `status` `UnifiedLogEntry` is written when `agentStatus` changes to `running`, `pending_input`, `done`, or `error`
- [ ] The `status` entry includes: `status`, `usage` (current token counts), `iterations` (current count), `costUsd` (if available)
- [ ] The format matches `print.ts` (lines 97-103)
- [ ] Status entries appear in the `.jsonl` output at the correct chronological position
- [ ] `pnpm -C packages/deep-factor-tui type-check` passes

**Implementation Details:**

- Write status entries at each transition point in `useAgent.ts`:
  - `"running"` at line 359 (sendPrompt start)
  - `"done"` at line 324 (handleResult success)
  - `"pending_input"` at line 332 (handleResult pending)
  - `"error"` at line 341 (handleResult max_errors) and line 348 (catch block)
- Use `appendUnifiedSession()` with `buildEntry("status", { status, usage, iterations })`
- `usage` available from `tokenUsage` state; `iterations` from `iterations` state

---

### US-007: Persist Error Events

**Description:** As a developer debugging issues, I want agent errors logged to the session file so that session recovery can reconstruct error context without manual reproduction.

**Acceptance Criteria:**

- [ ] An `error` `UnifiedLogEntry` is appended in the catch block of agent execution (line 348)
- [ ] The `error` entry includes: `error` (message string), `recoverable` (boolean), `iteration` (current)
- [ ] The format matches `print.ts` (lines 184-191)
- [ ] For `max_errors` stop condition, an `error` entry is written with `recoverable: false`
- [ ] Error entries include stack trace in the `error` field when available
- [ ] `pnpm -C packages/deep-factor-tui type-check` passes

**Implementation Details:**

- In the catch block (line 348), before `setError()` and `setStatus("error")`:
  ```typescript
  appendUnifiedSession({
    type: "error",
    sessionId,
    timestamp: Date.now(),
    sequence: nextSequence(mapperCtxRef.current),
    error: err instanceof Error ? err.stack || err.message : String(err),
    recoverable: false,
  });
  ```
- For max_errors in handleResult (line 337-341), write a separate error entry

---

## Iteration 3: TUI Rendering (G8, G9)

### US-008: Extend ChatMessage for Unified Event Types

**Description:** As the TUI rendering system, I need `ChatMessage` to support all unified log event types so the UI can render thinking blocks, plans, summaries, and rate limit warnings.

**Acceptance Criteria:**

- [ ] `ChatMessage.role` is extended to include: `"thinking"`, `"plan"`, `"summary"`, `"status"`, `"error"`, `"rate_limit"`, `"file_change"`, `"approval"`, `"human_input"`, `"completion"`
- [ ] New optional fields added to `ChatMessage`: `thinking?: string`, `planContent?: string`, `statusInfo?: { status: string; usage?: object; iterations?: number }`, `rateLimitInfo?: { retryAfterMs?: number; message?: string }`
- [ ] `eventsToChatMessages()` (or equivalent converter) handles all 16 unified log types (excluding `init` and `result` which are session-level, not message-level)
- [ ] Existing `"user"`, `"assistant"`, `"tool_call"`, `"tool_result"` roles continue to work unchanged
- [ ] `pnpm -C packages/deep-factor-tui type-check` passes
- [ ] `pnpm -C packages/deep-factor-tui test` passes

**Implementation Details:**

- File: `packages/deep-factor-tui/src/types.ts` (lines 38-48)
- Consider using a discriminated union or keeping the flat interface with optional fields
- The converter should map `UnifiedLogEntry.type` to `ChatMessage.role` 1:1
- For backward compat, existing code that checks `role === "assistant"` etc. must continue to work

---

### US-009: Add ThinkingBlock Component

**Description:** As a user, I want to see the model's extended thinking in a visually distinct collapsible block so I can understand the reasoning process.

**Acceptance Criteria:**

- [ ] New component `ThinkingBlock.tsx` in `packages/deep-factor-tui/src/components/`
- [ ] Renders thinking content in a dimmed/italic style, visually distinct from assistant messages
- [ ] Collapsible by default (shows "[Thinking...]" summary) with toggle to expand
- [ ] `MessageBubble.tsx` or `TranscriptTurn.tsx` delegates to `ThinkingBlock` when `role === "thinking"`
- [ ] `pnpm -C packages/deep-factor-tui type-check` passes

**Implementation Details:**

- Use Ink's `<Box>` with `borderStyle="single"` and `dimColor` for visual distinction
- Thinking content can be long — truncate to first 3 lines with "[+N more lines]" indicator
- Follow existing component patterns (see `ToolCallBlock.tsx` for reference)

---

### US-010: Add PlanBlock, SummaryBlock, and StatusIndicator Components

**Description:** As a user, I want plan output, context summaries, and rate limit warnings rendered as distinct UI elements so I can distinguish them from regular assistant messages.

**Acceptance Criteria:**

- [ ] New component `PlanBlock.tsx`: renders plan content with a header label, indented bullet style
- [ ] New component `SummaryBlock.tsx`: renders context summarization with "[Context summarized: iterations X-Y]" header
- [ ] New component `StatusIndicator.tsx`: renders rate_limit warnings with retry countdown, error entries with red styling
- [ ] `TranscriptTurn.tsx` or `TranscriptSegment.tsx` routes to the correct component based on `ChatMessage.role`
- [ ] All new components follow existing patterns (Box/Text from Ink, consistent color scheme)
- [ ] `pnpm -C packages/deep-factor-tui type-check` passes

**Implementation Details:**

- `PlanBlock`: Use `<Box flexDirection="column">` with numbered steps, cyan color for header
- `SummaryBlock`: Dim text with border, show which iterations were summarized
- `StatusIndicator`: Red for errors, yellow for rate limits with `retryAfterMs` countdown
- Add routing logic in the transcript rendering pipeline to map role to component

---

### US-011: Add Thinking Block Extraction to LangChain Mapper

**Description:** As the logging system, I need the LangChain mapper to extract thinking blocks from model responses when the provider supports extended thinking.

**Acceptance Criteria:**

- [ ] `langchain-mapper.ts` checks for thinking blocks in `AIMessage` content (content blocks with `type: "thinking"`)
- [ ] When found, emits separate `thinking` `UnifiedLogEntry` entries before the `message` entry
- [ ] Follows the same pattern as `claude-mapper.ts` (lines ~60-70) for thinking block extraction
- [ ] When no thinking blocks are present, behavior is unchanged
- [ ] `pnpm -C packages/deep-factor-agent type-check` passes
- [ ] `pnpm -C packages/deep-factor-agent test` passes

**Implementation Details:**

- LangChain `AIMessage.content` can be a string or array of content blocks
- When it's an array, filter for blocks with `type: "thinking"` and extract `thinking` text
- Emit one `thinking` entry per thinking block, then the `message` entry with remaining content
- File: `packages/deep-factor-agent/src/log-mappers/langchain-mapper.ts`

---

## Iteration 4: Deprecation

### US-012: Deprecate and Remove Legacy SessionEntry Write Path

**Description:** As a maintainer, I want to remove the legacy `SessionEntry` write path so there is a single, canonical logging format.

**Acceptance Criteria:**

- [ ] `appendSession()` function in `session-logger.ts` is removed entirely
- [ ] `SessionEntry` type is removed from `session-logger.ts` (or marked `@deprecated` with `@internal`)
- [ ] `sessionEntryToUnified()` conversion function is removed
- [ ] `_sessionSequence` module-level counter is removed
- [ ] No remaining imports or references to `appendSession` in the codebase
- [ ] `pnpm -r type-check` passes
- [ ] `pnpm -r test` passes

**Implementation Details:**

- Search for all imports of `appendSession` and verify they were already migrated in Iteration 1
- Remove the function, its type signature, and the conversion helper
- Keep `appendUnifiedSession()` as the sole write API

---

### US-013: Update loadSession with Legacy Fallback

**Description:** As the session system, I need `loadSession()` to read unified format natively while maintaining a fallback for old-format sessions.

**Acceptance Criteria:**

- [ ] `loadSession()` reads `.jsonl` files and parses each line as `UnifiedLogEntry`
- [ ] If a line fails to parse as unified format, falls back to legacy `SessionEntry` parsing and converts via a lightweight inline converter
- [ ] Old sessions (pre-migration) can still be loaded and displayed in the TUI
- [ ] New sessions are read without any conversion overhead
- [ ] `pnpm -C packages/deep-factor-tui type-check` passes
- [ ] `pnpm -C packages/deep-factor-tui test` passes

**Implementation Details:**

- Detection strategy: check for `type` field (unified) vs `role` field (legacy) on each parsed line
- Legacy lines get converted inline using the same mapping logic previously in `sessionEntryToUnified()` (keep as a private helper if needed)
- Do NOT remove the ability to read old sessions — users may have existing session history

---

### US-014: Clean Up Unused Conversion Functions

**Description:** As a maintainer, I want to remove all dead code related to the legacy format so the codebase is clean and unambiguous.

**Acceptance Criteria:**

- [ ] Remove `eventsToChatMessages()` if it only handled legacy format (or update it to handle unified-only)
- [ ] Remove any `SessionEntry`-to-`ChatMessage` conversion helpers that are no longer referenced
- [ ] Remove any test fixtures or mocks that only test legacy format writing
- [ ] Update tests to verify unified format output
- [ ] `pnpm -r type-check` passes
- [ ] `pnpm -r test` passes
- [ ] No TypeScript or ESLint warnings about unused exports

**Implementation Details:**

- Run `pnpm -r type-check` and check for unused variable/import warnings
- Grep for `SessionEntry` across the codebase and remove all non-test references
- Keep any test that validates legacy fallback reading (US-013)

---

## Functional Requirements

- FR-1: The TUI must write all session log entries in `UnifiedLogEntry` JSONL format
- FR-2: Every TUI session must begin with an `init` entry containing provider, model, mode, settings, cwd, and tools
- FR-3: Every completed TUI session must end with a `result` entry containing content, stopReason, usage, iterations, durationMs
- FR-4: A single `MapperContext` per session must manage sequence numbering and provider metadata
- FR-5: All `tool_call` and `tool_result` entries must include the correct `iteration` number
- FR-6: Agent status transitions (`running`, `pending_input`, `done`, `error`) must be persisted as `status` entries
- FR-7: Agent errors must be persisted as `error` entries with message, stack trace, and recoverability flag
- FR-8: `ChatMessage` type must support all 16 message-level unified log event types
- FR-9: TUI must render `thinking`, `plan`, `summary`, `status`, `error`, and `rate_limit` as distinct visual components
- FR-10: LangChain mapper must extract and emit `thinking` entries when available
- FR-11: `loadSession()` must read unified format natively with legacy fallback for old sessions
- FR-12: Legacy `appendSession()`, `SessionEntry`, and `sessionEntryToUnified()` must be removed after migration

## Non-Goals

- No migration script for existing sessions (legacy fallback handles reading)
- No changes to the print mode (`print.ts`) — it already works correctly
- No changes to the agent core (`deep-factor-agent/src/agent.ts`) — only TUI and mappers
- No new CLI flags or user-facing configuration for logging
- No real-time log streaming or websocket-based log tailing
- No database storage — continues using `.jsonl` flat files

## Technical Considerations

- **ESM only**: All packages use `"type": "module"` — imports must use `.js` extensions
- **LangChain types**: `BaseChatModel`, `AIMessage`, `ToolMessage` from `@langchain/core`
- **Ink rendering**: Components use React + Ink (`<Box>`, `<Text>`) — no DOM APIs
- **Sequence monotonicity**: `nextSequence()` must be called in chronological order; no concurrent writes to the same `MapperContext`
- **Session file location**: `~/.deepfactor/sessions/{sessionId}.jsonl`
- **Type exports**: New types must be re-exported from `packages/deep-factor-agent/src/index.ts` if consumed by TUI

## Success Metrics

- TUI-generated `.jsonl` files pass `replayLog()` and `logToThread()` without conversion
- Every TUI session has exactly one `init` entry (first) and one `result` entry (last meaningful)
- Iteration numbers in tool_call/tool_result entries match the agent loop iteration count
- Status and error events appear in session logs at correct chronological positions
- Old sessions (pre-migration) still load and display correctly in the TUI
- `pnpm -r test` and `pnpm -r type-check` pass at each iteration boundary

## Open Questions

- Should `thinking` blocks be persisted even when the model returns empty thinking content?
- Should `file_change` entries be synthesized from tool_result output, or only emitted when the agent explicitly reports file changes?
- What is the cost estimation formula for `costUsd` in the `result` entry? (per-provider pricing needed)
