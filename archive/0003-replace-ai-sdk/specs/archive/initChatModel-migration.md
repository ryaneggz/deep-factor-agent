# Spec: Migrate from Vercel AI SDK to LangChain `initChatModel`

## Date: 2026-02-22

## Problem Statement

The current `deep-factor-agent` library is tightly coupled to the Vercel AI SDK v6 (`ai` package). Users must import provider-specific functions (e.g., `anthropic()` from `@ai-sdk/anthropic`) to initialize models. LangChain's `initChatModel` provides a universal, string-based model initialization that supports any provider with a single import.

---

## Current Architecture (Vercel AI SDK v6)

### Dependencies
```json
{
  "dependencies": {
    "@ai-sdk/provider-utils": "^4.0.15",
    "ai": "^6.0.97"
  },
  "peerDependencies": {
    "zod": ">=4.0.0"
  }
}
```

### Key Imports from AI SDK
| Import | From | Usage |
|---|---|---|
| `LanguageModel` | `ai` | Type for model instances |
| `ToolSet` | `ai` | Type for tool definitions |
| `generateText` | `ai` | Non-streaming LLM calls |
| `streamText` | `ai` | Streaming LLM calls |
| `stepCountIs` | `ai` | Multi-step tool calling limit |
| `ModelMessage` | `@ai-sdk/provider-utils` | Message format type |

### Current Model Initialization (by end-user)
```typescript
import { anthropic } from "@ai-sdk/anthropic";
const agent = createDeepFactorAgent({
  model: anthropic("claude-sonnet-4-5-20250514"),
});
```

### Current `generateText` Usage (`src/agent.ts`)
```typescript
const result = await generateText({
  model: this.model,
  system,
  messages,
  tools: allTools,
  stopWhen: stepCountIs(20),
});
// Access: result.text, result.steps, result.totalUsage
```

### Current `streamText` Usage (`src/agent.ts`)
```typescript
return streamText({
  model: this.model,
  system,
  messages,
  tools: allTools,
  stopWhen: stepCountIs(20),
});
```

### Current Tool Format (AI SDK `ToolSet`)
```typescript
{
  toolName: {
    description: "...",
    parameters: z.object({ ... }),  // Zod schema
    execute: async (args) => result, // Execution function
  }
}
```

### Current Message Format (`ModelMessage`)
```typescript
{ role: "user", content: "..." }
{ role: "assistant", content: "..." }
```

### Files Using AI SDK
| File | AI SDK Usage |
|---|---|
| `src/types.ts` | `LanguageModel`, `ToolSet` types |
| `src/agent.ts` | `generateText`, `streamText`, `stepCountIs`, `LanguageModel`, `ToolSet`, `ModelMessage` |
| `src/context-manager.ts` | `LanguageModel`, `generateText` |
| `src/middleware.ts` | `ToolSet`, `z` (zod) |
| `src/human-in-the-loop.ts` | `ToolSet` |
| `src/create-agent.ts` | `ToolSet` |
| `src/index.ts` | Re-exports |

---

## Target Architecture (LangChain `initChatModel`)

### Dependencies
```json
{
  "dependencies": {
    "langchain": "^0.3.x",
    "@langchain/core": "^0.3.x"
  },
  "peerDependencies": {
    "zod": ">=4.0.0"
  }
}
```

Provider packages installed by the end-user:
```bash
pnpm add @langchain/openai       # for OpenAI models
pnpm add @langchain/anthropic    # for Anthropic models
pnpm add @langchain/google-genai # for Google Gemini models
pnpm add @langchain/aws          # for AWS Bedrock models
```

### `initChatModel` API

**Import:**
```typescript
import { initChatModel } from "langchain/chat_models/universal";
// Or from the main package:
import { initChatModel } from "langchain";
```

**Signature:**
```typescript
async function initChatModel(
  model?: string,
  fields?: {
    modelProvider?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    maxRetries?: number;
    configurableFields?: string[];
    configPrefix?: string;
    // ...any model-specific kwargs
  }
): Promise<BaseChatModel>
```

