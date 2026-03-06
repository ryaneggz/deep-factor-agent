import { describe, it, expect, vi, beforeEach } from "vitest";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createDeepFactorAgent } from "../src/create-agent.js";
import { maxIterations } from "../src/stop-conditions.js";
import type { SdkResponseMessage } from "../src/providers/claude-agent-sdk.js";

// --- Helpers to build mock SDK query() generators ---

async function* mockQueryGenerator(messages: unknown[]): AsyncGenerator<unknown> {
  for (const msg of messages) {
    yield msg;
  }
}

// --- Mock the SDK module ---
let mockQueryFn: (args: {
  prompt: string;
  options?: Record<string, unknown>;
}) => AsyncIterable<unknown>;

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  get query() {
    return mockQueryFn;
  },
}));

describe("End-to-end: createDeepFactorAgent with claude-agent-sdk provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("full round-trip: agent invokes SDK, processes tool call, re-invokes, collects result", async () => {
    // Import provider after mock is set up
    const { createClaudeAgentSdkProvider } = await import("../src/providers/claude-agent-sdk.js");

    const greetTool = tool(async (args: { name: string }) => `Hello, ${args.name}!`, {
      name: "greet",
      description: "Greet a person by name",
      schema: z.object({ name: z.string() }),
    });

    let callCount = 0;
    mockQueryFn = (_args) => {
      callCount++;
      if (callCount === 1) {
        // First invoke: model requests the greet tool
        const assistantMsg: SdkResponseMessage = {
          role: "assistant",
          content: [
            { type: "text", text: "Let me greet them." },
            {
              type: "tool_use",
              id: "call_greet_1",
              name: "greet",
              input: { name: "Alice" },
            },
          ],
          usage: { input_tokens: 50, output_tokens: 30 },
        };
        return mockQueryGenerator([assistantMsg]);
      }
      // Second invoke: model returns final text (no tool calls)
      const finalMsg: SdkResponseMessage = {
        role: "assistant",
        content: [{ type: "text", text: "I greeted Alice for you." }],
        usage: { input_tokens: 80, output_tokens: 20 },
      };
      return mockQueryGenerator([finalMsg]);
    };

    const provider = createClaudeAgentSdkProvider({ timeout: 5000 });
    const agent = createDeepFactorAgent({
      model: provider,
      tools: [greetTool],
      stopWhen: [maxIterations(5)],
      middleware: [],
    });

    const result = await agent.loop("Please greet Alice");

    expect(result.stopReason).toBe("completed");
    expect(result.response).toBe("I greeted Alice for you.");

    // Verify tool call and result events in thread
    const toolCalls = result.thread.events.filter((e) => e.type === "tool_call");
    const toolResults = result.thread.events.filter((e) => e.type === "tool_result");
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({
      type: "tool_call",
      toolName: "greet",
      args: { name: "Alice" },
    });
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].result).toBe("Hello, Alice!");

    // Verify usage aggregation
    expect(result.usage.inputTokens).toBe(130); // 50 + 80
    expect(result.usage.outputTokens).toBe(50); // 30 + 20
    expect(result.usage.totalTokens).toBe(180);

    // Verify SDK query() was called twice
    expect(callCount).toBe(2);
  });

  it("agent handles text-only SDK response (no tool calls)", async () => {
    const { createClaudeAgentSdkProvider } = await import("../src/providers/claude-agent-sdk.js");

    const assistantMsg: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "The answer is 42." }],
      usage: { input_tokens: 20, output_tokens: 10 },
    };
    mockQueryFn = () => mockQueryGenerator([assistantMsg]);

    const provider = createClaudeAgentSdkProvider({ timeout: 5000 });
    const agent = createDeepFactorAgent({
      model: provider,
      stopWhen: [maxIterations(3)],
      middleware: [],
    });

    const result = await agent.loop("What is the answer?");

    expect(result.stopReason).toBe("completed");
    expect(result.response).toBe("The answer is 42.");
    expect(result.iterations).toBe(1);

    // No tool calls should exist
    const toolCalls = result.thread.events.filter((e) => e.type === "tool_call");
    expect(toolCalls).toHaveLength(0);
  });

  it("agent processes multiple tool calls in sequence", async () => {
    const { createClaudeAgentSdkProvider } = await import("../src/providers/claude-agent-sdk.js");

    const addTool = tool(async (args: { a: number; b: number }) => String(args.a + args.b), {
      name: "add",
      description: "Add two numbers",
      schema: z.object({ a: z.number(), b: z.number() }),
    });

    let callCount = 0;
    mockQueryFn = () => {
      callCount++;
      if (callCount === 1) {
        // First: model requests two tool calls
        return mockQueryGenerator([
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "call_add_1",
                name: "add",
                input: { a: 2, b: 3 },
              },
            ],
            usage: { input_tokens: 30, output_tokens: 15 },
          } satisfies SdkResponseMessage,
        ]);
      }
      if (callCount === 2) {
        // Second: another tool call after first result
        return mockQueryGenerator([
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "call_add_2",
                name: "add",
                input: { a: 5, b: 10 },
              },
            ],
            usage: { input_tokens: 40, output_tokens: 15 },
          } satisfies SdkResponseMessage,
        ]);
      }
      // Third: final text response
      return mockQueryGenerator([
        {
          role: "assistant",
          content: [{ type: "text", text: "2+3=5 and 5+10=15" }],
          usage: { input_tokens: 50, output_tokens: 20 },
        } satisfies SdkResponseMessage,
      ]);
    };

    const provider = createClaudeAgentSdkProvider({ timeout: 5000 });
    const agent = createDeepFactorAgent({
      model: provider,
      tools: [addTool],
      stopWhen: [maxIterations(5)],
      middleware: [],
    });

    const result = await agent.loop("Add 2+3 then 5+10");

    expect(result.stopReason).toBe("completed");
    expect(result.response).toBe("2+3=5 and 5+10=15");

    const toolCalls = result.thread.events.filter((e) => e.type === "tool_call");
    const toolResults = result.thread.events.filter((e) => e.type === "tool_result");
    expect(toolCalls).toHaveLength(2);
    expect(toolResults).toHaveLength(2);
    expect(toolResults[0].result).toBe("5");
    expect(toolResults[1].result).toBe("15");
  });

  it("agent stops on maxIterations stop condition", async () => {
    const { createClaudeAgentSdkProvider } = await import("../src/providers/claude-agent-sdk.js");

    // Model always returns text — verifyCompletion forces multiple iterations
    let invokeCount = 0;
    mockQueryFn = () => {
      invokeCount++;
      return mockQueryGenerator([
        {
          role: "assistant",
          content: [{ type: "text", text: `Attempt ${invokeCount}` }],
          usage: { input_tokens: 10, output_tokens: 10 },
        } satisfies SdkResponseMessage,
      ]);
    };

    const provider = createClaudeAgentSdkProvider({ timeout: 5000 });
    const agent = createDeepFactorAgent({
      model: provider,
      stopWhen: [maxIterations(2)],
      middleware: [],
      // verifyCompletion always says not done, forcing re-iteration until stop condition
      verifyCompletion: async () => ({ complete: false, reason: "Not done yet" }),
    });

    const result = await agent.loop("Keep looping");

    expect(result.stopReason).toBe("stop_condition");
    expect(result.iterations).toBe(2);
  });

  it("SDK error during agent loop propagates as max_errors", async () => {
    const { createClaudeAgentSdkProvider } = await import("../src/providers/claude-agent-sdk.js");

    mockQueryFn = () =>
      mockQueryGenerator([
        {
          type: "error",
          error_type: "rate_limit",
          message: "Too many requests",
        },
      ]);

    const provider = createClaudeAgentSdkProvider({ timeout: 5000 });
    const agent = createDeepFactorAgent({
      model: provider,
      stopWhen: [maxIterations(5)],
      middleware: [],
    });

    const result = await agent.loop("This will fail");

    // Agent loop catches errors and eventually stops after consecutive errors
    expect(result.stopReason).toBe("max_errors");
    expect(result.thread.events.some((e) => e.type === "error")).toBe(true);
  });

  it("provider options (model, systemPrompt) are passed through to SDK", async () => {
    const { createClaudeAgentSdkProvider } = await import("../src/providers/claude-agent-sdk.js");

    const capturedCalls: Array<{
      prompt: string;
      options?: Record<string, unknown>;
    }> = [];

    mockQueryFn = (args) => {
      capturedCalls.push(args);
      return mockQueryGenerator([
        {
          role: "assistant",
          content: [{ type: "text", text: "ok" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        } satisfies SdkResponseMessage,
      ]);
    };

    const provider = createClaudeAgentSdkProvider({
      model: "claude-sonnet-4-6",
      systemPrompt: "You are a helpful assistant",
      timeout: 5000,
    });

    const agent = createDeepFactorAgent({
      model: provider,
      instructions: "Be concise.",
      stopWhen: [maxIterations(3)],
      middleware: [],
    });

    await agent.loop("Hello");

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0].options?.model).toBe("claude-sonnet-4-6");
    // systemPrompt combines provider option + agent instructions (via SystemMessage)
    const sp = capturedCalls[0].options?.systemPrompt as string;
    expect(sp).toContain("You are a helpful assistant");
    expect(sp).toContain("Be concise.");
  });

  it("bindTools injects tool schemas into SDK system prompt", async () => {
    const { createClaudeAgentSdkProvider } = await import("../src/providers/claude-agent-sdk.js");

    const capturedCalls: Array<{
      prompt: string;
      options?: Record<string, unknown>;
    }> = [];

    mockQueryFn = (args) => {
      capturedCalls.push(args);
      return mockQueryGenerator([
        {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        } satisfies SdkResponseMessage,
      ]);
    };

    const myTool = tool(async (_args: { x: number }) => "result", {
      name: "my_tool",
      description: "A test tool",
      schema: z.object({ x: z.number() }),
    });

    const provider = createClaudeAgentSdkProvider({ timeout: 5000 });
    const agent = createDeepFactorAgent({
      model: provider,
      tools: [myTool],
      stopWhen: [maxIterations(3)],
      middleware: [],
    });

    await agent.loop("Use my tool");

    // The system prompt should contain tool definitions
    const sp = capturedCalls[0].options?.systemPrompt as string;
    expect(sp).toContain("my_tool");
    expect(sp).toContain("A test tool");
    expect(sp).toContain("[Available Tools]");

    // allowedTools should include the bound tool name
    const allowedTools = capturedCalls[0].options?.allowedTools as string[];
    expect(allowedTools).toContain("my_tool");
  });
});
