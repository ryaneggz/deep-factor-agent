/**
 * 10-xml-multi-turn-stream.ts — Multi-turn Streaming Chat with XML Thread
 *
 * Demonstrates using `serializeThreadToXml()` to maintain conversation
 * history across multiple user turns with streamed responses.
 *
 * Each turn:
 *   1. User types a message
 *   2. The full thread is serialized to XML
 *   3. The model streams a response token-by-token
 *   4. The response is appended to the thread for the next turn
 *
 * This shows the practical use case for XML thread serialization:
 * a single structured document carries the entire conversation context.
 *
 * Usage:
 *   npx tsx examples/10-xml-multi-turn-stream.ts
 *
 * Type your messages at the prompt. Type "quit" or Ctrl+C to exit.
 * After each turn the XML thread state is printed.
 */
import { createInterface } from "node:readline/promises";
import { initChatModel } from "langchain/chat_models/universal";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentEvent, AgentThread } from "../dist/index.js";
import { serializeThreadToXml } from "../dist/index.js";
import { MODEL_ID } from "./env.js";

// ---------------------------------------------------------------------------
// Thread helpers
// ---------------------------------------------------------------------------

function createThread(): AgentThread {
  const now = Date.now();
  return {
    id: `thread_${now}`,
    events: [],
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

function pushEvent(thread: AgentThread, event: AgentEvent) {
  thread.events.push(event);
  thread.updatedAt = Date.now();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const model = await initChatModel(MODEL_ID);
  const thread = createThread();
  const instructions =
    "You are a helpful, concise assistant. Keep answers short unless asked for detail.";

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Graceful Ctrl+C
  rl.on("SIGINT", () => {
    console.log("\n\nGoodbye!");
    printSummary(thread, turn);
    process.exit(0);
  });

  console.log("--- Multi-turn Streaming Chat (XML context) ---");
  console.log('Type a message and press Enter. Type "quit" to exit.\n');

  let turn = 0;
  process.stdout.write("You: ");

  for await (const input of rl) {
    if (!input.trim() || input.trim().toLowerCase() === "quit") {
      console.log("\nGoodbye!");
      break;
    }

    turn++;

    // 1. Record the user message in the thread
    pushEvent(thread, {
      type: "message",
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
      iteration: turn,
    });

    // 2. Serialize the full thread to XML
    const xml = serializeThreadToXml(thread.events);

    // 3. Build messages: system prompt + XML thread as context
    const messages = [
      new SystemMessage(instructions),
      new HumanMessage(xml),
    ];

    // 4. Stream the model response
    process.stdout.write("\nAssistant: ");
    let fullResponse = "";

    const stream = await model.stream(messages);
    for await (const chunk of stream) {
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
        fullResponse += text;
      }
    }
    console.log("\n");

    // 5. Record the assistant response in the thread
    pushEvent(thread, {
      type: "message",
      role: "assistant",
      content: fullResponse,
      timestamp: Date.now(),
      iteration: turn,
    });

    // 6. Show the XML thread state
    console.log("--- XML Thread State (turn %d) ---\n", turn);
    console.log(serializeThreadToXml(thread.events));
    console.log();

    // Print prompt for next turn
    process.stdout.write("You: ");
  }

  printSummary(thread, turn);
  rl.close();
}

function printSummary(thread: AgentThread, turn: number) {
  console.log("\n--- Final Thread Summary ---");
  console.log("Total turns:", turn);
  console.log("Total events:", thread.events.length);
  console.log(
    "Event types:",
    thread.events.map((e) => e.type).join(", "),
  );
}

main().catch(console.error);