**Model Initialization Patterns:**
```typescript
// Provider inferred from model name
const model = await initChatModel("gpt-4.1");

// Provider prefix syntax
const model = await initChatModel("anthropic:claude-sonnet-4-5-20250929");

// Explicit provider
const model = await initChatModel("claude-sonnet-4-5-20250929", {
  modelProvider: "anthropic",
});

// Provider/model slash syntax
const model = await initChatModel("openai/gpt-4.1");

// With parameters
const model = await initChatModel("claude-sonnet-4-5-20250929", {
  temperature: 0.7,
  maxTokens: 1000,
});
```

### Key LangChain Types & Imports
| Import | From | Replaces |
|---|---|---|
| `BaseChatModel` | `@langchain/core/language_models/chat_models` | `LanguageModel` |
| `HumanMessage` | `@langchain/core/messages` | `{ role: "user" }` |
| `AIMessage` | `@langchain/core/messages` | `{ role: "assistant" }` |
| `SystemMessage` | `@langchain/core/messages` | system prompt string |
| `ToolMessage` | `@langchain/core/messages` | tool result in steps |
| `BaseMessage` | `@langchain/core/messages` | `ModelMessage` |
| `tool` | `@langchain/core/tools` | AI SDK tool format |
| `DynamicStructuredTool` | `@langchain/core/tools` | AI SDK tool format |
| `StructuredToolInterface` | `@langchain/core/tools` | `ToolSet` |

### Model Invocation (replaces `generateText`)
```typescript
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const messages = [
  new SystemMessage("You are a helpful assistant."),
  new HumanMessage("What is the capital of France?"),
];

const response = await model.invoke(messages);
// response is AIMessage
// response.content -> string or content blocks
// response.tool_calls -> array of tool call objects
```

### Streaming (replaces `streamText`)
```typescript
const stream = await model.stream(messages);
for await (const chunk of stream) {
  // chunk is AIMessageChunk
  process.stdout.write(chunk.content as string);
}
```

### Tool Calling (replaces AI SDK tool format + `stepCountIs`)
```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const getWeather = tool(
  async (input) => `72F in ${input.location}`,
  {
    name: "getWeather",
    description: "Get weather for a location",
    schema: z.object({ location: z.string() }),
  }
);

// Bind tools to model
const modelWithTools = model.bindTools([getWeather]);

// Invoke - model may return tool_calls
const response = await modelWithTools.invoke(messages);

// Check for tool calls
if (response.tool_calls && response.tool_calls.length > 0) {
  for (const tc of response.tool_calls) {
    const toolResult = await getWeather.invoke(tc.args);
    messages.push(response); // AIMessage with tool_calls
    messages.push(new ToolMessage({
      tool_call_id: tc.id,
      content: toolResult,
    }));
  }
  // Continue conversation with tool results
  const finalResponse = await modelWithTools.invoke(messages);
}
```

### Agentic Loop Pattern with LangChain
```typescript
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

async function agentLoop(model, tools, messages, maxSteps = 20) {
  const modelWithTools = model.bindTools(tools);
  let steps = 0;

  while (steps < maxSteps) {
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      // No tool calls - agent is done
      return response;
    }

    // Execute tool calls
    for (const tc of response.tool_calls) {
      const matchedTool = tools.find(t => t.name === tc.name);
      if (matchedTool) {
        const result = await matchedTool.invoke(tc.args);
        messages.push(new ToolMessage({
          tool_call_id: tc.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        }));
      }
    }
    steps++;
  }
}
```

### Token Usage
LangChain provides usage metadata via `response.usage_metadata`:
```typescript
const response = await model.invoke(messages);
response.usage_metadata?.input_tokens;   // number
response.usage_metadata?.output_tokens;  // number
response.usage_metadata?.total_tokens;   // number
```

### Structured Output (replaces Zod-based tools)
```typescript
const structuredModel = model.withStructuredOutput(z.object({
  answer: z.string(),
  confidence: z.number(),
}));

const result = await structuredModel.invoke("What is 2+2?");
// result = { answer: "4", confidence: 1.0 }
```

---

## Migration Impact Analysis

### High-Impact Changes (Core Agent Loop)

