import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeepFactorAgent } from "../../src/create-agent.js";
import { maxIterations } from "../../src/stop-conditions.js";
import type { SdkResponseMessage } from "../../src/providers/claude-agent-sdk.js";

async function* mockQueryGenerator(messages: unknown[]): AsyncGenerator<unknown> {
  for (const message of messages) {
    yield message;
  }
}

let mockQueryFn: (args: {
  prompt: string;
  options?: Record<string, unknown>;
}) => AsyncIterable<unknown>;

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  get query() {
    return mockQueryFn;
  },
}));

describe("createDeepFactorAgent with the Claude Agent SDK provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs a full tool loop round-trip", async () => {
    const { createClaudeAgentSdkProvider } =
      await import("../../src/providers/claude-agent-sdk.js");

    const greetTool = tool(async (args: { name: string }) => `Hello, ${args.name}!`, {
      name: "greet",
      description: "Greet a person by name",
      schema: z.object({ name: z.string() }),
    });

    let callCount = 0;
    mockQueryFn = () => {
      callCount++;
      if (callCount === 1) {
        return mockQueryGenerator([
          {
            role: "assistant",
            content: [
              { type: "text", text: "Let me greet them." },
              { type: "tool_use", id: "call_greet_1", name: "greet", input: { name: "Alice" } },
            ],
            usage: { input_tokens: 50, output_tokens: 30 },
          } satisfies SdkResponseMessage,
        ]);
      }
      return mockQueryGenerator([
        {
          role: "assistant",
          content: [{ type: "text", text: "I greeted Alice for you." }],
          usage: { input_tokens: 80, output_tokens: 20 },
        } satisfies SdkResponseMessage,
      ]);
    };

    const agent = createDeepFactorAgent({
      model: createClaudeAgentSdkProvider({ timeout: 5000 }),
      tools: [greetTool],
      stopWhen: [maxIterations(5)],
      middleware: [],
    });

    const result = await agent.loop("Please greet Alice");

    expect(result.stopReason).toBe("completed");
    expect(result.response).toBe("I greeted Alice for you.");
    expect(result.usage.totalTokens).toBe(180);
    expect(result.thread.events.filter((event) => event.type === "tool_call")).toHaveLength(1);
    expect(result.thread.events.filter((event) => event.type === "tool_result")).toHaveLength(1);
    expect(callCount).toBe(2);
  });

  it("surfaces provider failures as max_errors", async () => {
    const { createClaudeAgentSdkProvider } =
      await import("../../src/providers/claude-agent-sdk.js");

    mockQueryFn = () =>
      mockQueryGenerator([
        {
          type: "error",
          error_type: "rate_limit",
          message: "Too many requests",
        },
      ]);

    const agent = createDeepFactorAgent({
      model: createClaudeAgentSdkProvider({ timeout: 5000 }),
      stopWhen: [maxIterations(5)],
      middleware: [],
    });

    const result = await agent.loop("This will fail");

    expect(result.stopReason).toBe("max_errors");
    expect(result.stopDetail).toContain("Too many requests");
    expect(result.thread.events.some((event) => event.type === "error")).toBe(true);
  });
});
