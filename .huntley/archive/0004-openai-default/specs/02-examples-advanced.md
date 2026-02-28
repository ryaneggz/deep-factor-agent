# SPEC-02: Advanced Examples

## CONTEXT

With the basic examples and scaffolding from SPEC-01 in place, this spec adds four advanced examples that demonstrate the library's more powerful features: stop conditions with cost tracking, custom middleware, human-in-the-loop workflows, and verification with self-correction.

### DEPENDENCIES
- SPEC-01 (examples setup and basic examples)

---

## ARCHITECTURE

### Directory Layout (additions)

```
examples/
  04-stop-conditions.ts     # Multiple stop conditions + calculateCost
  05-middleware.ts           # Custom middleware (logging, timing, tool-providing)
  06-human-in-the-loop.ts   # Pause/resume with simulated human input
  07-verification.ts        # verifyCompletion with structural checks
```

### Design Decisions

1. **Stop conditions example shows multiple conditions** -- Combines `maxIterations`, `maxCost`, and `maxTokens` to demonstrate that the first triggered condition wins.
2. **Middleware example opts back into defaults** -- Unlike basic examples that use `middleware: []`, example 05 uses the default `todoMiddleware` and `errorRecoveryMiddleware` alongside a custom middleware, to show how they compose.
3. **Human-in-the-loop uses `requestHumanInput` tool** -- The agent is given the `requestHumanInput` tool and a prompt that requires asking for clarification. The `isPendingResult` type guard detects the pause, and `result.resume()` provides the simulated human response.
4. **Verification example uses `verifyCompletion` callback** -- Demonstrates structural validation (e.g., checking JSON format) and how the agent self-corrects when verification fails.

---

## FILE SPECIFICATIONS

### 1. `examples/04-stop-conditions.ts` -- Stop Conditions & Cost Tracking

Demonstrates configuring multiple stop conditions and using `calculateCost` to track spending.

```ts
/**
 * 04-stop-conditions.ts — Stop conditions & cost tracking
 *
 * Configures multiple stop conditions (maxIterations, maxCost, maxTokens)
 * and shows how calculateCost tracks spending per model.
 */
import {
  createDeepFactorAgent,
  maxIterations,
  maxCost,
  maxTokens,
  calculateCost,
} from "../dist/index.js";
import { MODEL_ID } from "./env.js";

async function main() {
  const agent = createDeepFactorAgent({
    model: MODEL_ID,
    instructions: "You are a helpful assistant. Be concise.",
    middleware: [],
    // Multiple stop conditions — the first one triggered wins
    stopWhen: [
      maxIterations(3),
      maxTokens(5000),
      maxCost(0.05), // $0.05 budget
    ],
  });

  console.log("--- Running agent with stop conditions ---\n");
  console.log("Configured limits:");
  console.log("  - Max iterations: 3");
  console.log("  - Max tokens: 5,000");
  console.log("  - Max cost: $0.05\n");

  const result = await agent.loop(
    "Explain the concept of recursion in programming. Give an example.",
  );

  console.log("Response:\n", result.response);
  console.log("\n--- Result Summary ---");
  console.log("Iterations:", result.iterations);
  console.log("Stop reason:", result.stopReason);
  console.log("Stop detail:", result.stopDetail ?? "(none)");
  console.log("Tokens used:", JSON.stringify(result.usage, null, 2));

  // Calculate and display cost
  const cost = calculateCost(result.usage, MODEL_ID);
  console.log(`Estimated cost: $${cost.toFixed(6)}`);
}

main().catch(console.error);
```

**Key behaviors:**
- `stopWhen` accepts an array of `StopCondition` factories
- All conditions are evaluated after each iteration; the first triggered wins
- `calculateCost(usage, modelId)` computes cost from the `MODEL_PRICING` table
- `stopDetail` contains the reason string from the triggered condition

### 2. `examples/05-middleware.ts` -- Custom Middleware

Demonstrates creating custom middleware and composing it with built-in middleware.

