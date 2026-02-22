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
