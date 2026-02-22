# SPEC-06: Factory Function (`createDeepFactorAgent`)

## CONTEXT

The factory function is the primary public API. It provides a simple, discoverable entry point with sensible defaults. This is the "own your prompts" (Factor 2) and "trigger from anywhere" (Factor 11) entry point.

### DEPENDENCIES
- SPEC-02 (core types)
- SPEC-03 (stop conditions for defaults)
- SPEC-04 (agent loop)
- SPEC-05 (middleware)

---

## API

```ts
function createDeepFactorAgent<TTools extends ToolSet = ToolSet>(
  settings: DeepFactorAgentSettings<TTools>
): DeepFactorAgent<TTools>;
```

### Defaults

| Setting | Default |
|---------|---------|
| `tools` | `{}` (no tools) |
| `instructions` | `""` (no system prompt) |
| `stopWhen` | `[maxIterations(10)]` |
| `verifyCompletion` | `undefined` (single iteration mode) |
| `middleware` | `[todoMiddleware(), errorRecoveryMiddleware()]` |
| `interruptOn` | `[]` (no tools require approval) |
| `contextManagement` | `{ maxContextTokens: 150000, keepRecentIterations: 3 }` |

### Usage Examples

**Minimal:**
```ts
import { createDeepFactorAgent } from "deep-factor-agent";

const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
});

const result = await agent.loop("What is the capital of France?");
console.log(result.response);
```

**With tools and verification:**
```ts
import { createDeepFactorAgent, maxIterations, maxCost } from "deep-factor-agent";
import { tool } from "ai";
import { z } from "zod";

const searchTool = tool({
  description: "Search the web",
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => { /* ... */ },
});

const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
  tools: { search: searchTool },
  instructions: "You are a research assistant. Always cite sources.",
  stopWhen: [maxIterations(5), maxCost(0.50)],
  verifyCompletion: async ({ result, iteration }) => {
    // Custom verification logic
    const hasSource = String(result).includes("http");
    return { complete: hasSource, reason: hasSource ? undefined : "Please include source URLs" };
  },
});

const result = await agent.loop("Find the latest TypeScript release notes");
```

**With custom middleware:**
```ts
import { createDeepFactorAgent } from "deep-factor-agent";

const loggingMiddleware = {
  name: "logging",
  beforeIteration: async ({ iteration }) => {
    console.log(`Starting iteration ${iteration}`);
  },
  afterIteration: async ({ iteration }, result) => {
    console.log(`Completed iteration ${iteration}`);
  },
};

const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
  middleware: [loggingMiddleware],
});
```

---

## FILE STRUCTURE

- `src/create-agent.ts` -- factory function
- `src/create-agent.test.ts` -- integration tests
- `src/index.ts` -- barrel exports

### Exports from `src/index.ts`

```ts
// Factory
export { createDeepFactorAgent } from "./create-agent";

// Types
export type {
  AgentEvent,
  AgentThread,
  AgentResult,
  PendingResult,
  TokenUsage,
  StopCondition,
  VerifyCompletion,
  AgentMiddleware,
  DeepFactorAgentSettings,
  ContextManagementConfig,
} from "./types";

// Stop conditions
export {
  maxIterations,
  maxTokens,
  maxInputTokens,
  maxOutputTokens,
  maxCost,
  calculateCost,
  MODEL_PRICING,
} from "./stop-conditions";

// Middleware
export {
  composeMiddleware,
  todoMiddleware,
  errorRecoveryMiddleware,
} from "./middleware";

// Agent class (for advanced usage)
export { DeepFactorAgent } from "./agent";
```

---

## ACCEPTANCE CRITERIA

- [ ] `createDeepFactorAgent({ model: "..." })` returns a working agent
- [ ] Defaults are applied for all optional settings
- [ ] `.loop(prompt)` returns `AgentResult` with response, thread, usage, iterations
- [ ] `.stream(prompt)` returns a streaming result
- [ ] All public types and functions are exported from `src/index.ts`
- [ ] `pnpm build` produces `dist/` with `.js` and `.d.ts` files
- [ ] Integration test with mocked model passes
- [ ] All tests pass (`pnpm test`)
