/**
 * 03-streaming.ts — Streaming agent output
 *
 * Uses agent.stream() to receive tokens as they arrive,
 * printing them in real time.
 */
import { createDeepFactorAgent } from "../dist/index.js";
import { MODEL_ID } from "./env.js";

async function main() {
  const agent = createDeepFactorAgent({
    model: MODEL_ID,
    instructions: "You are a creative storyteller. Write vivid, engaging prose.",
    middleware: [],
  });

  console.log("--- Streaming agent output ---\n");

  const stream = await agent.stream(
    "Write a short (3 paragraph) story about a robot learning to paint.",
  );

  for await (const chunk of stream) {
    // Each chunk is an AIMessageChunk; extract text content
    const text =
      typeof chunk.content === "string"
        ? chunk.content
        : Array.isArray(chunk.content)
          ? chunk.content
              .filter((b: any) => b.type === "text")
              .map((b: any) => b.text)
              .join("")
          : "";
    if (text) {
      process.stdout.write(text);
    }
  }

  console.log("\n\n--- Stream complete ---");
}

main().catch(console.error);
