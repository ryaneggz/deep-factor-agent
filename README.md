# deep-factor-agent

A TypeScript library for building loop-based AI agents with middleware, verification, stop conditions, human-in-the-loop, and context management — aligned with the [12-factor agent](https://github.com/humanlayer/12-factor-agents) methodology.

## Overview

`deep-factor-agent` wraps [LangChain's `initChatModel`](https://js.langchain.com/docs/how_to/chat_models_universal_init/) in an opinionated agent loop that gives you fine-grained control over iteration limits, cost guardrails, completion verification, context window management, and human escalation — all through a declarative configuration surface.

**Why a loop-based agent?** Single-shot LLM calls are rarely enough for non-trivial tasks. An agentic loop lets the model call tools, observe results, reflect, and iterate until the task is truly done — while stop conditions and middleware keep execution safe and observable.

### Key capabilities

- **Agentic loop** — iterative tool-calling with automatic message history
- **Stop conditions** — cap iterations, tokens, or dollar cost
- **Completion verification** — optionally verify the agent actually finished the task
- **Middleware** — inject tools and lifecycle hooks (built-in: todo tracking, error recovery)
- **Human-in-the-loop** — pause execution, collect human input, and resume
- **Context management** — automatic summarization when the context window fills up
- **Streaming** — stream the first LLM turn for real-time UIs
- **Universal model support** — string-based model IDs (`"anthropic:claude-sonnet-4-5"`) or `BaseChatModel` instances

## Installation

```bash
pnpm add deep-factor-agent langchain @langchain/core zod
```

`langchain` and `@langchain/core` are runtime dependencies. `zod` (v4+) is a **peer dependency** — you must install it yourself.

You also need a model provider package, e.g.:

```bash
pnpm add @langchain/anthropic
# or @langchain/openai, @langchain/google-genai, etc.
```

## Quick Start

```typescript
import { createDeepFactorAgent, maxIterations } from "deep-factor-agent";

// String-based model ID (universal — requires provider package installed)
const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
  instructions: "You are a helpful assistant.",
  stopWhen: [maxIterations(5)],
});

const result = await agent.loop("What is the capital of France?");

console.log(result.response);   // "The capital of France is Paris."
console.log(result.iterations); // number of loop iterations used
console.log(result.usage);      // { inputTokens, outputTokens, totalTokens }
```

You can also pass a `BaseChatModel` instance directly:

```typescript
import { initChatModel } from "langchain/chat_models/universal";

const model = await initChatModel("claude-sonnet-4-5", {
  modelProvider: "anthropic",
});
const agent = createDeepFactorAgent({ model });
```

## Usage Examples

### Minimal agent (model only)

```typescript
import { createDeepFactorAgent } from "deep-factor-agent";

const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
});

const result = await agent.loop("Hello!");
console.log(result.response);
```

All other settings use sensible defaults — see the [Defaults table](#defaults) below.

### Agent with tools and verification

```typescript
import { createDeepFactorAgent, maxIterations } from "deep-factor-agent";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const getWeather = tool(
  async ({ city }) => `72°F and sunny in ${city}`,
  {
    name: "getWeather",
    description: "Get weather for a city",
    schema: z.object({ city: z.string() }),
  },
);

const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
  instructions: "Use the weather tool to answer weather questions.",
  tools: [getWeather],
  stopWhen: [maxIterations(10)],
  verifyCompletion: async ({ result }) => ({
    complete: result.includes("°F"),
    reason: "Response must contain a temperature",
  }),
});

const result = await agent.loop("What's the weather in Austin?");
```

### Stop conditions

```typescript
import {
  createDeepFactorAgent,
  maxIterations,
  maxTokens,
  maxInputTokens,
  maxOutputTokens,
  maxCost,
} from "deep-factor-agent";

const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
  stopWhen: [
    maxIterations(20),          // stop after 20 loop iterations
    maxTokens(100_000),         // stop at 100k total tokens
    maxInputTokens(80_000),     // stop at 80k input tokens
    maxOutputTokens(20_000),    // stop at 20k output tokens
    maxCost(0.50),              // stop at $0.50 spend
  ],
});
```

Multiple conditions can be combined — the first one that triggers ends the loop.

### Human-in-the-loop

```typescript
import {
  createDeepFactorAgent,
  requestHumanInput,
  isPendingResult,
  maxIterations,
} from "deep-factor-agent";

const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
  tools: [requestHumanInput],
  interruptOn: ["requestHumanInput"],
  stopWhen: [maxIterations(10)],
});

const result = await agent.loop("Ask the user what color they prefer.");

if (isPendingResult(result)) {
  console.log("Agent is waiting for input");

  // Provide the human's answer and resume the loop
  const finalResult = await result.resume("Blue");
  console.log(finalResult.response);
}
```

### Middleware

```typescript
import {
  createDeepFactorAgent,
  todoMiddleware,
  errorRecoveryMiddleware,
  maxIterations,
} from "deep-factor-agent";

// Built-in middleware (these are the defaults)
const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
  middleware: [todoMiddleware(), errorRecoveryMiddleware()],
  stopWhen: [maxIterations(10)],
});
```

**Custom middleware:**

```typescript
import { createDeepFactorAgent, maxIterations } from "deep-factor-agent";
import type { AgentMiddleware } from "deep-factor-agent";

const loggingMiddleware: AgentMiddleware = {
  name: "logging",
  beforeIteration: async (ctx) => {
    console.log(`Starting iteration ${ctx.iteration}`);
  },
  afterIteration: async (ctx) => {
    console.log(`Finished iteration ${ctx.iteration}`);
  },
};

const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
  middleware: [loggingMiddleware],
  stopWhen: [maxIterations(5)],
});
```

### Streaming

```typescript
import { createDeepFactorAgent } from "deep-factor-agent";

const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
});

const stream = await agent.stream("Tell me a story.");

for await (const chunk of stream) {
  process.stdout.write(typeof chunk.content === "string" ? chunk.content : "");
}
```

### Context management

```typescript
import { createDeepFactorAgent, maxIterations } from "deep-factor-agent";

const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
  stopWhen: [maxIterations(50)],
  contextManagement: {
    maxContextTokens: 100_000,  // summarize when context exceeds this
    keepRecentIterations: 5,    // always keep the last 5 iterations intact
  },
});
```

When the context window fills up, older iterations are automatically summarized by the model so the agent can keep working without losing important history.

## Defaults

When using `createDeepFactorAgent`, unspecified settings receive these defaults:

| Setting | Default |
|---|---|
| `tools` | `[]` (no tools) |
| `instructions` | `""` (empty) |
| `stopWhen` | `[maxIterations(10)]` |
| `verifyCompletion` | `undefined` (no verification) |
| `middleware` | `[todoMiddleware(), errorRecoveryMiddleware()]` |
| `interruptOn` | `[]` (no interruptions) |
| `contextManagement.maxContextTokens` | `150000` |
| `contextManagement.keepRecentIterations` | `3` |

## API Reference

### Factory

| Export | Description |
|---|---|
| `createDeepFactorAgent(settings)` | Creates a `DeepFactorAgent` with sensible defaults. The primary entry point. |

### Agent Class

| Export | Description |
|---|---|
| `DeepFactorAgent` | Core agent class. Use `createDeepFactorAgent` unless you need full control. |
| `.loop(prompt)` | Run the agentic loop. Returns `AgentResult` or `PendingResult`. |
| `.stream(prompt)` | Stream the first LLM turn (non-looping). Returns `AsyncIterable<AIMessageChunk>`. |
| `addUsage(a, b)` | Merge two `TokenUsage` objects by summing their fields. |

### Stop Conditions

| Export | Description |
|---|---|
| `maxIterations(n)` | Stop after `n` loop iterations. |
| `maxTokens(n)` | Stop when total tokens reach `n`. |
| `maxInputTokens(n)` | Stop when input tokens reach `n`. |
| `maxOutputTokens(n)` | Stop when output tokens reach `n`. |
| `maxCost(dollars, model?)` | Stop when estimated cost reaches `dollars`. |
| `calculateCost(usage, model)` | Calculate cost for a given `TokenUsage` and model name. |
| `MODEL_PRICING` | Built-in pricing table for common models (Anthropic, OpenAI, Google). |
| `evaluateStopConditions(conditions, ctx)` | Evaluate an array of stop conditions against a context. |

### Middleware

| Export | Description |
|---|---|
| `composeMiddleware(middlewares)` | Compose an array of `AgentMiddleware` into a single middleware with merged tools and chained hooks. |
| `todoMiddleware()` | Built-in middleware that gives the agent `write_todos` and `read_todos` tools. |
| `errorRecoveryMiddleware()` | Built-in middleware that injects recovery guidance after errors. |

### Context Management

| Export | Description |
|---|---|
| `ContextManager` | Manages context window size by summarizing old iterations when the token limit is exceeded. |
| `estimateTokens(text)` | Approximate token count for a string (~1 token per 3.5 characters). |

### Human-in-the-Loop

| Export | Description |
|---|---|
| `requestHumanInput` | A LangChain tool that pauses the agent loop to collect human input. Use with `interruptOn: ["requestHumanInput"]`. |
| `isPendingResult(r)` | Type guard to check if a result is a `PendingResult` (agent is waiting for human input). |

### Tool Adapter Utilities

| Export | Description |
|---|---|
| `createLangChainTool(name, config)` | Create a LangChain `StructuredToolInterface` from a simple `{ description, schema, execute }` config. |
| `toolArrayToMap(tools)` | Convert a `StructuredToolInterface[]` to a `Record<string, StructuredToolInterface>` for name-based lookup. |
| `findToolByName(tools, name)` | Find a tool in an array by its `.name` property. |

### Types

All types are exported for use in your code:

| Type | Description |
|---|---|
| `DeepFactorAgentSettings<TTools>` | Configuration for `createDeepFactorAgent`. `model` accepts `BaseChatModel \| string`. |
| `AgentResult` | Return type of `loop()` — contains `response`, `thread`, `usage`, `iterations`, `stopReason`. |
| `PendingResult` | Returned when `stopReason` is `"human_input_needed"` — adds `resume(input)`. |
| `AgentThread` | The conversation thread with `id`, `events`, `metadata`. |
| `TokenUsage` | Token counts: `inputTokens`, `outputTokens`, `totalTokens`, optional cache fields. |
| `StopCondition` | A function `(ctx: StopConditionContext) => StopConditionResult`. |
| `StopConditionContext` | Context passed to stop conditions: `iteration`, `usage`, `model`, `thread`. |
| `StopConditionResult` | Result from a stop condition: `{ stop: boolean, reason?: string }`. |
| `VerifyCompletion` | Async function to verify the agent completed its task. |
| `VerifyContext` | Context passed to `verifyCompletion`: `result` (string), `iteration`, `thread`, `originalPrompt`. |
| `VerifyResult` | Result from verification: `{ complete: boolean, reason?: string }`. |
| `AgentMiddleware` | Middleware definition with `name`, optional `tools` (`StructuredToolInterface[]`), and lifecycle hooks. |
| `MiddlewareContext` | Context passed to middleware hooks: `thread`, `iteration`, `settings`. |
| `ContextManagementConfig` | Config for context management: `maxContextTokens`, `keepRecentIterations`. |
| `AgentEvent` | Discriminated union of all event types in the thread. |

## Architecture: 12-Factor Agent Alignment

This library is designed around the [12-factor agent](https://github.com/humanlayer/12-factor-agents) principles:

1. **Natural language to tool calls** — the agent loop translates prompts into tool invocations
2. **Own your prompts** — `instructions` are plain strings you control, not hidden behind abstractions
3. **Own your context window** — `ContextManager` gives you explicit control over context size and summarization
4. **Tools are just functions** — standard LangChain `tool()` definitions, no proprietary wrapper
5. **Unified LLM interface** — any model provider supported by LangChain's `initChatModel` works, including string IDs like `"anthropic:claude-sonnet-4-5"`
6. **Use structured outputs** — Zod schemas for tool parameters and validation
7. **Own your control flow** — the loop, stop conditions, and middleware are all configurable
8. **Compact errors into context** — `errorRecoveryMiddleware` feeds truncated errors back into the conversation
9. **Own your threads** — `AgentThread` gives you full access to conversation history and metadata
10. **Small, focused agents** — the library encourages composing single-purpose agents
11. **Trigger from anywhere** — `loop()` and `stream()` can be called from any runtime (server, CLI, edge)
12. **Make agents observable** — thread events, token tracking, and lifecycle callbacks provide full visibility

## Development

```bash
pnpm install        # install dependencies
pnpm build          # compile TypeScript
pnpm test           # run tests (vitest)
pnpm type-check     # type-check without emitting
pnpm dev            # watch mode
```

## License

MIT
