# Plan: Migrate CLI Providers to SDK Providers

## Context

The project currently has two CLI-based model providers (`claude-cli.ts`, `codex-cli.ts`) that shell out to external CLI binaries (`claude`, `codex`). These have significant limitations:
- **No native tool calling** — tool definitions are injected via prompt engineering, tool calls parsed from JSON code blocks in text
- **No token usage** — `usage_metadata` returns zeros since CLIs don't expose usage data
- **Process overhead** — spawns a child process per invocation
- **CLI dependency** — requires the CLI binaries to be installed

This plan creates two SDK-based providers using `@anthropic-ai/sdk` and `openai` packages directly, implementing the same `ModelAdapter` interface with native tool calling and token usage reporting.

## Files to Create

### 1. `packages/deep-factor-agent/src/providers/schema-utils.ts`
Extract shared `extractJsonSchema()` helper (currently duplicated in both CLI providers).

```typescript
// Converts StructuredToolInterface.schema (Zod or raw JSON Schema) to plain JSON Schema object
export function extractJsonSchema(t: StructuredToolInterface): Record<string, unknown>
```

### 2. `packages/deep-factor-agent/src/providers/claude-sdk.ts`
Anthropic SDK provider implementing `ModelAdapter`.

**Options interface:**
```typescript
export interface ClaudeSdkProviderOptions {
  model: string;           // e.g. "claude-sonnet-4-20250514"
  apiKey?: string;         // default: process.env.ANTHROPIC_API_KEY
  maxTokens?: number;      // default: 4096
  baseURL?: string;        // for proxies
}
```

**Key implementation details:**
- Uses `Anthropic.messages.create()` with native `tools` parameter
- **Message conversion:** SystemMessage → `system` param (separate from messages array); HumanMessage → `role: "user"`; AIMessage → `role: "assistant"` with `tool_use` content blocks; ToolMessage → `role: "user"` with `tool_result` content blocks
- **Critical:** Must merge consecutive same-role messages (Anthropic requires strict `user`/`assistant` alternation). ToolMessage + HumanMessage both map to `role: "user"`, so consecutive ones must be merged into a single message with content array
- **Tool schema conversion:** `StructuredToolInterface[]` → `Anthropic.Tool[]` using `extractJsonSchema()`
- **Response parsing:** `response.content` blocks — `text` blocks become content, `tool_use` blocks become `AIMessage.tool_calls`
- **Token usage:** `response.usage.{input_tokens, output_tokens}` → `AIMessage.usage_metadata`

### 3. `packages/deep-factor-agent/src/providers/openai-sdk.ts`
OpenAI SDK provider implementing `ModelAdapter`.

**Options interface:**
```typescript
export interface OpenAiSdkProviderOptions {
  model: string;           // e.g. "gpt-4.1-mini", "gpt-4o"
  apiKey?: string;         // default: process.env.OPENAI_API_KEY
  maxTokens?: number;      // default: 4096
  baseURL?: string;        // for proxies/Azure
  temperature?: number;
}
```

**Key implementation details:**
- Uses `openai.chat.completions.create()` with native `tools` parameter (function calling)
- **Message conversion:** Direct role mapping (`system`, `user`, `assistant`, `tool` — no merging needed since OpenAI supports `tool` role natively)
- **Tool schema conversion:** `StructuredToolInterface[]` → `{ type: "function", function: { name, description, parameters } }[]`
- **Response parsing:** `response.choices[0].message.tool_calls[].function.{name, arguments}` → parse `arguments` JSON string → `AIMessage.tool_calls`
- **Token usage:** `response.usage.{prompt_tokens, completion_tokens, total_tokens}` → `AIMessage.usage_metadata`

### 4. `packages/deep-factor-agent/__tests__/providers/claude-sdk.test.ts`
Unit tests mocking `@anthropic-ai/sdk`. Follow pattern from `__tests__/providers/claude-cli.test.ts`:
- Mock SDK client, simulate responses
- Test: returns ModelAdapter, passes isModelAdapter check
- Test: message conversion (system extracted, human/ai/tool mapped correctly)
- Test: consecutive same-role merging for Anthropic
- Test: tool schema conversion (Zod → JSON Schema)
- Test: tool call parsing from `tool_use` content blocks
- Test: **token usage extraction** (the key improvement — non-zero `usage_metadata`)
- Test: error handling (SDK errors rethrown)
- Test: options passthrough (model, apiKey, maxTokens)

### 5. `packages/deep-factor-agent/__tests__/providers/openai-sdk.test.ts`
Same pattern as Claude SDK tests, mocking `openai` package. Additional test for:
- JSON parsing of `function.arguments` string
- Handling malformed arguments JSON gracefully

### 6. `packages/deep-factor-agent/examples/15-sdk-providers.ts`
Demo script similar to example 14, accepting `--provider claude-sdk|openai-sdk` flag. Uses same calculator/time tools. Demonstrates non-zero token usage.

## Files to Modify

### 7. `packages/deep-factor-agent/package.json`
Add production dependencies:
```json
"@anthropic-ai/sdk": "^0.39.0",
"openai": "^4.77.0"
```

### 8. `packages/deep-factor-agent/src/index.ts`
Add exports after existing provider exports (line 87):
```typescript
export { createClaudeSdkProvider } from "./providers/claude-sdk.js";
export type { ClaudeSdkProviderOptions } from "./providers/claude-sdk.js";
export { createOpenAiSdkProvider } from "./providers/openai-sdk.js";
export type { OpenAiSdkProviderOptions } from "./providers/openai-sdk.js";
```

## Implementation Order

1. Create `schema-utils.ts` (shared helper)
2. Create `claude-sdk.ts` (Anthropic SDK provider)
3. Create `openai-sdk.ts` (OpenAI SDK provider)
4. Update `package.json` (add deps) + `pnpm install`
5. Update `index.ts` (exports)
6. Create tests for both SDK providers
7. Create example 15
8. Build + test + type-check

## Key Reusable Code

- `ModelAdapter` interface: `src/providers/types.ts`
- `isModelAdapter()` type guard: `src/providers/types.ts`
- `extractJsonSchema()` pattern: `src/providers/claude-cli.ts:72-81` (will be extracted to `schema-utils.ts`)
- `toJSONSchema` from `zod` (already used by CLI providers)
- Test mock pattern: `__tests__/providers/claude-cli.test.ts`

## What NOT to Change

- `ModelAdapter` interface — stays the same
- `agent.ts` — no changes needed, SDK providers work through existing `invoke()`/`bindTools()` contract
- CLI providers — kept for backward compatibility (not deprecated yet)
- `isModelAdapter()` — SDK providers correctly pass this check (have `invoke`, no `_generate`)

## Verification

1. `pnpm -C packages/deep-factor-agent build` — compiles without errors
2. `pnpm -C packages/deep-factor-agent type-check` — no type errors
3. `pnpm -C packages/deep-factor-agent test` — all tests pass (existing + new)
4. `npx tsx packages/deep-factor-agent/examples/15-sdk-providers.ts --provider claude-sdk` — runs with real API key, shows non-zero token usage
5. `npx tsx packages/deep-factor-agent/examples/15-sdk-providers.ts --provider openai-sdk` — same for OpenAI
