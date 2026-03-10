# deep-factor-agent

A model-agnostic agent framework built on LangChain primitives with pluggable model providers, tool calling, middleware, and context management.

## Installation

```bash
pnpm add deep-factor-agent
```

## Model Providers

The agent supports multiple model providers through the `ModelAdapter` interface.

### LangChain Models

Any LangChain `BaseChatModel` can be used directly via `initChatModel`:

```ts
import { createDeepFactorAgent } from "deep-factor-agent";

const agent = createDeepFactorAgent({
  model: "gpt-4.1-mini",
  instructions: "You are a helpful assistant.",
});
```

### Claude Agent SDK

Uses `@anthropic-ai/claude-agent-sdk` for native Claude agent capabilities including built-in tools, MCP server support, and permission modes.

Install the optional dependency:

```bash
pnpm add @anthropic-ai/claude-agent-sdk
```

Authenticate with Claude first:

```bash
claude auth login
```

Usage:

```ts
import { createClaudeAgentSdkProvider, createDeepFactorAgent } from "deep-factor-agent";

const provider = createClaudeAgentSdkProvider({
  model: "claude-sonnet-4-6",
  permissionMode: "bypassPermissions",
  maxTurns: 1,
  timeout: 60_000,
});

const agent = createDeepFactorAgent({
  model: provider,
  instructions: "Help the user with their code.",
});

const result = await agent.loop("Fix the bug in src/app.ts");
```

Provider options:

| Option            | Type       | Default               | Description                                                                |
| ----------------- | ---------- | --------------------- | -------------------------------------------------------------------------- |
| `model`           | `string`   | —                     | Claude model ID                                                            |
| `permissionMode`  | `string`   | `"bypassPermissions"` | SDK permission mode                                                        |
| `cwd`             | `string`   | —                     | Working directory for file operations                                      |
| `maxTurns`        | `number`   | `1`                   | Maximum agent turns per query                                              |
| `thinking`        | `object`   | —                     | Thinking config (`{type:"adaptive"}` or `{type:"enabled",budgetTokens:N}`) |
| `effort`          | `string`   | —                     | Effort level (`"low"`, `"medium"`, `"high"`, `"max"`)                      |
| `mcpServers`      | `object`   | —                     | MCP server definitions                                                     |
| `allowedTools`    | `string[]` | —                     | Built-in tools to allow                                                    |
| `disallowedTools` | `string[]` | —                     | Tools to explicitly disallow                                               |
| `systemPrompt`    | `string`   | —                     | Custom system prompt                                                       |
| `persistSession`  | `boolean`  | —                     | Whether to persist/resume the SDK session                                  |
| `timeout`         | `number`   | `120000`              | Query timeout in milliseconds                                              |

### Claude CLI

Shells out to the `claude` CLI binary for each invocation.

### Codex CLI

Shells out to the `codex` CLI binary for each invocation.

### Custom Providers

Implement the `ModelAdapter` interface for any model backend:

```ts
import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { ModelAdapter } from "deep-factor-agent";

const customProvider: ModelAdapter = {
  async invoke(_messages: BaseMessage[]): Promise<AIMessage> {
    return new AIMessage({ content: "response" });
  },
  bindTools(tools) {
    return { ...this, tools };
  },
};
```

## Features

- Tool calling via LangChain `StructuredToolInterface`
- Composable stop conditions such as `maxIterations`, `maxTokens`, and `maxCost`
- Middleware hooks such as `todoMiddleware` and `errorRecoveryMiddleware`
- Context management with configurable token limits
- Human-in-the-loop via `requestHumanInput`
- Streaming via `agent.stream()` for non-`ModelAdapter` models
