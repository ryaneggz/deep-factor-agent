/**
 * 09-thread-inspection.ts — Thread Retention & Inspection
 *
 * Demonstrates the thread retention fix from commits edc4279 & d39ea04.
 * The agent runs a multi-step tool workflow, and we inspect the full
 * thread to verify that all events (messages, tool_calls, tool_results,
 * completion) are properly retained.
 *
 * Also shows how to use serializeThreadToXml to export threads.
 */
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { createDeepFactorAgent, maxIterations, serializeThreadToXml } from "../dist/index.js";
import { MODEL_ID } from "./env.js";

// Two tools so the agent makes multiple calls
const searchDocs = tool(
  async ({ query }: { query: string }) => {
    return JSON.stringify({
      results: [{ title: `Guide to ${query}`, url: `https://docs.example.com/${query}` }],
    });
  },
  {
    name: "search_docs",
    description: "Search the documentation",
    schema: z.object({
      query: z.string().describe("Search query"),
    }),
  },
);

const summarize = tool(
  async ({ text }: { text: string }) => {
    return `Summary: ${text.substring(0, 80)}...`;
  },
  {
    name: "summarize",
    description: "Summarize a piece of text",
    schema: z.object({
      text: z.string().describe("Text to summarize"),
    }),
  },
);

async function main() {
  const agent = createDeepFactorAgent({
    model: MODEL_ID,
    tools: [searchDocs, summarize],
    instructions:
      "You are a research assistant. Search for docs, then summarize what you find. Be concise.",
    middleware: [],
    stopWhen: maxIterations(3),
  });

  console.log("--- Running agent with thread inspection ---\n");

  const result = await agent.loop("Find documentation about TypeScript generics and summarize it.");

  // --- Response ---
  console.log("Response:\n", result.response);
  console.log("\nStop reason:", result.stopReason);
  console.log("Iterations:", result.iterations);
  console.log("Tokens:", result.usage.totalTokens);

  // --- Thread event breakdown ---
  console.log("\n--- Thread Events ---\n");
  const eventCounts: Record<string, number> = {};
  for (const event of result.thread.events) {
    eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
  }
  console.log("Event counts:", eventCounts);

  console.log("\nEvent log:");
  for (const [i, event] of result.thread.events.entries()) {
    const iter = `iter=${event.iteration}`;
    switch (event.type) {
      case "message":
        console.log(
          `  [${i}] ${event.type} (${event.role}, ${iter}): ${event.content.substring(0, 60)}...`,
        );
        break;
      case "tool_call":
        console.log(
          `  [${i}] ${event.type} (${iter}): ${event.toolName}(${JSON.stringify(event.args)})`,
        );
        break;
      case "tool_result":
        console.log(
          `  [${i}] ${event.type} (${iter}): ${String(event.result).substring(0, 60)}...`,
        );
        break;
      case "completion":
        console.log(`  [${i}] ${event.type} (${iter}): verified=${event.verified}`);
        break;
      default:
        console.log(`  [${i}] ${event.type} (${iter})`);
    }
  }

  // --- XML export ---
  console.log("\n--- XML Export ---\n");
  console.log(serializeThreadToXml(result.thread.events));
}

main().catch(console.error);
