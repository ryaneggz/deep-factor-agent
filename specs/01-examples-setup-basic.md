# SPEC-01: Examples Directory Setup & Basic Examples

## CONTEXT

The deep-factor-agent library is fully implemented but has no runnable examples. Users need practical, standalone scripts that demonstrate how to use the library. This spec covers the examples directory scaffolding and three basic examples that introduce the core API.

### DEPENDENCIES
- None (first spec)

---

## ARCHITECTURE

### Directory Layout

```
examples/
  env.ts              # Shared environment setup
  README.md           # Documentation for all examples
  01-basic.ts         # Minimal agent (no tools)
  02-tools.ts         # Agent with LangChain tools
  03-streaming.ts     # Real-time streaming
```

### Root-Level Changes

```
.env.example          # Template for required env vars
package.json          # Add devDependencies: dotenv, tsx
```

### Design Decisions

1. **Import from `../dist/index.js`** -- Examples use the compiled output, matching how consumers import the published package.
2. **Shared `env.ts`** -- Single file for `dotenv` loading and `MODEL_ID` resolution. All examples import from here.
3. **`middleware: []`** -- Basic examples explicitly pass an empty middleware array to override defaults (todoMiddleware, errorRecoveryMiddleware). This keeps output clean and focused on the feature being demonstrated.
4. **Standalone execution** -- Each example runs independently via `npx tsx examples/XX-name.ts`.

---

## FILE SPECIFICATIONS

### 1. `.env.example`

Template file showing required environment variables.

```
# Required: API key for your model provider
OPENAI_API_KEY=your-api-key-here

# Optional: Override the default model (default: gpt-4o)
# MODEL_ID=gpt-4o
```

### 2. `package.json` changes

Add to `devDependencies`:

```json
{
  "devDependencies": {
    "dotenv": "^16.5.0",
    "tsx": "^4.19.0",
    "@langchain/openai": "^0.5.0"
  }
}
```

> `dotenv` for env loading, `tsx` for running TypeScript directly, `@langchain/openai` as the default provider for examples.

### 3. `examples/env.ts`

Shared environment configuration module.

```ts
import "dotenv/config";

// Default model if MODEL_ID env var is not set
export const MODEL_ID = process.env.MODEL_ID ?? "gpt-4o";

// Validate that at least one provider key is present
const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
const hasGoogleKey = !!process.env.GOOGLE_API_KEY;

if (!hasOpenAIKey && !hasAnthropicKey && !hasGoogleKey) {
  console.error(
    "Error: No API key found. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY in your .env file.",
  );
  process.exit(1);
}

console.log(`Using model: ${MODEL_ID}\n`);
```

**Key behaviors:**
- Loads `.env` via `dotenv/config` side-effect import
- Exports `MODEL_ID` (defaults to `gpt-4o`)
- Validates that at least one provider API key is set
- Prints the active model on startup

### 4. `examples/README.md`

```markdown
# deep-factor-agent Examples

Runnable TypeScript examples demonstrating the deep-factor-agent library.

## Prerequisites

1. Build the library first:
   ```bash
   pnpm build
   ```

2. Install dev dependencies (if not already):
   ```bash
   pnpm install
   ```

3. Create a `.env` file in the project root (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

4. Add your API key to `.env`:
   ```
   OPENAI_API_KEY=sk-...
   ```

## Running Examples

Each example is standalone. Run with `npx tsx`:

```bash
# Basic agent (no tools)
npx tsx examples/01-basic.ts

# Agent with tools
npx tsx examples/02-tools.ts

# Streaming output
npx tsx examples/03-streaming.ts

# Stop conditions & cost tracking
npx tsx examples/04-stop-conditions.ts

# Custom middleware
npx tsx examples/05-middleware.ts

# Human-in-the-loop
npx tsx examples/06-human-in-the-loop.ts

