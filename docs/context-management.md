# Context Management

The agent automatically manages context window usage through summarization when conversations grow long.

## How It Works

1. After each iteration, the `ContextManager` estimates total token usage across all thread events
2. If tokens exceed `maxContextTokens` (default: 150,000), summarization triggers
3. Older iterations are summarized into a compact markdown block
4. The most recent `keepRecentIterations` (default: 3) are preserved in full
5. Summaries are injected into the system prompt on subsequent iterations

## Configuration

```typescript
const agent = createDeepFactorAgent({
  model: "openai:gpt-4.1-mini",
  contextManagement: {
    maxContextTokens: 150_000, // trigger threshold
    keepRecentIterations: 3, // iterations preserved in full
    tokenEstimator: (text) => {
      // custom token counter
      return Math.ceil(text.length / 3.5);
    },
  },
});
```

## Token Estimation

The default estimator uses `Math.ceil(text.length / 3.5)` — a rough heuristic. For more accurate counting, provide a custom `tokenEstimator` using a proper tokenizer (e.g., `tiktoken`).

## Context Modes

The `contextMode` setting controls how messages are formatted for the model:

### Standard Mode (default)

Messages are passed as individual LangChain message objects (`HumanMessage`, `AIMessage`, `ToolMessage`). This is the standard approach for most LangChain-compatible models.

### XML Mode

The entire thread is serialized into a `<thread>` XML document:

```xml
<thread>
  <event type="human" iteration="1">What files exist?</event>
  <event type="tool_input" name="bash" iteration="1">{"command":"ls"}</event>
  <event type="tool_output" name="bash" status="success" duration_ms="50" iteration="1">file1.ts file2.ts</event>
  <event type="ai" iteration="1">There are two TypeScript files.</event>
</thread>
```

XML mode can improve long-context coherence with some models by presenting the full conversation as a structured document rather than a flat message list.

**Configure:**

```typescript
const agent = createDeepFactorAgent({
  model: "openai:gpt-4.1-mini",
  contextMode: "xml",
});
```
