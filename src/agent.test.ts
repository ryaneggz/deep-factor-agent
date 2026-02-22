import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeepFactorAgent, addUsage } from "./agent.js";
import { maxIterations } from "./stop-conditions.js";
import { tool } from "@langchain/core/tools";
import { AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { TokenUsage } from "./types.js";

function makeMockModel() {
  const model: any = {
    invoke: vi.fn(),
    bindTools: vi.fn(),
    stream: vi.fn(),
    modelName: "test-model",
  };
  model.bindTools.mockReturnValue(model);
  return model;
}

function makeAIMessage(
  content = "Test response",
  options: {
    tool_calls?: Array<{ name: string; args: Record<string, any>; id: string }>;
    usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  } = {},
) {
  return new AIMessage({
    content,
    tool_calls: options.tool_calls ?? [],
    usage_metadata: options.usage ?? {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addUsage", () => {
  it("sums all token fields", () => {
    const a: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    };
    const b: TokenUsage = {
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
    };
    const result = addUsage(a, b);
    expect(result.inputTokens).toBe(300);
    expect(result.outputTokens).toBe(150);
    expect(result.totalTokens).toBe(450);
  });

  it("handles optional cache token fields", () => {
    const a: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
    };
    const b: TokenUsage = {
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      cacheReadTokens: 20,
    };
    const result = addUsage(a, b);
    expect(result.cacheReadTokens).toBe(30);
    expect(result.cacheWriteTokens).toBe(5);
  });
});

describe("DeepFactorAgent", () => {
  describe("constructor", () => {
    it("accepts string model IDs", () => {
      const agent = new DeepFactorAgent({
        model: "test-model",
      });
      expect(agent).toBeDefined();
    });

    it("creates agent with BaseChatModel instance", () => {
      const agent = new DeepFactorAgent({
        model: makeMockModel(),
      });
      expect(agent).toBeDefined();
    });
  });

  describe("loop()", () => {
    it("returns AgentResult with stopReason 'completed' for single iteration", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage());

      const agent = new DeepFactorAgent({
        model: mockModel,
      });

      const result = await agent.loop("Hello");
      expect(result.stopReason).toBe("completed");
      expect(result.response).toBe("Test response");
      expect(result.iterations).toBe(1);
      expect(result.thread).toBeDefined();
      expect(result.thread.events.length).toBeGreaterThan(0);
    });

    it("records user message as first event in thread", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage());

      const agent = new DeepFactorAgent({
        model: mockModel,
      });

      const result = await agent.loop("Hello World");
      const firstEvent = result.thread.events[0];
      expect(firstEvent.type).toBe("message");
      if (firstEvent.type === "message") {
        expect(firstEvent.role).toBe("user");
        expect(firstEvent.content).toBe("Hello World");
      }
    });

    it("aggregates token usage across iterations", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke
        .mockResolvedValueOnce(makeAIMessage("First attempt"))
        .mockResolvedValueOnce(makeAIMessage("Second attempt"));

      const agent = new DeepFactorAgent({
        model: mockModel,
        verifyCompletion: vi
          .fn()
          .mockResolvedValueOnce({ complete: false, reason: "Not done yet" })
          .mockResolvedValueOnce({ complete: true }),
      });

      const result = await agent.loop("Do something");
      expect(result.usage.inputTokens).toBe(200);
      expect(result.usage.outputTokens).toBe(100);
      expect(result.usage.totalTokens).toBe(300);
      expect(result.iterations).toBe(2);
    });

    it("multi-iteration with verification feedback", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke
        .mockResolvedValueOnce(makeAIMessage("First response"))
        .mockResolvedValueOnce(makeAIMessage("Fixed response"));

      const verifyFn = vi
        .fn()
        .mockResolvedValueOnce({
          complete: false,
          reason: "Missing details",
        })
        .mockResolvedValueOnce({ complete: true });

      const agent = new DeepFactorAgent({
        model: mockModel,
        verifyCompletion: verifyFn,
      });

      const result = await agent.loop("Write something");
      expect(result.stopReason).toBe("completed");
      expect(result.iterations).toBe(2);
      expect(verifyFn).toHaveBeenCalledTimes(2);

      const feedbackEvents = result.thread.events.filter(
        (e) =>
          e.type === "message" &&
          e.role === "user" &&
          e.content.includes("Verification failed"),
      );
      expect(feedbackEvents.length).toBe(1);
    });

    it("handles error recovery - one error then success", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(makeAIMessage());

      const agent = new DeepFactorAgent({
        model: mockModel,
      });

      const result = await agent.loop("Test error recovery");
      expect(result.stopReason).toBe("completed");

      const errorEvents = result.thread.events.filter(
        (e) => e.type === "error",
      );
      expect(errorEvents.length).toBe(1);
      if (errorEvents[0].type === "error") {
        expect(errorEvents[0].recoverable).toBe(true);
      }
    });

    it("exits with max_errors after 3 consecutive errors", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke
        .mockRejectedValueOnce(new Error("Error 1"))
        .mockRejectedValueOnce(new Error("Error 2"))
        .mockRejectedValueOnce(new Error("Error 3"));

      const agent = new DeepFactorAgent({
        model: mockModel,
      });

      const result = await agent.loop("Test max errors");
      expect(result.stopReason).toBe("max_errors");
      expect(result.stopDetail).toContain("3");

      const errorEvents = result.thread.events.filter(
        (e) => e.type === "error",
      );
      expect(errorEvents.length).toBe(3);
    });

    it("stop condition triggered", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage());

      const agent = new DeepFactorAgent({
        model: mockModel,
        stopWhen: maxIterations(1),
        verifyCompletion: async () => ({
          complete: false,
          reason: "keep going",
        }),
      });

      const result = await agent.loop("Test stop condition");
      expect(result.stopReason).toBe("stop_condition");
      expect(result.stopDetail).toContain("iterations");
    });

    it("records tool calls and results as events", async () => {
      const searchTool = tool(
        async (args: { query: string }) =>
          JSON.stringify({ results: ["found"] }),
        {
          name: "search",
          description: "Search for something",
          schema: z.object({ query: z.string() }),
        },
      );

      const mockModel = makeMockModel();
      mockModel.invoke
        .mockResolvedValueOnce(
          makeAIMessage("", {
            tool_calls: [
              { name: "search", args: { query: "test" }, id: "tc_1" },
            ],
          }),
        )
        .mockResolvedValueOnce(makeAIMessage("Found results"));

      const agent = new DeepFactorAgent({
        model: mockModel,
        tools: [searchTool],
      });

      const result = await agent.loop("Search for something");

      const toolCallEvents = result.thread.events.filter(
        (e) => e.type === "tool_call",
      );
      const toolResultEvents = result.thread.events.filter(
        (e) => e.type === "tool_result",
      );

      expect(toolCallEvents.length).toBe(1);
      expect(toolResultEvents.length).toBe(1);

      if (toolCallEvents[0].type === "tool_call") {
        expect(toolCallEvents[0].toolName).toBe("search");
        expect(toolCallEvents[0].toolCallId).toBe("tc_1");
      }
    });

    it("thread is included in result", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage());

      const agent = new DeepFactorAgent({
        model: mockModel,
      });

      const result = await agent.loop("Test thread");
      expect(result.thread).toBeDefined();
      expect(result.thread.id).toBeDefined();
      expect(result.thread.events).toBeDefined();
      expect(result.thread.metadata).toBeDefined();
    });

    it("invokes onIterationStart and onIterationEnd callbacks", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage());

      const onStart = vi.fn();
      const onEnd = vi.fn();

      const agent = new DeepFactorAgent({
        model: mockModel,
        onIterationStart: onStart,
        onIterationEnd: onEnd,
      });

      await agent.loop("Test callbacks");
      expect(onStart).toHaveBeenCalledWith(1);
      expect(onEnd).toHaveBeenCalledWith(1, expect.anything());
    });

    it("no verifyCompletion means single iteration mode", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage());

      const agent = new DeepFactorAgent({
        model: mockModel,
      });

      const result = await agent.loop("Single iteration");
      expect(result.iterations).toBe(1);
      expect(result.stopReason).toBe("completed");

      const completionEvents = result.thread.events.filter(
        (e) => e.type === "completion",
      );
      expect(completionEvents.length).toBe(1);
    });
  });

  describe("stream()", () => {
    it("returns a streaming result", async () => {
      const mockModel = makeMockModel();
      mockModel.stream.mockReturnValueOnce(
        (async function* () {
          yield { content: "chunk1" };
          yield { content: "chunk2" };
        })(),
      );

      const agent = new DeepFactorAgent({
        model: mockModel,
      });

      const result = await agent.stream("Test stream");
      expect(result).toBeDefined();
    });
  });
});