# Verification & self-correction
npx tsx examples/07-verification.ts
```

## Configuration

Set `MODEL_ID` in your `.env` to use a different model:

```
MODEL_ID=claude-sonnet-4-5
ANTHROPIC_API_KEY=sk-ant-...
```

Supported models include any model supported by LangChain's `initChatModel`:
- `gpt-4o`, `gpt-4o-mini` (OpenAI)
- `claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-opus-4-5` (Anthropic)
- `gemini-2.5-pro`, `gemini-2.5-flash` (Google)

## Example Overview

| # | File | Feature |
|---|------|---------|
| 01 | `01-basic.ts` | Minimal agent: model + prompt, no tools |
| 02 | `02-tools.ts` | Agent with LangChain tools (calculator, weather) |
| 03 | `03-streaming.ts` | Real-time streaming via `agent.stream()` |
| 04 | `04-stop-conditions.ts` | Stop conditions (maxIterations, maxCost, maxTokens) |
| 05 | `05-middleware.ts` | Custom middleware (logging, timing, tool-providing) |
| 06 | `06-human-in-the-loop.ts` | Pause/resume with simulated human input |
| 07 | `07-verification.ts` | Verification with structural checks and self-correction |
```

### 5. `examples/01-basic.ts` -- Minimal Agent

Demonstrates the simplest possible agent: a model, a prompt, and a result.

```ts
/**
 * 01-basic.ts — Minimal deep-factor-agent
 *
 * Creates an agent with just a model and runs a single prompt.
 * No tools, no middleware, no stop conditions beyond the default.
 */
import { createDeepFactorAgent } from "../dist/index.js";
import { MODEL_ID } from "./env.js";

async function main() {
  const agent = createDeepFactorAgent({
    model: MODEL_ID,
    instructions: "You are a helpful assistant. Be concise.",
    middleware: [],
  });

  console.log("--- Running basic agent ---\n");

  const result = await agent.loop(
    "What are the three laws of robotics? List them briefly.",
  );

  console.log("Response:\n", result.response);
  console.log("\n--- Result Summary ---");
  console.log("Iterations:", result.iterations);
  console.log("Stop reason:", result.stopReason);
  console.log("Tokens used:", result.usage.totalTokens);
}

main().catch(console.error);
```

**Key behaviors:**
- `createDeepFactorAgent` with string model ID (resolved via `initChatModel`)
- `middleware: []` overrides defaults for clean output
- `agent.loop(prompt)` runs and returns `AgentResult`
- Prints response and summary

### 6. `examples/02-tools.ts` -- Agent With Tools

Demonstrates tool usage with LangChain's `tool()` factory and Zod schemas.

```ts
/**
 * 02-tools.ts — Agent with LangChain tools
 *
 * Defines two tools (calculator and weather lookup) and lets the
 * agent decide which to call based on the user prompt.
 */
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { createDeepFactorAgent } from "../dist/index.js";
import { MODEL_ID } from "./env.js";

// Tool 1: Calculator
const calculator = tool(
  async ({ expression }: { expression: string }) => {
    try {
      // Simple eval for demo purposes — use a real math parser in production
      const result = Function(`"use strict"; return (${expression})`)();
      return `Result: ${result}`;
    } catch {
      return `Error: Could not evaluate "${expression}"`;
    }
  },
  {
    name: "calculator",
    description: "Evaluate a mathematical expression. Example: '2 + 2', 'Math.sqrt(144)'",
    schema: z.object({
      expression: z.string().describe("The math expression to evaluate"),
    }),
  },
);

// Tool 2: Weather (mock)
const getWeather = tool(
  async ({ city }: { city: string }) => {
    // Simulated weather data
    const forecasts: Record<string, string> = {
      "new york": "72°F, Partly Cloudy",
      london: "58°F, Rainy",
      tokyo: "80°F, Sunny",
    };
    const weather = forecasts[city.toLowerCase()] ?? "65°F, Clear skies";
    return `Weather in ${city}: ${weather}`;
  },
  {
    name: "get_weather",
    description: "Get the current weather for a city",
    schema: z.object({
      city: z.string().describe("The city name"),
    }),
  },
);

async function main() {
  const agent = createDeepFactorAgent({
    model: MODEL_ID,
    tools: [calculator, getWeather],
    instructions:
      "You are a helpful assistant with access to a calculator and weather lookup. Use the tools when appropriate.",
    middleware: [],
  });

  console.log("--- Running agent with tools ---\n");

  const result = await agent.loop(
    "What is 47 * 89? Also, what's the weather like in Tokyo?",
  );

  console.log("Response:\n", result.response);
  console.log("\n--- Result Summary ---");
  console.log("Iterations:", result.iterations);
  console.log("Stop reason:", result.stopReason);
  console.log("Tokens used:", result.usage.totalTokens);

  // Show tool calls from the thread events
  const toolCalls = result.thread.events.filter((e) => e.type === "tool_call");
  console.log("Tool calls made:", toolCalls.length);
  for (const tc of toolCalls) {
    if (tc.type === "tool_call") {
      console.log(`  - ${tc.toolName}(${JSON.stringify(tc.args)})`);
    }
  }
}

main().catch(console.error);
```