```ts
/**
 * 05-middleware.ts — Custom middleware
 *
 * Creates three custom middlewares (logging, timing, tool-providing)
 * and composes them alongside the built-in todoMiddleware and
 * errorRecoveryMiddleware.
 */
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import {
  createDeepFactorAgent,
  todoMiddleware,
  errorRecoveryMiddleware,
  maxIterations,
} from "../dist/index.js";
import type { AgentMiddleware } from "../dist/index.js";
import { MODEL_ID } from "./env.js";

// Custom middleware 1: Logging
function loggingMiddleware(): AgentMiddleware {
  return {
    name: "logging",
    beforeIteration: async (ctx) => {
      console.log(`  [log] Starting iteration ${ctx.iteration}`);
    },
    afterIteration: async (ctx, result) => {
      const eventCount = ctx.thread.events.filter(
        (e) => e.iteration === ctx.iteration,
      ).length;
      console.log(
        `  [log] Iteration ${ctx.iteration} complete — ${eventCount} events recorded`,
      );
    },
  };
}

// Custom middleware 2: Timing
function timingMiddleware(): AgentMiddleware {
  const startTimes = new Map<number, number>();

  return {
    name: "timing",
    beforeIteration: async (ctx) => {
      startTimes.set(ctx.iteration, Date.now());
    },
    afterIteration: async (ctx) => {
      const start = startTimes.get(ctx.iteration);
      if (start) {
        const elapsed = Date.now() - start;
        console.log(`  [timer] Iteration ${ctx.iteration} took ${elapsed}ms`);
        startTimes.delete(ctx.iteration);
      }
    },
  };
}

// Custom middleware 3: Tool-providing middleware
// Middleware can inject tools that get composed alongside user tools
function dateToolMiddleware(): AgentMiddleware {
  return {
    name: "dateTool",
    tools: [
      tool(
        async () => {
          return new Date().toISOString();
        },
        {
          name: "get_current_date",
          description: "Get the current date and time in ISO format",
          schema: z.object({}),
        },
      ),
    ],
  };
}

async function main() {
  const agent = createDeepFactorAgent({
    model: MODEL_ID,
    instructions:
      "You are a helpful assistant. You can check the current date if needed.",
    stopWhen: maxIterations(2),
    // Compose custom middleware with built-in middleware
    middleware: [
      loggingMiddleware(),
      timingMiddleware(),
      dateToolMiddleware(),
      todoMiddleware(),
      errorRecoveryMiddleware(),
    ],
  });

  console.log("--- Running agent with custom middleware ---\n");

  const result = await agent.loop(
    "What is today's date? Also create a short todo list for learning TypeScript.",
  );

  console.log("\nResponse:\n", result.response);
  console.log("\n--- Result Summary ---");
  console.log("Iterations:", result.iterations);
  console.log("Stop reason:", result.stopReason);
  console.log("Tokens used:", result.usage.totalTokens);

  // Show tool calls
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
- Custom middleware implements the `AgentMiddleware` interface with `beforeIteration` and/or `afterIteration` hooks
- `dateToolMiddleware` demonstrates middleware that provides tools via the `tools` array
- Built-in `todoMiddleware()` and `errorRecoveryMiddleware()` are explicitly included alongside custom middleware
- The `middleware` array order determines execution order for hooks

### 3. `examples/06-human-in-the-loop.ts` -- Human-in-the-Loop

Demonstrates the pause/resume workflow using `requestHumanInput` and `isPendingResult`.

```ts
/**
 * 06-human-in-the-loop.ts — Human-in-the-loop
 *
 * Uses the requestHumanInput tool to pause execution when the agent
 * needs human input. Demonstrates isPendingResult type guard and
 * result.resume() for continuing after input.
 */
import {
  createDeepFactorAgent,
  requestHumanInput,
  isPendingResult,
  maxIterations,
} from "../dist/index.js";
import { MODEL_ID } from "./env.js";

