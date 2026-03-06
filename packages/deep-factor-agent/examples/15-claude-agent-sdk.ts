/**
 * 15-claude-agent-sdk.ts — Claude Agent SDK Provider Demo
 *
 * Demonstrates using the Claude Agent SDK as a model provider via the
 * ModelAdapter interface. The SDK provides a higher-level agent runtime
 * that handles tool execution natively, while deep-factor-agent manages
 * the outer loop, stop conditions, and middleware.
 *
 * Requires: ANTHROPIC_API_KEY in your .env file
 *
 * Usage:
 *   npx tsx examples/15-claude-agent-sdk.ts
 */
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import {
  createDeepFactorAgent,
  createClaudeAgentSdkProvider,
  maxIterations,
} from "../dist/index.js";
import type { AgentEvent } from "../dist/index.js";

// ---------------------------------------------------------------------------
// Env setup (inline — SDK only needs ANTHROPIC_API_KEY)
// ---------------------------------------------------------------------------

import { config } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const globalEnv = resolve(homedir(), ".deep-factor", ".env");
const localEnv = resolve(process.cwd(), ".env");
config({ path: existsSync(globalEnv) ? globalEnv : localEnv });

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY is required. Set it in your .env file.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Create Claude Agent SDK provider
// ---------------------------------------------------------------------------

const provider = createClaudeAgentSdkProvider({
  model: "claude-sonnet-4-5",
  maxTurns: 1,
});

console.log("\n--- Example 15: Claude Agent SDK Provider ---\n");

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const calculatorTool = tool(
  async ({ expression }: { expression: string }) => {
    try {
      const result = new Function(`"use strict"; return (${expression})`)();
      return String(result);
    } catch (err: any) {
      return `Error evaluating expression: ${err.message}`;
    }
  },
  {
    name: "calculator",
    description:
      "Evaluate a mathematical expression and return the result. Supports basic arithmetic (+, -, *, /, **, %).",
    schema: z.object({
      expression: z
        .string()
        .describe("The mathematical expression to evaluate (e.g. '2 + 2', '3 ** 4')"),
    }),
  },
);

const getCurrentTimeTool = tool(
  async () => {
    return new Date().toISOString();
  },
  {
    name: "get_current_time",
    description: "Get the current date and time in ISO 8601 format.",
    schema: z.object({}),
  },
);

const tools = [calculatorTool, getCurrentTimeTool];

// ---------------------------------------------------------------------------
// Create and run agent
// ---------------------------------------------------------------------------

async function main() {
  const agent = createDeepFactorAgent({
    model: provider,
    tools,
    instructions: [
      "You are a helpful assistant with access to a calculator tool and a get_current_time tool.",
      "When the user asks a question that requires calculation, use the calculator tool.",
      "When asked about the time or date, use the get_current_time tool.",
      "Always use the tools when they are relevant to the question.",
    ].join(" "),
    stopWhen: [maxIterations(5)],
    middleware: [],
  });

  const prompt = "What is 42 * 17 + 3? Also, what is the current date and time?";
  console.log(`Prompt: ${prompt}\n`);

  const result = await agent.loop(prompt);

  // Display results
  console.log("--- Result ---\n");
  console.log(`Response: ${result.response}`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Stop reason: ${result.stopReason}`);
  if (result.stopDetail) {
    console.log(`Stop detail: ${result.stopDetail}`);
  }

  // Display events
  const toolCalls = result.thread.events.filter((e: AgentEvent) => e.type === "tool_call");
  const toolResults = result.thread.events.filter((e: AgentEvent) => e.type === "tool_result");

  console.log(`\nTool calls: ${toolCalls.length}`);
  for (const tc of toolCalls) {
    if (tc.type === "tool_call") {
      console.log(`  - ${tc.toolName}(${JSON.stringify(tc.args)})`);
    }
  }

  console.log(`Tool results: ${toolResults.length}`);
  for (const tr of toolResults) {
    if (tr.type === "tool_result") {
      console.log(`  - ${tr.result}`);
    }
  }

  const errors = result.thread.events.filter((e: AgentEvent) => e.type === "error");
  if (errors.length > 0) {
    console.log(`\nErrors: ${errors.length}`);
    for (const err of errors) {
      if (err.type === "error") {
        console.log(`  - [iter ${err.iteration}] ${err.error}`);
      }
    }
  }

  // Token usage
  console.log(`\nToken usage:`);
  console.log(`  Input:  ${result.usage.inputTokens}`);
  console.log(`  Output: ${result.usage.outputTokens}`);
  console.log(`  Total:  ${result.usage.totalTokens}`);
}

main().catch(console.error);
