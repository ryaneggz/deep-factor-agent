/**
 * 11-xml-tools-stream.ts — Multi-turn Streaming Chat with Bash Tool & XML Thread
 *
 * Like example 10, but the model has access to a bash tool. When the model
 * calls the tool, the tool call and result are recorded in the XML thread
 * and displayed inline. Text responses are streamed token-by-token.
 *
 * Usage:
 *   npx tsx examples/11-xml-tools-stream.ts
 *
 * Try prompts like:
 *   "List the files in the current directory"
 *   "What OS am I running?"
 *   "How much disk space is free?"
 *   "Show the first 5 lines of package.json"
 */
import { createInterface } from "node:readline/promises";
import { execSync } from "node:child_process";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { initChatModel } from "langchain/chat_models/universal";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentEvent, AgentThread } from "../dist/index.js";
import { serializeThreadToXml } from "../dist/index.js";
import { MODEL_ID } from "./env.js";

// ---------------------------------------------------------------------------
// Bash tool
// ---------------------------------------------------------------------------

const bashTool = tool(
  async ({ command }: { command: string }) => {
    try {
      return execSync(command, {
        encoding: "utf8",
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
        stderr: "pipe",
      });
    } catch (err: any) {
      return `Error: ${err.stderr || err.message}`;
    }
  },
  {
    name: "bash",
    description:
      "Execute a bash command and return its stdout. Use for file operations, system info, etc.",
    schema: z.object({
      command: z.string().describe("The bash command to execute"),
    }),
  },
);

const tools = [bashTool];

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
// Extract text from AIMessage content
// ---------------------------------------------------------------------------

function extractText(content: string | unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
  }
  return "";
}

// ---------------------------------------------------------------------------
// Inner tool loop: invoke model, execute tool calls, repeat until text reply
// ---------------------------------------------------------------------------

async function runToolLoop(
  model: any,
  messages: BaseMessage[],
  thread: AgentThread,
  turn: number,
): Promise<string> {
  const modelWithTools = model.bindTools(tools);

  while (true) {
    // Stream the model response, accumulating the full message
    const stream = await modelWithTools.stream(messages);
    let fullContent = "";
    let firstText = true;
    const toolCalls: any[] = [];

    for await (const chunk of stream) {
      // Accumulate text content and stream it to stdout
      const text = extractText(chunk.content);
      if (text) {
        if (firstText) {
          process.stdout.write("\nAssistant: ");
          firstText = false;
        }
        process.stdout.write(text);
        fullContent += text;
      }
      // Accumulate tool calls from chunks
      if (chunk.tool_call_chunks?.length) {
        for (const tc of chunk.tool_call_chunks) {
          if (tc.index !== undefined) {
            while (toolCalls.length <= tc.index) {
              toolCalls.push({ id: "", name: "", args: "" });
            }
            const entry = toolCalls[tc.index];
            if (tc.id) entry.id = tc.id;
            if (tc.name) entry.name = tc.name;
            if (tc.args) entry.args += tc.args;
          }
        }
      }
    }

    // No tool calls — the model gave a text reply, we're done
    if (toolCalls.length === 0) {
      if (fullContent) console.log();
      return fullContent;
    }

    // Build the full AIMessage with tool_calls for the message history
    const parsedToolCalls = toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: tc.args ? JSON.parse(tc.args) : {},
    }));
    const aiMsg = new AIMessage({
      content: fullContent,
      tool_calls: parsedToolCalls,
    });
    messages.push(aiMsg);

    // Execute each tool call
    for (const tc of parsedToolCalls) {
      const now = Date.now();

      // Record tool_call event
      pushEvent(thread, {
        type: "tool_call",
        toolName: tc.name,
        toolCallId: tc.id,
        args: tc.args,
        timestamp: now,
        iteration: turn,
      });

      console.log(`\n  [tool] bash: ${tc.args.command}`);

      // Execute
      const result = await bashTool.invoke(tc.args);
      const resultStr = typeof result === "string" ? result : JSON.stringify(result);
      const preview = resultStr.length > 200
        ? resultStr.substring(0, 200) + "..."
        : resultStr;
      console.log(`  [result] ${preview.replace(/\n/g, "\n           ")}`);

      // Record tool_result event
      pushEvent(thread, {
        type: "tool_result",
        toolCallId: tc.id,
        result: resultStr,
        timestamp: Date.now(),
        iteration: turn,
      });

      // Add to LangChain messages for next model call
      messages.push(
        new ToolMessage({ tool_call_id: tc.id, content: resultStr }),
      );
    }

    // Loop back so the model can respond to the tool results
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const model = await initChatModel(MODEL_ID);
  const thread = createThread();
  const instructions = [
    "You are a helpful assistant with access to a bash tool.",
    "Use the bash tool to answer questions about the system, files, etc.",
    "Keep your answers concise. Show relevant output from commands.",
  ].join(" ");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("SIGINT", () => {
    console.log("\n\nGoodbye!");
    printSummary(thread, turn);
    process.exit(0);
  });

  console.log("--- Multi-turn Streaming Chat with Bash Tool (XML context) ---");
  console.log('Type a message and press Enter. Type "quit" to exit.\n');

  let turn = 0;
  process.stdout.write("You: ");

  for await (const input of rl) {
    if (!input.trim() || input.trim().toLowerCase() === "quit") {
      console.log("\nGoodbye!");
      break;
    }

    turn++;

    // Record user message
    pushEvent(thread, {
      type: "message",
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
      iteration: turn,
    });

    // Build messages: system + XML thread
    const xml = serializeThreadToXml(thread.events);
    const messages: BaseMessage[] = [
      new SystemMessage(instructions),
      new HumanMessage(xml),
    ];

    // Run the tool loop (streams text, executes tools inline)
    const response = await runToolLoop(model, messages, thread, turn);

    // Record assistant response
    if (response) {
      pushEvent(thread, {
        type: "message",
        role: "assistant",
        content: response,
        timestamp: Date.now(),
        iteration: turn,
      });
    }

    console.log();

    // Show XML thread state
    console.log("--- XML Thread State (turn %d) ---\n", turn);
    console.log(serializeThreadToXml(thread.events));
    console.log();

    process.stdout.write("You: ");
  }

  printSummary(thread, turn);
  rl.close();
}

function printSummary(thread: AgentThread, turn: number) {
  console.log("\n--- Final Thread Summary ---");
  console.log("Total turns:", turn);
  console.log("Total events:", thread.events.length);

  const counts: Record<string, number> = {};
  for (const e of thread.events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  console.log("Event counts:", counts);
}

main().catch(console.error);