async function main() {
  const agent = createDeepFactorAgent({
    model: MODEL_ID,
    tools: [requestHumanInput],
    instructions: [
      "You are a travel planning assistant.",
      "Before making any recommendations, you MUST use the requestHumanInput tool to ask the user about their preferences.",
      "Ask about their budget range and preferred activities.",
    ].join(" "),
    middleware: [],
    stopWhen: maxIterations(5),
  });

  console.log("--- Running human-in-the-loop agent ---\n");

  let result = await agent.loop("Help me plan a weekend trip to Paris.");

  console.log("Agent response:", result.response);
  console.log("Stop reason:", result.stopReason);

  // Check if the agent is paused waiting for human input
  if (isPendingResult(result)) {
    // Find the question the agent asked
    const hirEvents = result.thread.events.filter(
      (e) => e.type === "human_input_requested",
    );
    const lastQuestion = hirEvents[hirEvents.length - 1];
    if (lastQuestion && lastQuestion.type === "human_input_requested") {
      console.log(`\nAgent asked: "${lastQuestion.question}"`);
    }

    // Simulate human response
    const humanResponse =
      "My budget is around $500 and I love visiting museums and trying local food.";
    console.log(`\nSimulated human response: "${humanResponse}"`);
    console.log("\nResuming agent...\n");

    // Resume the agent with the human's response
    result = await result.resume(humanResponse);

    console.log("Response after human input:\n", result.response);
    console.log("\n--- Final Result Summary ---");
    console.log("Iterations:", result.iterations);
    console.log("Stop reason:", result.stopReason);
    console.log("Tokens used:", result.usage.totalTokens);
  } else {
    console.log(
      "\n(Agent completed without requesting human input — this is unexpected for this example)",
    );
  }
}

main().catch(console.error);
```

**Key behaviors:**
- `requestHumanInput` is passed as a tool to the agent
- Agent instructions tell it to use the tool to ask for preferences
- `isPendingResult(result)` type guard checks if the agent is paused
- `result.resume(humanResponse)` continues execution with the human's input
- The resumed result may itself be another `PendingResult` (not demonstrated here but supported)

### 4. `examples/07-verification.ts` -- Verification & Self-Correction

Demonstrates `verifyCompletion` with structural validation that causes the agent to self-correct.

```ts
/**
 * 07-verification.ts — Verification & self-correction
 *
 * Uses verifyCompletion to validate that the agent's response
 * contains valid JSON with a specific structure. The agent
 * self-corrects when verification fails.
 */
import {
  createDeepFactorAgent,
  maxIterations,
} from "../dist/index.js";
import type { VerifyContext, VerifyResult } from "../dist/index.js";
import { MODEL_ID } from "./env.js";

// Verification function that checks for valid JSON with required fields
async function verifyJsonResponse(ctx: VerifyContext): Promise<VerifyResult> {
  console.log(`  [verify] Checking iteration ${ctx.iteration}...`);

  // Try to extract JSON from the response
  const jsonMatch = ctx.result.match(/```json\s*([\s\S]*?)```/) ??
    ctx.result.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    console.log("  [verify] FAIL — No JSON found in response");
    return {
      complete: false,
      reason:
        "Response must contain a JSON code block with the recipe data. " +
        "Wrap your JSON in ```json ... ``` markers.",
    };
  }

  try {
    const data = JSON.parse(jsonMatch[1]);

    // Validate required fields
    const requiredFields = ["name", "ingredients", "steps", "servings"];
    const missingFields = requiredFields.filter(
      (f) => !(f in data),
    );

    if (missingFields.length > 0) {
      console.log(
        `  [verify] FAIL — Missing fields: ${missingFields.join(", ")}`,
      );
      return {
        complete: false,
        reason: `JSON is missing required fields: ${missingFields.join(", ")}. ` +
          `Required fields are: ${requiredFields.join(", ")}.`,
      };
    }

    if (!Array.isArray(data.ingredients) || data.ingredients.length === 0) {
      console.log("  [verify] FAIL — ingredients must be a non-empty array");
      return {
        complete: false,
        reason:
          "The 'ingredients' field must be a non-empty array of strings.",
      };
    }

    if (!Array.isArray(data.steps) || data.steps.length === 0) {
      console.log("  [verify] FAIL — steps must be a non-empty array");
      return {
        complete: false,
        reason: "The 'steps' field must be a non-empty array of strings.",
      };
    }

    console.log("  [verify] PASS — Valid JSON with all required fields");
    return { complete: true };
  } catch (e) {
    console.log("  [verify] FAIL — Invalid JSON");
    return {
      complete: false,
      reason: `Response contains invalid JSON: ${(e as Error).message}. ` +
        "Please provide valid JSON in a ```json code block.",
    };
  }
}

