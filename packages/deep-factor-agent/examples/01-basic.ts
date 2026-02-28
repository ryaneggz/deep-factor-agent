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

  const result = await agent.loop("What are the three laws of robotics? List them briefly.");

  console.log("Response:\n", result.response);
  console.log("\n--- Result Summary ---");
  console.log("Iterations:", result.iterations);
  console.log("Stop reason:", result.stopReason);
  console.log("Tokens used:", result.usage.totalTokens);
}

main().catch(console.error);
