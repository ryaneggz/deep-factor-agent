# Spec: Claude Agent SDK Provider

## Overview
Add `@anthropic-ai/claude-agent-sdk` as a model provider for deep-factor-agent, implementing the `ModelAdapter` interface. This enables users to leverage Claude Code's full tool ecosystem (Bash, FileEdit, FileRead, Grep, Glob, WebFetch, etc.) through `createDeepFactorAgent`.

## Issue
- GitHub: #13
- Branch: `feat/13-claude-agent-sdk`

## Architecture

### Provider Pattern
Follow the existing `ModelAdapter` pattern from `providers/types.ts`:
- Implement `invoke(messages: BaseMessage[]): Promise<AIMessage>`
- Implement `bindTools(tools: StructuredToolInterface[]): ModelAdapter`

### Key Difference from CLI Providers
Unlike `claude-cli.ts` and `codex-cli.ts` which shell out to CLI binaries and use prompt engineering for tool calls, this provider uses the **SDK's native API** which:
- Returns structured `SDKMessage` events (not raw text)
- Has native tool call support (no prompt engineering needed)
- Supports streaming via AsyncGenerator
- Manages sessions, permissions, hooks natively

### Message Mapping

| LangChain Type | SDK Direction |
|---|---|
| `HumanMessage` → | `SDKUserMessage` (input) |
| `AIMessage` ← | `SDKAssistantMessage` (output, extract from `BetaMessage`) |
| `SystemMessage` → | `systemPrompt` option |
| `ToolMessage` → | Tool results fed back via `streamInput` |

### Tool Call Mapping

SDK `BetaMessage` contains `content` blocks with `type: 'tool_use'`:
```ts
{ type: 'tool_use', id: string, name: string, input: Record<string, unknown> }
```

Map to LangChain `AIMessage.tool_calls`:
```ts
{ name: string, args: Record<string, unknown>, id: string, type: 'tool_call' }
```

### Provider Options
```ts
interface ClaudeAgentSdkProviderOptions {
  model?: string;                    // e.g. 'claude-sonnet-4-6'
  permissionMode?: PermissionMode;   // default: 'bypassPermissions'
  cwd?: string;                      // working directory
  maxTurns?: number;                 // max SDK conversation turns per invoke
  thinking?: ThinkingConfig;         // thinking/reasoning config
  effort?: 'low' | 'medium' | 'high' | 'max';
  mcpServers?: Record<string, McpServerConfig>;
  allowedTools?: string[];           // SDK tool allowlist
  disallowedTools?: string[];        // SDK tool denylist
  systemPrompt?: string;             // base system prompt
  persistSession?: boolean;          // default: false for ephemeral use
  timeout?: number;                  // ms, default: 300000 (5 min)
}
```

### Single-Turn vs Multi-Turn
The agent loop in deep-factor-agent handles multi-turn tool calling itself. The SDK provider should operate in **single-turn mode**:
1. Receive messages → convert to prompt
2. Call `query()` with `maxTurns: 1`
3. Collect the first assistant response
4. Return as `AIMessage` with any tool calls
5. Let the agent loop handle tool execution and re-invocation

### Streaming Support
For the `stream()` path:
- Enable `includePartialMessages: true` in SDK options
- Yield `SDKPartialAssistantMessage` events as streaming chunks
- Map `BetaRawMessageStreamEvent` to LangChain streaming format

## File Structure
```
packages/deep-factor-agent/
  src/providers/
    claude-agent-sdk.ts          # Provider implementation
  __tests__/
    claude-agent-sdk.test.ts     # Unit tests
```

## Test Strategy (TDD)

### Unit Tests
1. **Message conversion** — HumanMessage/SystemMessage/ToolMessage → SDK format
2. **Response parsing** — SDKAssistantMessage → AIMessage with content + tool_calls
3. **Tool binding** — bindTools returns new adapter with tools configured
4. **Options passthrough** — Provider options map correctly to SDK query options
5. **Error handling** — SDK errors (rate limit, auth, timeout) map to meaningful errors
6. **Single-turn constraint** — maxTurns: 1 behavior

### Integration Tests (with mocked SDK)
1. **Full invoke cycle** — messages in, AIMessage out
2. **Tool call round-trip** — invoke → tool_calls → tool results → re-invoke
3. **Streaming** — partial messages yield correctly

## Dependencies
- `@anthropic-ai/claude-agent-sdk` — add as optional peer dependency
- No changes to core agent loop required

## Out of Scope
- Multi-turn SDK sessions (agent loop handles this)
- SDK hooks/permissions UI
- MCP server management UI
- Session persistence/resume across agent invocations
