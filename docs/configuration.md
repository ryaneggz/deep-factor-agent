# Configuration Reference

## createDeepFactorAgent Options

```typescript
const agent = createDeepFactorAgent({
  // Required
  model: "openai:gpt-4.1-mini", // string ID, BaseChatModel, or ModelAdapter

  // Optional
  instructions: "", // system prompt
  tools: [], // StructuredToolInterface[]
  mode: "yolo", // "plan" | "approve" | "yolo"
  stopWhen: [maxIterations(10)], // StopCondition[]
  middleware: [
    // AgentMiddleware[]
    todoMiddleware(),
    errorRecoveryMiddleware(),
  ],
  interruptOn: [], // tool names that pause the loop for HITL
  contextMode: "standard", // "standard" | "xml"
  parallelToolCalls: false, // execute independent tool calls concurrently
  streamMode: "final", // "final" (only stream affects loop() not stream())
  verifyCompletion: undefined, // async ({ result, thread }) => { complete, reason }
  onUpdate: undefined, // (update: AgentExecutionUpdate) => void
  contextManagement: {
    maxContextTokens: 150_000,
    keepRecentIterations: 3,
    tokenEstimator: undefined, // (text: string) => number
  },
});
```

## Stop Conditions

All stop condition factories return a `StopCondition` function.

| Factory                    | Argument        | Triggers when                 |
| -------------------------- | --------------- | ----------------------------- |
| `maxIterations(n)`         | number          | Iteration count >= n          |
| `maxTokens(n)`             | number          | Total tokens >= n             |
| `maxInputTokens(n)`        | number          | Input tokens >= n             |
| `maxOutputTokens(n)`       | number          | Output tokens >= n            |
| `maxCost(dollars, model?)` | number, string? | Estimated USD cost >= dollars |

Multiple conditions can be combined — the first one that triggers ends the loop.

```typescript
stopWhen: [maxIterations(20), maxTokens(100_000), maxCost(0.5)];
```

## Tool Metadata

Tools can declare metadata that controls mode behavior:

```typescript
import { createLangChainTool } from "deep-factor-agent";

const writeTool = createLangChainTool("write_file", {
  description: "Write a file",
  schema: z.object({ path: z.string(), content: z.string() }),
  execute: async ({ path, content }) => {
    /* ... */
  },
  metadata: {
    mutatesState: true, // gated in approve mode, blocked in plan mode
    modeAvailability: {
      plan: false, // not available in plan mode
      approve: true, // available with approval
      yolo: true, // available freely
    },
  },
});
```

## Middleware

Middleware implements the `AgentMiddleware` interface:

```typescript
interface AgentMiddleware {
  name: string;
  tools?: StructuredToolInterface[];
  beforeIteration?: (ctx: MiddlewareContext) => Promise<void> | void;
  afterIteration?: (ctx: MiddlewareContext) => Promise<void> | void;
}
```

**Built-in middleware:**

| Name                        | Tools Added                 | Behavior                             |
| --------------------------- | --------------------------- | ------------------------------------ |
| `todoMiddleware()`          | `write_todos`, `read_todos` | Tracks task lists across iterations  |
| `errorRecoveryMiddleware()` | none                        | Injects system feedback after errors |

**Custom middleware:**

```typescript
const loggingMiddleware: AgentMiddleware = {
  name: "logging",
  beforeIteration: ({ thread, iteration }) => {
    console.log(`Starting iteration ${iteration}`);
  },
  afterIteration: ({ thread, iteration }) => {
    console.log(`Completed iteration ${iteration}`);
  },
};
```

## Context Management

| Option                 | Default                        | Description                                      |
| ---------------------- | ------------------------------ | ------------------------------------------------ |
| `maxContextTokens`     | 150,000                        | Token threshold before summarization             |
| `keepRecentIterations` | 3                              | Recent iterations preserved during summarization |
| `tokenEstimator`       | `Math.ceil(text.length / 3.5)` | Custom token counting function                   |

## Agent Methods

### `loop(prompt: string): Promise<AgentResult | PlanResult | PendingResult>`

Starts a new agent thread and runs until completion, stop condition, or human input needed.

### `continueLoop(thread, prompt): Promise<AgentResult | PlanResult | PendingResult>`

Resumes an existing thread with a new user message.

### `stream(prompt: string): AsyncIterable<AIMessageChunk>`

Streams the first LLM response. Only works in `yolo` mode.

## Result Types

```typescript
// Normal completion
interface AgentResult {
  response: string;
  iterations: number;
  usage: TokenUsage;
  thread: AgentThread;
  stopReason: string;
}

// Plan mode completion
interface PlanResult {
  mode: "plan";
  plan: string;
  thread: AgentThread;
  // Can be reviewed and approved/rejected
}

// Awaiting human input
interface PendingResult {
  stopReason: "human_input_needed";
  resume: (input: string | ResumeInput) => Promise<AgentResult>;
  thread: AgentThread;
}
```

Use type guards:

```typescript
if (isPendingResult(result)) {
  /* ... */
}
if (isPlanResult(result)) {
  /* ... */
}
```

## Defaults Summary

| Setting                 | Default                                         |
| ----------------------- | ----------------------------------------------- |
| `mode`                  | `"yolo"`                                        |
| `stopWhen`              | `[maxIterations(10)]`                           |
| `middleware`            | `[todoMiddleware(), errorRecoveryMiddleware()]` |
| `contextMode`           | `"standard"`                                    |
| `parallelToolCalls`     | `false`                                         |
| `streamMode`            | `"final"`                                       |
| `maxContextTokens`      | `150,000`                                       |
| `keepRecentIterations`  | `3`                                             |
| `consecutiveErrors max` | `3` (triggers `max_errors` stop)                |
