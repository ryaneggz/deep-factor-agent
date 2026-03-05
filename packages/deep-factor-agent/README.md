# deep-factor-agent

A model-agnostic AI agent framework built on LangChain primitives with pluggable model providers, tool calling, middleware, and context management.

## Installation

```bash
pnpm add deep-factor-agent
```

## Model Providers

The agent supports multiple model providers through the `ModelAdapter` interface.

### LangChain Models (default)

Any LangChain `BaseChatModel` can be used directly via `initChatModel`:

```typescript
import { createDeepFactorAgent } from "deep-factor-agent";

const agent = createDeepFactorAgent({
  model: "anthropic/claude-sonnet-4-20250514",
  instructions: "You are a helpful assistant.",
});
```

### Claude Agent SDK

Uses `@anthropic-ai/claude-agent-sdk` for native Claude agent capabilities including built-in tools, MCP server support, and permission modes.

**Install the optional dependency:**

```bash
pnpm add @anthropic-ai/claude-agent-sdk
```

**Usage:**

```typescript
import { createDeepFactorAgent, createClaudeAgentSdkProvider } from "deep-factor-agent";

const provider = createClaudeAgentSdkProvider({
  model: "claude-sonnet-4-20250514",
  permissionMode: "bypassPermissions",
  maxTurns: 1,
  systemPrompt: "You are a coding assistant.",
  timeout: 60_000,
});

const agent = createDeepFactorAgent({
  model: provider,
  instructions: "Help the user with their code.",
  tools: [
    /* your LangChain tools */
  ],
});

const result = await agent.loop("Fix the bug in src/app.ts");
```

**Provider options:**

| Option            | Type       | Default               | Description                                                                          |
| ----------------- | ---------- | --------------------- | ------------------------------------------------------------------------------------ |
| `model`           | `string`   | —                     | Claude model ID (e.g. `"claude-opus-4-6"`)                                           |
| `permissionMode`  | `string`   | `"bypassPermissions"` | SDK permission mode                                                                  |
| `cwd`             | `string`   | —                     | Working directory for file operations                                                |
| `maxTurns`        | `number`   | `1`                   | Maximum agent turns per query                                                        |
| `thinking`        | `object`   | —                     | Thinking/reasoning config (`{type:"adaptive"}` or `{type:"enabled",budgetTokens:N}`) |
| `effort`          | `string`   | —                     | Effort level (`"low"`, `"medium"`, `"high"`, `"max"`)                                |
| `mcpServers`      | `object`   | —                     | MCP server definitions                                                               |
| `allowedTools`    | `string[]` | —                     | Built-in tools to allow (e.g. `["Read","Edit","Bash"]`)                              |
| `disallowedTools` | `string[]` | —                     | Tools to explicitly disallow                                                         |
| `systemPrompt`    | `string`   | —                     | Custom system prompt                                                                 |
| `persistSession`  | `boolean`  | —                     | Whether to persist/resume the SDK session                                            |
| `timeout`         | `number`   | `120000`              | Query timeout in milliseconds                                                        |

### Claude CLI

Shells out to the `claude` CLI binary for each invocation:

```typescript
import { createDeepFactorAgent, createClaudeCliProvider } from "deep-factor-agent";

const provider = createClaudeCliProvider({
  model: "sonnet",
  timeout: 60_000,
});

const agent = createDeepFactorAgent({
  model: provider,
  instructions: "You are a helpful assistant.",
});
```

### Codex CLI

Shells out to the `codex` CLI binary:

```typescript
import { createDeepFactorAgent, createCodexCliProvider } from "deep-factor-agent";

const provider = createCodexCliProvider({
  model: "o4-mini",
});

const agent = createDeepFactorAgent({
  model: provider,
  instructions: "You are a helpful assistant.",
});
```

### Custom Providers

Implement the `ModelAdapter` interface for any model backend:

```typescript
import type { ModelAdapter } from "deep-factor-agent";
import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage } from "@langchain/core/messages";

const customProvider: ModelAdapter = {
  async invoke(messages: BaseMessage[]): Promise<AIMessage> {
    // Call your model API
    return new AIMessage({ content: "response" });
  },
  bindTools(tools) {
    // Return a new adapter with tools configured
    return { ...this /* tools config */ };
  },
};
```

## Features

- **Tool Calling**: Automatic tool binding, invocation, and result collection via LangChain `StructuredToolInterface`
- **Stop Conditions**: `maxIterations`, `maxTokens`, `maxCost` — composable limits on agent execution
- **Middleware**: `todoMiddleware`, `errorRecoveryMiddleware` — pluggable pre/post processing
- **Context Management**: Automatic context window management with configurable token limits
- **Human-in-the-Loop**: Built-in `requestHumanInput` tool for interactive workflows
- **Streaming**: `agent.stream()` yields events as the agent works
