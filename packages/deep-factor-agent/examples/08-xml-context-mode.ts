/**
 * 08-xml-context-mode.ts — XML Thread Serialization
 *
 * Demonstrates the `contextMode: "xml"` feature from commit d39ea04.
 * Instead of converting each event to individual LangChain messages,
 * the entire thread is serialized into a single XML HumanMessage.
 *
 * Runs the same prompt in both modes and compares results.
 */
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import {
  createDeepFactorAgent,
  serializeThreadToXml,
} from "../dist/index.js";
import { MODEL_ID } from "./env.js";

// A simple tool so we can see tool_call/tool_result in the thread
const lookup = tool(
  async ({ topic }: { topic: string }) => {
    const facts: Record<string, string> = {
      mars: "Mars has two moons: Phobos and Deimos.",
      jupiter: "Jupiter is the largest planet in the solar system.",
    };
    return facts[topic.toLowerCase()] ?? `No data found for "${topic}".`;
  },
  {
    name: "fact_lookup",
    description: "Look up a fact about a topic",
    schema: z.object({
      topic: z.string().describe("The topic to look up"),
    }),
  },
);

const prompt = "Look up a fact about Mars and summarize it in one sentence.";

async function main() {
  // --- Standard mode ---
  console.log("=== Standard Context Mode ===\n");

  const standardAgent = createDeepFactorAgent({
    model: MODEL_ID,
    tools: [lookup],
    instructions: "You are a concise science assistant.",
    middleware: [],
    contextMode: "standard",
  });

  const standardResult = await standardAgent.loop(prompt);
  console.log("Response:", standardResult.response);
  console.log("Iterations:", standardResult.iterations);
  console.log("Tokens:", standardResult.usage.totalTokens);
  console.log(
    "Thread events:",
    standardResult.thread.events.map((e) => e.type).join(", "),
  );

  // --- XML mode ---
  console.log("\n=== XML Context Mode ===\n");

  const xmlAgent = createDeepFactorAgent({
    model: MODEL_ID,
    tools: [lookup],
    instructions: "You are a concise science assistant.",
    middleware: [],
    contextMode: "xml",
  });

  const xmlResult = await xmlAgent.loop(prompt);
  console.log("Response:", xmlResult.response);
  console.log("Iterations:", xmlResult.iterations);
  console.log("Tokens:", xmlResult.usage.totalTokens);
  console.log(
    "Thread events:",
    xmlResult.thread.events.map((e) => e.type).join(", "),
  );

  // --- Show the XML serialization ---
  console.log("\n=== XML Thread Serialization ===\n");
  const xml = serializeThreadToXml(xmlResult.thread.events);
  console.log(xml);
}

main().catch(console.error);
