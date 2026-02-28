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
    const hirEvents = result.thread.events.filter((e) => e.type === "human_input_requested");
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
