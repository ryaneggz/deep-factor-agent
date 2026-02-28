/**
 * 13-parallel-tool-calls.ts — Parallel Tool Calling with HITL
 *
 * Extends Example 12's interactive HITL + bash loop with parallel tool
 * execution. When the model returns multiple independent tool calls in a
 * single response, they run concurrently via Promise.all instead of
 * sequentially. HITL (requestHumanInput) calls are always handled
 * sequentially since they require interactive terminal input.
 *
 * Timing output shows wall-clock parallel time vs estimated sequential time
 * so you can see the concurrency benefit.
 *
 * Usage:
 *   npx tsx examples/13-parallel-tool-calls.ts
 *
 * Try prompts like:
 *   "Show me disk space, current directory listing, and system uptime"
 *   "What's my hostname, kernel version, and shell?"
 *   "Help me set up a project (will trigger HITL + bash in one turn)"
 */
import { createInterface } from "node:readline/promises";
import type { Interface as ReadlineInterface } from "node:readline/promises";
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { initChatModel } from "langchain/chat_models/universal";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentEvent, AgentThread } from "../dist/index.js";
import {
  serializeThreadToXml,
  requestHumanInput,
  TOOL_NAME_REQUEST_HUMAN_INPUT,
} from "../dist/index.js";
import { MODEL_ID } from "./env.js";

// ---------------------------------------------------------------------------
// Bash tool (identical to Example 12)
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

const tools = [bashTool, requestHumanInput];

// ---------------------------------------------------------------------------
// Thread helpers (identical to Example 12)
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
// Extract text from AIMessage content (identical to Example 12)
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
// collectHumanInput — parse tool result JSON, display choices, collect answer
// (identical to Example 12)
// ---------------------------------------------------------------------------

interface HitlResult {
  requested: boolean;
  question: string;
  context?: string;
  urgency?: string;
  format?: string;
  choices?: string[];
}

async function collectHumanInput(toolResultJson: string, rl: ReadlineInterface): Promise<string> {
  const parsed: HitlResult = JSON.parse(toolResultJson);

  // Display question
  console.log(`\n  [HITL] ${parsed.question}`);
  if (parsed.context) {
    console.log(`         Context: ${parsed.context}`);
  }

  // Display numbered choices if multiple_choice
  if (parsed.format === "multiple_choice" && parsed.choices?.length) {
    console.log();
    for (let i = 0; i < parsed.choices.length; i++) {
      console.log(`    ${i + 1}. ${parsed.choices[i]}`);
    }
    console.log();
  }

  // Prompt
  const prompt =
    parsed.format === "multiple_choice" && parsed.choices?.length
      ? "  Enter number or type your answer: "
      : "  Your answer: ";

  const answer = await rl.question(prompt);

  // Resolve numbered choice
  if (parsed.format === "multiple_choice" && parsed.choices?.length) {
    const num = parseInt(answer.trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= parsed.choices.length) {
      const chosen = parsed.choices[num - 1];
      console.log(`  [Selected: "${chosen}"]`);
      return chosen;
    }
  }

  // Free-text fallback
  return answer.trim();
}

// ---------------------------------------------------------------------------
// Parallel tool execution helper
// ---------------------------------------------------------------------------

interface ParallelResult {
  toolCallId: string;
  toolName: string;
  result: string;
  durationMs: number;
}

/**
 * Partition tool calls into parallel (non-HITL) and sequential (HITL) groups,
 * execute the parallel group concurrently via Promise.all, then handle HITL
 * calls one at a time. Records events and pushes ToolMessages for each call.
 */