**Key behaviors:**
- Tools defined using `tool()` from `@langchain/core/tools` with Zod schemas
- Agent receives tools array and uses them to answer the prompt
- Thread events inspected to show which tools were called

### 7. `examples/03-streaming.ts` -- Streaming Output

Demonstrates real-time streaming via `agent.stream()`.

```ts
/**
 * 03-streaming.ts — Streaming agent output
 *
 * Uses agent.stream() to receive tokens as they arrive,
 * printing them in real time.
 */
import { createDeepFactorAgent } from "../dist/index.js";
import { MODEL_ID } from "./env.js";

async function main() {
  const agent = createDeepFactorAgent({
    model: MODEL_ID,
    instructions: "You are a creative storyteller. Write vivid, engaging prose.",
    middleware: [],
  });

  console.log("--- Streaming agent output ---\n");

  const stream = await agent.stream(
    "Write a short (3 paragraph) story about a robot learning to paint.",
  );

  for await (const chunk of stream) {
    // Each chunk is an AIMessageChunk; extract text content
    const text =
      typeof chunk.content === "string"
        ? chunk.content
        : Array.isArray(chunk.content)
          ? chunk.content
              .filter((b: any) => b.type === "text")
              .map((b: any) => b.text)
              .join("")
          : "";
    if (text) {
      process.stdout.write(text);
    }
  }

  console.log("\n\n--- Stream complete ---");
}

main().catch(console.error);
```

**Key behaviors:**
- `agent.stream(prompt)` returns `AsyncIterable<AIMessageChunk>`
- Chunks are printed incrementally via `process.stdout.write`
- Handles both string and structured content formats

---

## ACCEPTANCE CRITERIA

- [ ] `.env.example` exists at project root with `OPENAI_API_KEY` and `MODEL_ID` placeholders
- [ ] `package.json` has `dotenv`, `tsx`, and `@langchain/openai` in `devDependencies`
- [ ] `examples/env.ts` loads dotenv, exports `MODEL_ID`, validates API keys, prints active model
- [ ] `examples/README.md` documents prerequisites, setup, running instructions, and example overview
- [ ] `examples/01-basic.ts` creates an agent with string model, runs `loop()`, prints result summary
- [ ] `examples/02-tools.ts` defines 2 tools with `tool()` + Zod, agent calls them, thread events show tool usage
- [ ] `examples/03-streaming.ts` uses `agent.stream()`, prints tokens incrementally
- [ ] All examples import from `../dist/index.js` (not `../src/`)
- [ ] All examples import `MODEL_ID` from `./env.js`
- [ ] All basic examples pass `middleware: []` to override defaults
- [ ] After `pnpm build && pnpm install`, each example runs successfully: `npx tsx examples/0X-*.ts`
- [ ] Each example prints descriptive console output including an AgentResult or stream summary
