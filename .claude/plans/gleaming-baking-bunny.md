# Plan: Update SPEC-01 & SPEC-02 — Default to XML Input Encoding

## Context

The CLI model providers (SPEC-01: Claude CLI, SPEC-02: Codex CLI) currently specify a plain-text `[System]\n...\n[User]\n...` format for serializing `BaseMessage[]` into a CLI prompt string. The codebase already has a proven XML encoding via `serializeThreadToXml()` (`src/xml-serializer.ts`) and the agent supports `contextMode: "xml"`. The CLI providers should default to XML encoding for consistency and richer context (iteration tracking, tool name resolution, structured events).

## Changes

### 1. Add shared utility: `src/providers/messages-to-xml.ts`

Extract duplicated functions from both providers into a shared module. Add new `messagesToXml()`:

- **`messagesToXml(messages: BaseMessage[]): string`** — converts `BaseMessage[]` → `<thread>` XML format
  - Reuses `escapeXml` from `src/xml-serializer.ts` (not duplicated)
  - Builds `toolCallId → toolName` map from `AIMessage.tool_calls` arrays
  - Maps: `SystemMessage` → `<event type="system">`, `HumanMessage` → `<event type="human">`, `AIMessage` → `<event type="ai">` + `<event type="tool_input">` per tool call, `ToolMessage` → `<event type="tool_output">`
  - Detects pre-serialized XML from `buildXmlMessages()` (content starts with `<thread>`) and passes through
- **`messagesToPrompt(messages: BaseMessage[]): string`** — moved here from providers (kept as `"text"` fallback)
- **`parseToolCalls(text: string)`** — moved here from providers
- **`execFileAsync(file, args, options)`** — moved here from providers

### 2. Update SPEC-01 (`SPEC-01-claude-cli-provider.md`)

- Add `inputEncoding?: "xml" | "text"` to `ClaudeCliProviderOptions` (default: `"xml"`)
- Replace inline `messagesToPrompt` / `parseToolCalls` / `execFileAsync` with imports from shared module
- `invoke()` uses `messagesToXml()` by default, `messagesToPrompt()` when `inputEncoding: "text"`
- Add `src/providers/messages-to-xml.ts` to FILE STRUCTURE (new)
- Add `src/xml-serializer.ts` to Relevant Files
- Update tests: assert XML output by default, add test for `inputEncoding: "text"` fallback
- Add acceptance criteria for XML encoding

### 3. Update SPEC-02 (`SPEC-02-codex-cli-provider.md`)

- Same structural changes as SPEC-01 (parallel structure)
- References shared module instead of duplicating functions

### 4. New test file: `__tests__/providers/messages-to-xml.test.ts`

Add to SPEC-01 as the shared utility is introduced there:
- XML serialization of system/human/ai/tool messages
- Tool name resolution via AIMessage.tool_calls map
- XML escaping of special characters
- Pre-serialized XML pass-through detection
- Fallback to `"unknown"` for unresolvable tool names

## Files to Edit

| File | Action |
|------|--------|
| `.ralph/specs/SPEC-01-claude-cli-provider.md` | Update — add shared utility, XML encoding, `inputEncoding` option |
| `.ralph/specs/SPEC-02-codex-cli-provider.md` | Update — parallel changes, reference shared module |

## Key Design Decisions

1. **XML by default** — matches the codebase's `contextMode: "xml"` pattern; richer than plain-text labels
2. **Shared utility extraction** — eliminates ~150 lines of duplication across the two providers
3. **`escapeXml` reuse** — imports from existing `xml-serializer.ts`, not duplicated
4. **Pre-serialized pass-through** — when agent uses `contextMode: "xml"`, the HumanMessage already contains `<thread>...</thread>`; the provider detects this and passes it through instead of double-wrapping
5. **`iteration="0"` for all events** — `BaseMessage[]` doesn't carry iteration metadata; acceptable since iteration tracking is an agent-loop concept
6. **`call_id` attribute** — added to `tool_input`/`tool_output` events to link tool call/result pairs (BaseMessage path needs this; the AgentEvent path uses ordering)

## Verification

After implementation:
1. `pnpm -C packages/deep-factor-agent build` — build succeeds
2. `pnpm -C packages/deep-factor-agent type-check` — no type errors
3. `pnpm -C packages/deep-factor-agent test` — all tests pass including new `messages-to-xml.test.ts`
4. Spot-check: provider's prompt string starts with `<thread>` and contains `<event type="human">` (not `[User]`)