async function main() {
  const agent = createDeepFactorAgent({
    model: MODEL_ID,
    instructions: [
      "You are a recipe assistant.",
      "When asked for a recipe, respond with ONLY a JSON code block (```json ... ```).",
      "The JSON must have these fields: name (string), ingredients (string[]), steps (string[]), servings (number).",
    ].join(" "),
    middleware: [],
    // Allow up to 3 iterations for self-correction
    stopWhen: maxIterations(3),
    // Verification callback validates structure
    verifyCompletion: verifyJsonResponse,
  });

  console.log("--- Running agent with verification ---\n");

  const result = await agent.loop(
    "Give me a recipe for chocolate chip cookies.",
  );

  console.log("\nFinal response:\n", result.response);
  console.log("\n--- Result Summary ---");
  console.log("Iterations:", result.iterations);
  console.log("Stop reason:", result.stopReason);
  console.log("Tokens used:", result.usage.totalTokens);

  // Check if verification passed (completed vs stop_condition)
  if (result.stopReason === "completed") {
    console.log("Verification: PASSED");
  } else if (result.stopReason === "stop_condition") {
    console.log(
      "Verification: Did not pass within iteration limit",
    );
    console.log("Stop detail:", result.stopDetail);
  }

  // Show iteration history
  const messageEvents = result.thread.events.filter(
    (e) => e.type === "message",
  );
  console.log(`\nThread contains ${messageEvents.length} message events across ${result.iterations} iteration(s)`);
}

main().catch(console.error);
```

**Key behaviors:**
- `verifyCompletion` is an async function receiving `VerifyContext` (result, iteration, thread, originalPrompt)
- Returns `{ complete: true }` to accept or `{ complete: false, reason: "..." }` to reject
- When verification fails, the reason is injected back into the thread as a user message
- The agent sees the feedback and self-corrects on the next iteration
- If `maxIterations` is reached before verification passes, `stopReason` is `"stop_condition"`
- If verification passes, `stopReason` is `"completed"`

---

## ACCEPTANCE CRITERIA

- [ ] `examples/04-stop-conditions.ts` configures `maxIterations`, `maxCost`, and `maxTokens` stop conditions
- [ ] `examples/04-stop-conditions.ts` uses `calculateCost()` to display estimated cost after execution
- [ ] `examples/04-stop-conditions.ts` prints `stopDetail` showing which condition triggered
- [ ] `examples/05-middleware.ts` defines custom logging, timing, and tool-providing middleware
- [ ] `examples/05-middleware.ts` composes custom middleware with `todoMiddleware()` and `errorRecoveryMiddleware()`
- [ ] `examples/05-middleware.ts` middleware hooks print during iteration execution
- [ ] `examples/05-middleware.ts` `dateToolMiddleware` provides a tool the agent can call
- [ ] `examples/06-human-in-the-loop.ts` uses `requestHumanInput` tool
- [ ] `examples/06-human-in-the-loop.ts` detects pause with `isPendingResult()` type guard
- [ ] `examples/06-human-in-the-loop.ts` resumes with `result.resume(humanResponse)` and gets final result
- [ ] `examples/07-verification.ts` defines a `verifyCompletion` function checking JSON structure
- [ ] `examples/07-verification.ts` verification failure injects feedback and triggers another iteration
- [ ] `examples/07-verification.ts` prints verification status (PASS/FAIL) during each iteration
- [ ] `examples/07-verification.ts` distinguishes `"completed"` vs `"stop_condition"` stop reasons
- [ ] All examples import from `../dist/index.js`
- [ ] All examples import `MODEL_ID` from `./env.js`
- [ ] After `pnpm build`, each example runs successfully: `npx tsx examples/0X-*.ts`
- [ ] Each example prints descriptive console output and a result summary
