# deep-factor-agent

A TypeScript library for building loop-based AI agents with middleware, verification, stop conditions, human-in-the-loop, and context management  aligned with the [12-factor agent](https://github.com/humanlayer/12-factor-agents) methodology.

## Overview

`deep-factor-agent` wraps [LangChain's `initChatModel`](https://js.langchain.com/docs/how_to/chat_models_universal_init/) in an opinionated agent loop that gives you fine-grained control over iteration limits, cost guardrails, completion verification, context window management, and human escalation  all through a declarative configuration surface.

**Why a loop-based agent?** Single-shot LLM calls are rarely enough for non-trivial tasks. An agentic loop lets the model call tools, observe results, reflect, and iterate until the task is truly done  while stop conditions and middleware keep execution safe and observable.

### Key capabilities

- **Agentic loop**  iterative tool-calling with automatic message history
- **Stop conditions**  cap iterations, tokens, or dollar cost
- **Completion verification**  optionally verify the agent actually finished the task
- **Middleware**  inject tools and lifecycle hooks (built-in: todo tracking, error recovery)
- **Human-in-the-loop**  pause execution, collect human input, and resume
- **Execution modes**  `plan`, `approve`, and `yolo` for planning-only, approval-gated, or unrestricted runs
- **Context management**  automatic summarization when the context window fills up
- **Streaming**  stream the first LLM turn for real-time UIs
- **Universal model support**  string-based model IDs (`"openai:gpt-4.1-mini"`) or `BaseChatModel` instances

## Installation

```bash
pnpm add deep-factor-agent langchain @langchain/core zod
```

`langchain` and `@langchain/core` are runtime dependencies. `zod` (v4+) is a **peer dependency**  you must install it yourself.

You also need a model provider package, e.g.:

```bash
pnpm add @langchain/openai
# or @langchain/anthropic, @langchain/google-genai, etc.
```

## Quick Start

```typescript
import { createDeepFactorAgent, maxIterations } from "deep-factor-agent";

// String-based model ID (universal  requires provider package installed)
const agent = createDeepFactorAgent({
  model: "openai:gpt-4.1-mini",
  mode: "yolo",
  instructions: "You are a helpful assistant.",
  stopWhen: [maxIterations(5)],
});

const result = await agent.loop("What is the capital of France?");

console.log(result.response); // "The capital of France is Paris."
console.log(result.iterations); // number of loop iterations used
console.log(result.usage); // { inputTokens, outputTokens, totalTokens }
```

You can also pass a `BaseChatModel` instance directly:

```typescript
import { initChatModel } from "langchain/chat_models/universal";

const model = await initChatModel("gpt-4.1-mini", {
  modelProvider: "openai",
});
const agent = createDeepFactorAgent({ model });
```

## Usage Examples

### Minimal agent (model only)

```typescript
import { createDeepFactorAgent } from "deep-factor-agent";

const agent = createDeepFactorAgent({
  model: "openai:gpt-4.1-mini",
  mode: "plan",
  instructions: "Inspect the repo and return a proposed plan only.",
});

const result = await agent.loop("Plan the refactor.");

if ("mode" in result && result.mode === "plan") {
  console.log(result.plan);
}
```

### Approval-gated execution

```typescript
const agent = createDeepFactorAgent({
  model: "openai:gpt-4.1-mini",
  mode: "approve",
});

const result = await agent.loop("Hello!");
if (result.stopReason === "human_input_needed") {
  const final = await result.resume({ decision: "edit", response: "Change fewer files." });
  console.log("response" in final ? final.response : final.plan);
}
```

All other settings use sensible defaults  see the [Defaults table](#defaults) below.

### Agent with tools and verification

```typescript
import { createDeepFactorAgent, maxIterations } from "deep-factor-agent";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const getWeather = tool(async ({ city }) => `726F and sunny in ${city}`, {
  name: "getWeather",
  description: "Get weather for a city",
  schema: z.object({ city: z.string() }),
});

const agent = createDeepFactorAgent({
  model: "openai:gpt-4.1-mini",
  instructions: "Use the weather tool to answer weather questions.",
  tools: [getWeather],
  stopWhen: [maxIterations(10)],
  verifyCompletion: async ({ result }) => ({
    complete: result.includes("6F"),
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
  model: "openai:gpt-4.1-mini",
  stopWhen: [
    maxIterations(20), // stop after 20 loop iterations
    maxTokens(100_000), // stop at 100k total tokens
    maxInputTokens(80_000), // stop at 80k input tokens
    maxOutputTokens(20_000), // stop at 20k output tokens
    maxCost(0.5), // stop at $0.50 spend
  ],
});
```

Multiple conditions can be combined  the first one that triggers ends the loop.

### Human-in-the-loop

```typescript
import {
  createDeepFactorAgent,
  requestHumanInput,
  isPendingResult,
  maxIterations,
} from "deep-factor-agent";

const agent = createDeepFactorAgent({
  model: "openai:gpt-4.1-mini",
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
  model: "openai:gpt-4.1-mini",
  middleware: [todoMiddleware(), errorRecoveryMiddleware()],
});
```

---

_Last updated: 2026-03-10 19:28:03_

_Current directory: /home/ryaneggz/sandbox/2026/feb/deep-factor-agent_

_Hostname: legion-laptop_
