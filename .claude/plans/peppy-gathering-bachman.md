# SDK Provider Migration Plan

## Context

The current provider system shells out to CLI processes (`claude --print`, `codex exec`) and prompt-engineers tool calls as JSON code blocks. This loses native tool calling, streaming fidelity, extended thinking, cache control, and proper usage metadata. Migrating to the Anthropic SDK (`@anthropic-ai/sdk`) and OpenAI SDK (`openai`) gives native access to all API features and aligns the output model closer to Claude Code's architecture.

The CLI provider code is preserved on `archive/cli-providers` branch. This work happens on `feat/sdk-providers`.

---

## Phase 1: Shared Foundation (no breaking changes)

### 1a. `providers/provider-response.ts` (NEW)

Shared normalization layer both SDK providers produce before converting to `AIMessage`:

```typescript
// Content blocks (mirrors Anthropic API shape)
type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock;

interface ProviderResponse {
  content: ContentBlock[];
  usage: TokenUsage;
  stopReason: string | undefined;
  model?: string;
}

// Conversion utilities
function extractText(response: ProviderResponse): string;
function extractToolCalls(response: ProviderResponse): ToolCallArray;
function extractThinking(response: ProviderResponse): string | undefined;
function toAIMessage(response: ProviderResponse): AIMessage;  // attaches usage_metadata + tool_calls
```

### 1b. `providers/tool-schema.ts` (NEW)

Shared tool schema conversion (extracted from duplicated pattern across providers):

```typescript
function toolsToAnthropicFormat(tools: StructuredToolInterface[]): AnthropicToolParam[];
function toolsToOpenAIFormat(tools: StructuredToolInterface[]): OpenAIChatCompletionTool[];
```

Uses `toJSONSchema` from `zod` (already used by existing providers).

### 1c. Add `thinking` to `ModelInvocationUpdate` in `providers/types.ts`

```typescript
| { type: "thinking"; content: string }
```

Agent loop (`agent.ts:1482`) gets a new `case "thinking":` that emits a `thinking` event to the thread.

---

## Phase 2: SDK Providers

### 2a. `providers/anthropic-sdk.ts` (NEW, ~350 lines)

**Factory:** `createAnthropicProvider(opts?: AnthropicProviderOptions): ModelAdapter`

- Dynamic import of `@anthropic-ai/sdk` (same pattern as `claude-agent-sdk.ts`)
- Options: `model`, `apiKey`, `baseURL`, `maxTokens`, `temperature`, `thinking`, `systemPrompt`, `timeout`, `enableCaching`

**Message conversion** (`convertToAnthropicMessages`):
- `SystemMessage` -> top-level `system` param (not a message)
- `HumanMessage` -> `{ role: "user", content }`
- `AIMessage` -> `{ role: "assistant", content: ContentBlock[] }` with text + tool_use blocks
- `ToolMessage` -> `{ role: "user", content: [{ type: "tool_result", tool_use_id, content }] }`

**Tool binding:** Native Anthropic tool format via `toolsToAnthropicFormat()`

**`invoke()`:** `client.messages.create()` -> `mapAnthropicResponse()` -> `toAIMessage()`

**`invokeWithUpdates()`:** `client.messages.stream()` with event mapping:
- `content_block_delta` + `text_delta` -> `assistant_message` update
- `content_block_delta` + `thinking_delta` -> `thinking` update
- `content_block_delta` + `input_json_delta` -> accumulate tool input
- `content_block_stop` (tool_use) -> `tool_call` update
- `message_delta` -> `usage` update
- After stream: `final` update + `toAIMessage(finalMessage)`

### 2b. `providers/openai-sdk.ts` (NEW, ~300 lines)

**Factory:** `createOpenAIProvider(opts?: OpenAIProviderOptions): ModelAdapter`

- Dynamic import of `openai`
- Options: `model`, `apiKey`, `baseURL`, `maxCompletionTokens`, `temperature`, `systemPrompt`, `timeout`

**Message conversion** (`convertToOpenAIMessages`):
- `SystemMessage` -> `{ role: "system", content }`
- `HumanMessage` -> `{ role: "user", content }`
- `AIMessage` -> `{ role: "assistant", content, tool_calls? }` (tool_calls mapped to function format)
- `ToolMessage` -> `{ role: "tool", tool_call_id, content }`

**Tool binding:** OpenAI function format via `toolsToOpenAIFormat()`

**`invoke()`:** `client.chat.completions.create()` -> `mapOpenAIResponse()` -> `toAIMessage()`

**`invokeWithUpdates()`:** `client.chat.completions.create({ stream: true, stream_options: { include_usage: true } })`:
- `delta.content` -> `assistant_message` update
- `delta.tool_calls` -> accumulate by index, emit `tool_call` on completion
- `chunk.usage` -> `usage` update
- After stream: `final` update + `toAIMessage()`

---

