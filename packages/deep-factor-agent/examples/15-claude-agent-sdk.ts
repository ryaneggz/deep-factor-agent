/**
 * 15-claude-agent-sdk.ts
 *
 * Demonstrates using the Claude Agent SDK as a model provider via the
 * ModelAdapter interface.
 *
 * Requires:
 *   claude auth login
 *
 * Usage:
 *   pnpm -C packages/deep-factor-agent exec tsx examples/15-claude-agent-sdk.ts
 */
import { execSync } from "node:child_process";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentEvent } from "../dist/index.js";
import {
  createClaudeAgentSdkProvider,
  createDeepFactorAgent,
  maxIterations,
} from "../dist/index.js";

let isAuthed = false;
try {
  const status = JSON.parse(execSync("claude auth status", { encoding: "utf8", timeout: 5000 }));
  isAuthed = status.loggedIn === true;
} catch {
  isAuthed = false;
}

if (!isAuthed) {
  console.error("Error: Not authenticated. Run `claude auth login` first.");
  process.exit(1);
}

for (const key of [
  "CLAUDECODE",
  "CLAUDE_CODE_SSE_PORT",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_OAUTH_TOKEN",
]) {
  delete process.env[key];
}

const provider = createClaudeAgentSdkProvider({
  model: "claude-sonnet-4-6",
  maxTurns: 1,
});

const calculatorTool = tool(
  async ({ expression }: { expression: string }) => {
    try {
      const result = new Function(`"use strict"; return (${expression})`)();
      return String(result);
    } catch (error) {
      return `Error evaluating expression: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "calculator",
    description: "Evaluate a mathematical expression and return the result.",
    schema: z.object({
      expression: z.string().describe("Mathematical expression to evaluate"),
    }),
  },
);

const getCurrentTimeTool = tool(async () => new Date().toISOString(), {
  name: "get_current_time",
  description: "Get the current date and time in ISO 8601 format.",
  schema: z.object({}),
});

async function main() {
  const agent = createDeepFactorAgent({
    model: provider,
    tools: [calculatorTool, getCurrentTimeTool],
    instructions: [
      "You are a helpful assistant with access to a calculator tool and a time tool.",
      "Use the tools whenever the user asks for a calculation or the current time.",
    ].join(" "),
    stopWhen: [maxIterations(5)],
    middleware: [],
  });

  const prompt = "What is 42 * 17 + 3? Also, what is the current date and time?";
  console.log(`Prompt: ${prompt}\n`);

  const result = await agent.loop(prompt);

  console.log("Response:\n");
  console.log(result.response);
  console.log("");
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Stop reason: ${result.stopReason}`);
  if (result.stopDetail) {
    console.log(`Stop detail: ${result.stopDetail}`);
  }

  const toolCalls = result.thread.events.filter((event: AgentEvent) => event.type === "tool_call");
  const toolResults = result.thread.events.filter(
    (event: AgentEvent) => event.type === "tool_result",
  );

  console.log(`\nTool calls: ${toolCalls.length}`);
  for (const event of toolCalls) {
    if (event.type === "tool_call") {
      console.log(`  - ${event.toolName}(${JSON.stringify(event.args)})`);
    }
  }

  console.log(`Tool results: ${toolResults.length}`);
  for (const event of toolResults) {
    if (event.type === "tool_result") {
      console.log(`  - ${event.result}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
