/**
 * 07-verification.ts — Verification & self-correction
 *
 * Uses verifyCompletion to validate that the agent's response
 * contains valid JSON with a specific structure. The agent
 * self-corrects when verification fails.
 */
import { createDeepFactorAgent, maxIterations } from "../dist/index.js";
import type { VerifyContext, VerifyResult } from "../dist/index.js";
import { MODEL_ID } from "./env.js";

// Verification function that checks for valid JSON with required fields
async function verifyJsonResponse(ctx: VerifyContext): Promise<VerifyResult> {
  console.log(`  [verify] Checking iteration ${ctx.iteration}...`);

  // Try to extract JSON from the response
  const jsonMatch =
    ctx.result.match(/```json\s*([\s\S]*?)```/) ?? ctx.result.match(/(\{[\s\S]*\})/);

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
    const missingFields = requiredFields.filter((f) => !(f in data));

    if (missingFields.length > 0) {
      console.log(`  [verify] FAIL — Missing fields: ${missingFields.join(", ")}`);
      return {
        complete: false,
        reason:
          `JSON is missing required fields: ${missingFields.join(", ")}. ` +
          `Required fields are: ${requiredFields.join(", ")}.`,
      };
    }

    if (!Array.isArray(data.ingredients) || data.ingredients.length === 0) {
      console.log("  [verify] FAIL — ingredients must be a non-empty array");
      return {
        complete: false,
        reason: "The 'ingredients' field must be a non-empty array of strings.",
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
      reason:
        `Response contains invalid JSON: ${(e as Error).message}. ` +
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

  const result = await agent.loop("Give me a recipe for chocolate chip cookies.");

  console.log("\nFinal response:\n", result.response);
  console.log("\n--- Result Summary ---");
  console.log("Iterations:", result.iterations);
  console.log("Stop reason:", result.stopReason);
  console.log("Tokens used:", result.usage.totalTokens);

  // Check if verification passed (completed vs stop_condition)
  if (result.stopReason === "completed") {
    console.log("Verification: PASSED");
  } else if (result.stopReason === "stop_condition") {
    console.log("Verification: Did not pass within iteration limit");
    console.log("Stop detail:", result.stopDetail);
  }

  // Show iteration history
  const messageEvents = result.thread.events.filter((e) => e.type === "message");
  console.log(
    `\nThread contains ${messageEvents.length} message events across ${result.iterations} iteration(s)`,
  );
}

main().catch(console.error);