## Phase 3: Integration

### 3a. `providers/types.ts` — update JSDoc (ModelAdapter no longer CLI-only)

### 3b. `index.ts` — replace CLI exports with SDK exports:
- Remove: `createClaudeCliProvider`, `createCodexCliProvider`, `createClaudeAgentSdkProvider` + their types
- Add: `createAnthropicProvider`, `createOpenAIProvider` + their types
- Add: `ProviderResponse`, `ContentBlock`, `toAIMessage`, `toolsToAnthropicFormat`, `toolsToOpenAIFormat`

### 3c. `package.json` — update peer deps:
- Remove: `@anthropic-ai/claude-agent-sdk`
- Add: `@anthropic-ai/sdk` (optional), `openai` (optional)

### 3d. TUI `types.ts` — update provider types:
```typescript
type ProviderType = "langchain" | "anthropic" | "openai";
const DEFAULT_MODELS = {
  langchain: "gpt-5.4-mini",
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4.1",
};
```
- `normalizeProvider`: `"claude"/"claude-sdk"` -> `"anthropic"`, `"codex"` -> `"openai"`

### 3e. TUI `provider-resolution.ts` — rewrite to use SDK factories:
- `"anthropic"` -> `createAnthropicProvider({ model })`
- `"openai"` -> `createOpenAIProvider({ model })`
- `"langchain"` -> return string (unchanged)
- Remove `resolveClaudePermissionMode` (CLI-specific)

### 3f. `unified-log.ts` — update ProviderType: `"langchain" | "anthropic" | "openai"`

### 3g. `cli.tsx` — update `--provider` choices and help text

### 3h. `agent.ts` — add `case "thinking":` handler (~5 lines)

---

## Phase 4: Cleanup

- Remove source files from `feat/sdk-providers` (kept on `archive/cli-providers`):
  - `providers/claude-cli.ts`
  - `providers/codex-cli.ts`
  - `providers/claude-agent-sdk.ts`
  - `providers/messages-to-xml.ts`
- Remove corresponding tests:
  - `__tests__/providers/claude-cli.test.ts`
  - `__tests__/providers/codex-cli.test.ts`
  - `__tests__/providers/claude-agent-sdk-*.test.ts`
  - `__tests__/providers/messages-to-xml.test.ts`

---

## Files Inventory

**New (6):**
| File | Purpose |
|------|---------|
| `packages/deep-factor-agent/src/providers/provider-response.ts` | Shared ProviderResponse type + toAIMessage conversion |
| `packages/deep-factor-agent/src/providers/tool-schema.ts` | Shared tool schema conversion for both SDKs |
| `packages/deep-factor-agent/src/providers/anthropic-sdk.ts` | Anthropic SDK provider |
| `packages/deep-factor-agent/src/providers/openai-sdk.ts` | OpenAI SDK provider |
| `packages/deep-factor-agent/__tests__/providers/anthropic-sdk.test.ts` | Anthropic provider tests |
| `packages/deep-factor-agent/__tests__/providers/openai-sdk.test.ts` | OpenAI provider tests |

**Modified (8):**
| File | Change |
|------|--------|
| `packages/deep-factor-agent/src/providers/types.ts` | Add `thinking` update variant, update JSDoc |
| `packages/deep-factor-agent/src/index.ts` | Swap CLI exports for SDK exports |
| `packages/deep-factor-agent/src/agent.ts` | Add `case "thinking":` (~5 lines) |
| `packages/deep-factor-agent/package.json` | Swap peer deps |
| `packages/deep-factor-tui/src/types.ts` | Update ProviderType, DEFAULT_MODELS, normalizeProvider |
| `packages/deep-factor-tui/src/provider-resolution.ts` | Rewrite for SDK factories |
| `packages/deep-factor-tui/src/cli.tsx` | Update --provider choices |
| `packages/deep-factor-agent/src/unified-log.ts` | Update ProviderType |

**Removed (4 source + 4 test):**
- CLI provider source files and their tests (archived on `archive/cli-providers`)

---

## Test Strategy

- Mock SDK clients with `vi.mock` (pattern from existing `claude-agent-sdk-invoke.test.ts`)
- Mock streaming with `async function*` generators
- Test: `invoke()` (text, tool_use, thinking, errors), `invokeWithUpdates()` (all event types), `bindTools()` immutability, message conversion, usage metadata
- Existing `agent.test.ts` and `integration.test.ts` pass unchanged (they use mock `BaseChatModel`)

## Verification

1. `pnpm -r type-check` — all packages compile
2. `pnpm -r test` — all tests pass
3. `deepfactor --provider anthropic -m claude-sonnet-4-20250514 "hello"` — smoke test Anthropic
4. `deepfactor --provider openai -m gpt-4.1 "hello"` — smoke test OpenAI
5. `deepfactor --provider langchain -m gpt-4.1-mini "hello"` — LangChain still works