1. **`src/agent.ts`** - Complete rewrite of `generateText`/`streamText` calls
   - Replace `generateText()` with `model.invoke()` + manual tool loop
   - Replace `streamText()` with `model.stream()`
   - Replace `stepCountIs(20)` with manual step counting in tool loop
   - Replace `ModelMessage` with LangChain message classes
   - Replace `result.steps` iteration with manual tool call handling
   - Replace `result.text` with `response.content`
   - Replace `result.totalUsage` with `response.usage_metadata`

2. **`src/types.ts`** - Replace AI SDK types
   - `LanguageModel` -> `BaseChatModel`
   - `ToolSet` -> LangChain tool types (`StructuredToolInterface[]` or custom)
   - `DeepFactorAgentSettings.model` type change

3. **`src/context-manager.ts`** - Replace `generateText` for summarization
   - Use `model.invoke()` instead

### Medium-Impact Changes

4. **`src/middleware.ts`** - Tool format change
   - Convert `ToolSet` tools to LangChain `tool()` format
   - `todoMiddleware` and `errorRecoveryMiddleware` tool definitions

5. **`src/human-in-the-loop.ts`** - Tool format change
   - Convert `requestHumanInput` to LangChain tool format

6. **`src/create-agent.ts`** - Type updates
   - Update generic constraints from `ToolSet` to LangChain types

### Low-Impact Changes

7. **`src/index.ts`** - Re-export updates
8. **`package.json`** - Dependency swap
9. **`README.md`** - Documentation updates
10. **Test files** - All tests need updating for new types/APIs

### Breaking Changes for End Users
- `model` parameter changes from `LanguageModel | string` to `BaseChatModel | string`
- With `initChatModel`, string model IDs become supported natively
- Tool definition format changes (if we change the public API)
- Import changes for provider packages (`@langchain/anthropic` instead of `@ai-sdk/anthropic`)

---

## Key Advantages of `initChatModel`

1. **Universal model initialization** - One function for all providers
2. **String-based model selection** - `"anthropic:claude-sonnet-4-5"` instead of importing provider packages
3. **Runtime provider switching** - Change models without code changes
4. **Configurable fields** - Make model/provider/apiKey configurable at runtime
5. **Consistent API** - All models implement `BaseChatModel` with `.invoke()`, `.stream()`, `.bindTools()`, `.withStructuredOutput()`

## Key Risks

1. **Significant rewrite** - Almost every source file needs changes
2. **Different tool loop model** - AI SDK handles multi-step tool calling automatically; LangChain requires manual loop
3. **Different message format** - Class-based messages vs plain objects
4. **Token usage tracking** - Different format (`usage_metadata` vs `totalUsage`)
5. **Streaming differences** - `AIMessageChunk` vs AI SDK stream chunks
6. **Test rewrite** - All tests use AI SDK mocking patterns

---

## Alternative: Hybrid Approach

Instead of a full migration, consider wrapping `initChatModel` to produce an AI SDK-compatible `LanguageModel`:
- Use `initChatModel` for model initialization only
- Create an adapter that wraps `BaseChatModel` to match `LanguageModel` interface
- Keep the rest of the codebase using AI SDK patterns

This would give the universal initialization benefit while minimizing rewrite scope.

---

## References

- [initChatModel API Docs](https://v03.api.js.langchain.com/functions/langchain.chat_models_universal.initChatModel.html)
- [LangChain Universal Model Init How-To](https://docs.langchain.com/oss/javascript/langchain/models)
- [LangChain Changelog - Initialize any model in one line](https://changelog.langchain.com/announcements/initialize-any-model-in-one-line-of-code)
- [LangChain BaseChatModel Reference](https://reference.langchain.com/javascript/classes/_langchain_core.language_models_chat_models.BaseChatModel.html)
- [LangChain Tool Calling Blog](https://blog.langchain.com/tool-calling-with-langchain/)
- [LangChain Agents Docs](https://docs.langchain.com/oss/javascript/langchain/agents)
- [data-enrichment-js initChatModel example](https://github.com/langchain-ai/data-enrichment-js/blob/main/src/enrichment_agent/utils.ts)
- [LangGraph createReactAgent](https://langchain-ai.github.io/langgraphjs/how-tos/create-react-agent/)
