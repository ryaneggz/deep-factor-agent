/**
 * 14-claude-codex-delegation.ts — CLI Provider Delegation Demo
 *
 * Demonstrates using external CLI tools (Claude CLI or Codex CLI) as
 * model providers via the ModelAdapter interface. The agent loop handles
 * tool calling through prompt engineering — tool definitions are injected
 * into the prompt, and tool calls are parsed from JSON code blocks in the
 * CLI response.
 *
 * This is a non-interactive, single-shot example. Token usage will show
 * zeros since CLI providers don't expose usage_metadata.
 *
 * Usage:
 *   npx tsx examples/14-claude-codex-delegation.ts
 *   npx tsx examples/14-claude-codex-delegation.ts --provider codex
 */
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import {
  createDeepFactorAgent,
  createClaudeCliProvider,
  createCodexCliProvider,
  maxIterations,
} from "../dist/index.js";
import type { AgentEvent } from "../dist/index.js";

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const providerIndex = args.indexOf("--provider");
const providerName =
  providerIndex >= 0 && args[providerIndex + 1]
    ? args[providerIndex + 1]
    : "claude";

if (providerName !== "claude" && providerName !== "codex") {
  console.error(
    `Error: Invalid provider "${providerName}". Must be "claude" or "codex".`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Create CLI provider
// ---------------------------------------------------------------------------

const provider =
  providerName === "claude"
    ? createClaudeCliProvider({ model: "sonnet" })
    : createCodexCliProvider({ model: "o4-mini" });

console.log(`\n--- Example 14: CLI Provider Delegation (${providerName}) ---\n`);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const calculatorTool = tool(
  async ({ expression }: { expression: string }) => {
    try {
      // Safe-ish math evaluation for demo purposes
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

const tools = [calculatorTool, getCurrentTimeTool] as const;

// ---------------------------------------------------------------------------
// Create and run agent
// ---------------------------------------------------------------------------

async function main() {
  const agent = createDeepFactorAgent({
    model: provider,
    tools: [...tools],
    instructions: [
      "You are a helpful assistant with access to a calculator tool and a get_current_time tool.",
      "When the user asks a question that requires calculation, use the calculator tool.",
      "When asked about the time or date, use the get_current_time tool.",
      "Always use the tools when they are relevant to the question.",
    ].join(" "),
    stopWhen: [maxIterations(3)],
    middleware: [],
  });

  const prompt =
    "What is 42 * 17 + 3? Also, what is the current date and time?";
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
  const toolCalls = result.thread.events.filter(
    (e: AgentEvent) => e.type === "tool_call",
  );
  const toolResults = result.thread.events.filter(
    (e: AgentEvent) => e.type === "tool_result",
  );

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

  // Token usage (will be zeros for CLI providers — expected)
  console.log(`\nToken usage:`);
  console.log(`  Input:  ${result.usage.inputTokens}`);
  console.log(`  Output: ${result.usage.outputTokens}`);
  console.log(`  Total:  ${result.usage.totalTokens}`);
  if (result.usage.inputTokens === 0) {
    console.log(
      "  (Zeros expected — CLI providers don't expose usage_metadata)",
    );
  }
}

main().catch(console.error);
