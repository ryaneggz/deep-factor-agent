import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeepFactorAgent, addUsage } from "./agent.js";
import { maxIterations } from "./stop-conditions.js";
import type {
  AgentResult,
  PendingResult,
  TokenUsage,
  DeepFactorAgentSettings,
} from "./types.js";

// Mock the AI SDK
vi.mock("ai", () => {
  return {
    generateText: vi.fn(),
    streamText: vi.fn(),
    stepCountIs: vi.fn(() => () => true),
  };
});

import { generateText, streamText } from "ai";

const mockGenerateText = vi.mocked(generateText);
const mockStreamText = vi.mocked(streamText);

function makeMockModel() {
  return {
    specificationVersion: "v1" as const,
    provider: "test",
    modelId: "test-model",
    doGenerate: vi.fn(),
  } as any;
}

function makeDefaultResult(text = "Test response") {
  return {
    text,
    steps: [
      {
        toolCalls: [],
        toolResults: [],
        text,
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
      },
    ],
    toolCalls: [],
    toolResults: [],
    totalUsage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    },
    finishReason: "stop",
    response: { messages: [] },
  };
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
    it("throws for string model IDs", () => {
      expect(
        () =>
          new DeepFactorAgent({
            model: "test-model" as any,
          }),
      ).toThrow("String model IDs are not supported");
    });

    it("creates agent with LanguageModel instance", () => {
      const agent = new DeepFactorAgent({
        model: makeMockModel(),
      });
      expect(agent).toBeDefined();
    });
  });

  describe("loop()", () => {
    it("returns AgentResult with stopReason 'completed' for single iteration", async () => {
      mockGenerateText.mockResolvedValueOnce(makeDefaultResult() as any);

      const agent = new DeepFactorAgent({
        model: makeMockModel(),
      });

      const result = await agent.loop("Hello");
      expect(result.stopReason).toBe("completed");
      expect(result.response).toBe("Test response");
      expect(result.iterations).toBe(1);
      expect(result.thread).toBeDefined();
      expect(result.thread.events.length).toBeGreaterThan(0);
    });

    it("records user message as first event in thread", async () => {
      mockGenerateText.mockResolvedValueOnce(makeDefaultResult() as any);

      const agent = new DeepFactorAgent({
        model: makeMockModel(),
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
      // First iteration: verifier rejects
      mockGenerateText.mockResolvedValueOnce(
        makeDefaultResult("First attempt") as any,
      );
      // Second iteration: verifier accepts
      mockGenerateText.mockResolvedValueOnce(
        makeDefaultResult("Second attempt") as any,
      );

      const agent = new DeepFactorAgent({
        model: makeMockModel(),
        verifyCompletion: vi
          .fn()
          .mockResolvedValueOnce({ complete: false, reason: "Not done yet" })
          .mockResolvedValueOnce({ complete: true }),
      });

      const result = await agent.loop("Do something");
      expect(result.usage.inputTokens).toBe(200); // 100 * 2
      expect(result.usage.outputTokens).toBe(100); // 50 * 2
      expect(result.usage.totalTokens).toBe(300); // 150 * 2
      expect(result.iterations).toBe(2);
    });

    it("multi-iteration with verification feedback", async () => {
      mockGenerateText
        .mockResolvedValueOnce(
          makeDefaultResult("First response") as any,
        )
        .mockResolvedValueOnce(
          makeDefaultResult("Fixed response") as any,
        );

      const verifyFn = vi
        .fn()
        .mockResolvedValueOnce({
          complete: false,
          reason: "Missing details",
        })
        .mockResolvedValueOnce({ complete: true });

      const agent = new DeepFactorAgent({
        model: makeMockModel(),
        verifyCompletion: verifyFn,
      });

      const result = await agent.loop("Write something");
      expect(result.stopReason).toBe("completed");
      expect(result.iterations).toBe(2);
      expect(verifyFn).toHaveBeenCalledTimes(2);

      // Check that feedback was injected
      const feedbackEvents = result.thread.events.filter(
        (e) =>
          e.type === "message" &&
          e.role === "user" &&
          e.content.includes("Verification failed"),
      );
      expect(feedbackEvents.length).toBe(1);
    });

    it("handles error recovery - one error then success", async () => {
      mockGenerateText
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(makeDefaultResult() as any);

      const agent = new DeepFactorAgent({
        model: makeMockModel(),
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
      mockGenerateText
        .mockRejectedValueOnce(new Error("Error 1"))
        .mockRejectedValueOnce(new Error("Error 2"))
        .mockRejectedValueOnce(new Error("Error 3"));

      const agent = new DeepFactorAgent({
        model: makeMockModel(),
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
      mockGenerateText.mockResolvedValueOnce(makeDefaultResult() as any);

      const agent = new DeepFactorAgent({
        model: makeMockModel(),
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
      const resultWithTools = {
        ...makeDefaultResult(),
        steps: [
          {
            toolCalls: [
              {
                toolCallId: "tc_1",
                toolName: "search",
                input: { query: "test" },
              },
            ],
            toolResults: [
              {
                toolCallId: "tc_1",
                toolName: "search",
                output: { results: ["found"] },
              },
            ],
            text: "Found results",
          },
        ],
      };

      mockGenerateText.mockResolvedValueOnce(resultWithTools as any);

      const agent = new DeepFactorAgent({
        model: makeMockModel(),
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
      mockGenerateText.mockResolvedValueOnce(makeDefaultResult() as any);

      const agent = new DeepFactorAgent({
        model: makeMockModel(),
      });

      const result = await agent.loop("Test thread");
      expect(result.thread).toBeDefined();
      expect(result.thread.id).toBeDefined();
      expect(result.thread.events).toBeDefined();
      expect(result.thread.metadata).toBeDefined();
    });

    it("invokes onIterationStart and onIterationEnd callbacks", async () => {
      mockGenerateText.mockResolvedValueOnce(makeDefaultResult() as any);

      const onStart = vi.fn();
      const onEnd = vi.fn();

      const agent = new DeepFactorAgent({
        model: makeMockModel(),
        onIterationStart: onStart,
        onIterationEnd: onEnd,
      });

      await agent.loop("Test callbacks");
      expect(onStart).toHaveBeenCalledWith(1);
      expect(onEnd).toHaveBeenCalledWith(1, expect.anything());
    });

    it("no verifyCompletion means single iteration mode", async () => {
      mockGenerateText.mockResolvedValueOnce(makeDefaultResult() as any);

      const agent = new DeepFactorAgent({
        model: makeMockModel(),
        // no verifyCompletion
      });

      const result = await agent.loop("Single iteration");
      expect(result.iterations).toBe(1);
      expect(result.stopReason).toBe("completed");

      // Completion event should be present
      const completionEvents = result.thread.events.filter(
        (e) => e.type === "completion",
      );
      expect(completionEvents.length).toBe(1);
    });
  });

  describe("stream()", () => {
    it("returns a streaming result", () => {
      const mockStreamResult = {
        textStream: (async function* () {
          yield "chunk1";
          yield "chunk2";
        })(),
        text: Promise.resolve("chunk1chunk2"),
      };
      mockStreamText.mockReturnValueOnce(mockStreamResult as any);

      const agent = new DeepFactorAgent({
        model: makeMockModel(),
      });

      const result = agent.stream("Test stream");
      expect(result).toBeDefined();
    });
  });
});