async function executeToolsParallel(
  parsedToolCalls: { id: string; name: string; args: Record<string, any> }[],
  thread: AgentThread,
  turn: number,
  rl: ReadlineInterface,
  messages: BaseMessage[],
): Promise<void> {
  const hitlCalls: typeof parsedToolCalls = [];
  const parallelCalls: typeof parsedToolCalls = [];

  // Partition
  for (const tc of parsedToolCalls) {
    if (tc.name === TOOL_NAME_REQUEST_HUMAN_INPUT) {
      hitlCalls.push(tc);
    } else {
      parallelCalls.push(tc);
    }
  }

  // --- Execute parallel (non-HITL) calls concurrently ---
  if (parallelCalls.length > 0) {
    console.log(`\n  [parallel] Executing ${parallelCalls.length} tool call(s) concurrently...`);

    const batchStart = performance.now();

    const results: ParallelResult[] = await Promise.all(
      parallelCalls.map(async (tc) => {
        const callStart = performance.now();

        // Record tool_call event
        pushEvent(thread, {
          type: "tool_call",
          toolName: tc.name,
          toolCallId: tc.id,
          args: tc.args,
          timestamp: Date.now(),
          iteration: turn,
        });

        console.log(`  [tool] ${tc.name}: ${tc.args.command ?? JSON.stringify(tc.args)}`);

        const result = await bashTool.invoke(tc.args);
        const resultStr = typeof result === "string" ? result : JSON.stringify(result);
        const durationMs = performance.now() - callStart;

        return { toolCallId: tc.id, toolName: tc.name, result: resultStr, durationMs };
      }),
    );

    const batchDuration = performance.now() - batchStart;
    const sequentialEstimate = results.reduce((sum, r) => sum + r.durationMs, 0);

    // Record tool_result events and push ToolMessages (in order)
    for (const r of results) {
      const preview = r.result.length > 200 ? r.result.substring(0, 200) + "..." : r.result;
      console.log(
        `  [result] ${r.toolName} (${r.durationMs.toFixed(0)}ms): ${preview.replace(/\n/g, "\n           ")}`,
      );

      pushEvent(thread, {
        type: "tool_result",
        toolCallId: r.toolCallId,
        result: r.result,
        timestamp: Date.now(),
        iteration: turn,
      });

      messages.push(new ToolMessage({ tool_call_id: r.toolCallId, content: r.result }));
    }

    console.log(
      `  [timing] Parallel: ${batchDuration.toFixed(0)}ms | Sequential would be: ${sequentialEstimate.toFixed(0)}ms`,
    );
  }

  // --- Execute HITL calls sequentially ---
  for (const tc of hitlCalls) {
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

    const toolResult = await requestHumanInput.invoke(tc.args);
    const resultStr = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
    const hitlData = JSON.parse(resultStr);

    // Record human_input_requested
    pushEvent(thread, {
      type: "human_input_requested",
      question: hitlData.question ?? "",
      context: hitlData.context,
      urgency: hitlData.urgency,
      format: hitlData.format,
      choices: hitlData.choices,
      timestamp: now,
      iteration: turn,
    });

    // Collect input interactively
    const humanResponse = await collectHumanInput(resultStr, rl);

    // Record human_input_received
    pushEvent(thread, {
      type: "human_input_received",
      response: humanResponse,
      timestamp: Date.now(),
      iteration: turn,
    });

    // Feed response back to model
    messages.push(
      new ToolMessage({
        tool_call_id: tc.id,
        content: `Human responded: ${humanResponse}`,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Inner tool loop: invoke model, execute tool calls, repeat until text reply
// ---------------------------------------------------------------------------

async function runToolLoop(
  model: any,
  messages: BaseMessage[],
  thread: AgentThread,
  turn: number,
  rl: ReadlineInterface,
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

    // Execute tool calls in parallel (non-HITL) and sequentially (HITL)
    await executeToolsParallel(parsedToolCalls, thread, turn, rl, messages);

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
    "You are a helpful assistant with access to a bash tool and a requestHumanInput tool.",
    "Use the bash tool to answer questions about the system, files, etc.",
    "IMPORTANT: When you need to run multiple independent commands, call them ALL in a single response rather than one at a time.",
    "For example, if asked about disk space, uptime, and hostname, call bash three times in one response.",
    "When you need to ask the user a preference question or get a decision,",
    "use the requestHumanInput tool with format: 'multiple_choice' and provide",
    "a choices array with 2-5 options. For open-ended questions, use format: 'free_text'.",
    "Examples of when to use multiple_choice: choosing a programming language,",
    "selecting a file format, picking a color scheme, deciding between approaches.",
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

  console.log("--- Parallel Tool Calling with HITL (XML context) ---");
  console.log('Type a message and press Enter. Type "quit" to exit.');
  console.log("Independent tool calls execute in parallel for better performance.\n");

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
    const messages: BaseMessage[] = [new SystemMessage(instructions), new HumanMessage(xml)];

    // Run the tool loop (streams text, executes tools and HITL inline)
    const response = await runToolLoop(model, messages, thread, turn, rl);

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
