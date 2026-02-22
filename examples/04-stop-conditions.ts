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
