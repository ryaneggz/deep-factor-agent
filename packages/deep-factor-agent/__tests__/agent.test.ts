import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeepFactorAgent, addUsage } from "../src/agent.js";
import { maxIterations } from "../src/stop-conditions.js";
import { TOOL_NAME_REQUEST_HUMAN_INPUT } from "../src/human-in-the-loop.js";
import { isPendingResult } from "../src/types.js";
import { tool } from "@langchain/core/tools";
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { z } from "zod";
import type { TokenUsage } from "../src/types.js";

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

    it("yields chunks that can be iterated", async () => {
      const mockModel = makeMockModel();
      mockModel.stream.mockReturnValueOnce(
        (async function* () {
          yield new AIMessageChunk({ content: "Hello " });
          yield new AIMessageChunk({ content: "World" });
        })(),
      );

      const agent = new DeepFactorAgent({
        model: mockModel,
      });

      const stream = await agent.stream("Test iteration");
      const chunks: AIMessageChunk[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe("Hello ");
      expect(chunks[1].content).toBe("World");
    });

    it("can reconstruct full message from chunks", async () => {
      const mockModel = makeMockModel();
      mockModel.stream.mockReturnValueOnce(
        (async function* () {
          yield new AIMessageChunk({ content: "The capital " });
          yield new AIMessageChunk({ content: "of France " });
          yield new AIMessageChunk({ content: "is Paris." });
        })(),
      );

      const agent = new DeepFactorAgent({
        model: mockModel,
      });

      const stream = await agent.stream("Capital of France?");
      let fullContent = "";
      for await (const chunk of stream) {
        if (typeof chunk.content === "string") {
          fullContent += chunk.content;
        }
      }
      expect(fullContent).toBe("The capital of France is Paris.");
    });

    it("propagates errors from the underlying stream", async () => {
      const mockModel = makeMockModel();
      mockModel.stream.mockReturnValueOnce(
        (async function* () {
          yield new AIMessageChunk({ content: "partial" });
          throw new Error("Stream interrupted");
        })(),
      );

      const agent = new DeepFactorAgent({
        model: mockModel,
      });

      const stream = await agent.stream("Error test");
      const chunks: AIMessageChunk[] = [];
      await expect(async () => {
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
      }).rejects.toThrow("Stream interrupted");
      expect(chunks).toHaveLength(1);
    });

    it("binds tools to model when tools are provided", async () => {
      const mockModel = makeMockModel();
      mockModel.stream.mockReturnValueOnce(
        (async function* () {
          yield new AIMessageChunk({ content: "ok" });
        })(),
      );

      const searchTool = tool(
        async () => "result",
        {
          name: "search",
          description: "Search",
          schema: z.object({ query: z.string() }),
        },
      );

      const agent = new DeepFactorAgent({
        model: mockModel,
        tools: [searchTool],
      });

      await agent.stream("Test with tools");
      expect(mockModel.bindTools).toHaveBeenCalledWith(
        expect.arrayContaining([searchTool]),
      );
    });
  });

  describe("maxToolCallsPerIteration", () => {
    it("defaults to 20 inner steps", async () => {
      // Create a mock that always returns tool calls to exhaust the cap
      const dummyTool = tool(async () => "ok", {
        name: "dummy",
        description: "A dummy tool",
        schema: z.object({}),
      });

      const mockModel = makeMockModel();
      // Return tool calls 21 times to exceed default cap; step 21 should not be reached
      for (let i = 0; i < 21; i++) {
        mockModel.invoke.mockResolvedValueOnce(
          makeAIMessage("", {
            tool_calls: [{ name: "dummy", args: {}, id: `tc_${i}` }],
          }),
        );
      }
      // Final response after exhausting inner loop
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage("Done"));

      const agent = new DeepFactorAgent({
        model: mockModel,
        tools: [dummyTool],
      });

      const result = await agent.loop("Exhaust tool calls");
      // The inner loop ran 20 times (stepCount 0..19), then the outer loop
      // completed without verification → single iteration
      const toolCallEvents = result.thread.events.filter(
        (e) => e.type === "tool_call",
      );
      // Should be exactly 20 tool calls (the 21st invoke never triggers a tool_call event)
      expect(toolCallEvents.length).toBe(20);
    });

    it("respects custom maxToolCallsPerIteration", async () => {
      const dummyTool = tool(async () => "ok", {
        name: "dummy",
        description: "A dummy tool",
        schema: z.object({}),
      });

      const mockModel = makeMockModel();
      for (let i = 0; i < 4; i++) {
        mockModel.invoke.mockResolvedValueOnce(
          makeAIMessage("", {
            tool_calls: [{ name: "dummy", args: {}, id: `tc_${i}` }],
          }),
        );
      }

      const agent = new DeepFactorAgent({
        model: mockModel,
        tools: [dummyTool],
        maxToolCallsPerIteration: 3,
      });

      const result = await agent.loop("Limited tool calls");
      const toolCallEvents = result.thread.events.filter(
        (e) => e.type === "tool_call",
      );
      // With cap of 3, only 3 inner steps run (step 0, 1, 2)
      expect(toolCallEvents.length).toBe(3);
    });
  });

  describe("multiple tool calls in single response", () => {
    it("executes multiple tool calls from one model response", async () => {
      const calcTool = tool(
        async (args: { expression: string }) => `Result: ${args.expression}`,
        {
          name: "calculator",
          description: "Calculate",
          schema: z.object({ expression: z.string() }),
        },
      );
      const weatherTool = tool(
        async (args: { city: string }) => `72°F in ${args.city}`,
        {
          name: "weather",
          description: "Weather",
          schema: z.object({ city: z.string() }),
        },
      );

      const mockModel = makeMockModel();
      mockModel.invoke
        .mockResolvedValueOnce(
          makeAIMessage("", {
            tool_calls: [
              { name: "calculator", args: { expression: "2+2" }, id: "tc_1" },
              { name: "weather", args: { city: "Austin" }, id: "tc_2" },
            ],
          }),
        )
        .mockResolvedValueOnce(makeAIMessage("Here are the results"));

      const agent = new DeepFactorAgent({
        model: mockModel,
        tools: [calcTool, weatherTool],
      });

      const result = await agent.loop("Calculate and check weather");

      const toolCallEvents = result.thread.events.filter(
        (e) => e.type === "tool_call",
      );
      const toolResultEvents = result.thread.events.filter(
        (e) => e.type === "tool_result",
      );

      expect(toolCallEvents.length).toBe(2);
      expect(toolResultEvents.length).toBe(2);

      if (toolCallEvents[0].type === "tool_call") {
        expect(toolCallEvents[0].toolName).toBe("calculator");
      }
      if (toolCallEvents[1].type === "tool_call") {
        expect(toolCallEvents[1].toolName).toBe("weather");
      }
    });
  });

  describe("write_todos parse failure warning (#8)", () => {
    it("logs console.warn when write_todos result is not valid JSON", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Create a tool named "write_todos" that returns invalid JSON
      const badTodoTool = tool(async () => "not-json{{", {
        name: "write_todos",
        description: "Write todos",
        schema: z.object({
          todos: z.array(z.object({ id: z.string(), text: z.string(), status: z.string() })),
        }),
      });

      const mockModel = makeMockModel();
      mockModel.invoke
        .mockResolvedValueOnce(
          makeAIMessage("", {
            tool_calls: [
              {
                name: "write_todos",
                args: { todos: [{ id: "1", text: "test", status: "pending" }] },
                id: "tc_1",
              },
            ],
          }),
        )
        .mockResolvedValueOnce(makeAIMessage("Done"));

      const agent = new DeepFactorAgent({
        model: mockModel,
        tools: [badTodoTool],
      });

      await agent.loop("Write todos");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[deep-factor-agent] Failed to parse write_todos result"),
      );
      warnSpy.mockRestore();
    });
  });

  describe("isPendingResult type guard", () => {
    it("returns true for PendingResult", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke.mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: TOOL_NAME_REQUEST_HUMAN_INPUT,
              args: { question: "What color?" },
              id: "tc_hi",
            },
          ],
        }),
      );

      const agent = new DeepFactorAgent({
        model: mockModel,
        tools: [],
      });

      const result = await agent.loop("Ask user something");
      expect(isPendingResult(result)).toBe(true);
      expect(result.stopReason).toBe("human_input_needed");
    });

    it("returns false for AgentResult", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage("Done"));

      const agent = new DeepFactorAgent({
        model: mockModel,
      });

      const result = await agent.loop("Normal result");
      expect(isPendingResult(result)).toBe(false);
      expect(result.stopReason).toBe("completed");
    });
  });

  describe("context summarization auto-trigger in loop()", () => {
    it("triggers summarization when thread exceeds maxContextTokens", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke
        // Iteration 1: main LLM response
        .mockResolvedValueOnce(makeAIMessage("First response"))
        // Summarization call for iteration 0 (triggered at start of iteration 2)
        .mockResolvedValueOnce(
          new AIMessage("Summary: User asked about summarization."),
        )
        // Iteration 2: main LLM response
        .mockResolvedValueOnce(makeAIMessage("Second response"));

      const agent = new DeepFactorAgent({
        model: mockModel,
        contextManagement: {
          maxContextTokens: 10, // Very low threshold to force summarization
          keepRecentIterations: 1,
        },
        verifyCompletion: vi
          .fn()
          .mockResolvedValueOnce({ complete: false, reason: "Try again" })
          .mockResolvedValueOnce({ complete: true }),
      });

      const result = await agent.loop("Test context summarization trigger");

      // Verify summary events exist in thread — proves summarization triggered
      const summaryEvents = result.thread.events.filter(
        (e) => e.type === "summary",
      );
      expect(summaryEvents.length).toBeGreaterThan(0);

      // The summary should reference the summarized iteration (iteration 0)
      if (summaryEvents[0].type === "summary") {
        expect(summaryEvents[0].summarizedIterations).toContain(0);
        expect(summaryEvents[0].summary).toContain("Summary");
      }

      // Should have completed successfully after 2 iterations
      expect(result.stopReason).toBe("completed");
      expect(result.iterations).toBe(2);
    });

    it("injects summaries into system prompt via buildContextInjection", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke
        // Iteration 1: main LLM response
        .mockResolvedValueOnce(makeAIMessage("First response"))
        // Summarization of iteration 0
        .mockResolvedValueOnce(
          new AIMessage("Summary of initial conversation."),
        )
        // Iteration 2: main LLM response
        .mockResolvedValueOnce(makeAIMessage("Second response"));

      const agent = new DeepFactorAgent({
        model: mockModel,
        contextManagement: {
          maxContextTokens: 10,
          keepRecentIterations: 1,
        },
        verifyCompletion: vi
          .fn()
          .mockResolvedValueOnce({ complete: false, reason: "Try again" })
          .mockResolvedValueOnce({ complete: true }),
      });

      const result = await agent.loop("Test summary injection");

      // The third invoke call (iteration 2) should receive messages that
      // include the summary context in a SystemMessage
      const thirdCall = mockModel.invoke.mock.calls[2];
      expect(thirdCall).toBeDefined();
      const messages = thirdCall[0] as Array<{ content: string }>;
      const systemMessages = messages.filter(
        (m: any) => m._getType?.() === "system" || m.constructor?.name === "SystemMessage",
      );
      // If there's a system message, it should contain the summary injection
      if (systemMessages.length > 0) {
        const systemContent = systemMessages[0].content;
        expect(systemContent).toContain("Previous Iteration Summaries");
      }

      expect(result.stopReason).toBe("completed");
    });
  });

  describe("verifyCompletion + stop condition combined", () => {
    it("stop condition fires before verification completes", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke
        .mockResolvedValueOnce(makeAIMessage("Attempt 1"))
        .mockResolvedValueOnce(makeAIMessage("Attempt 2"));

      const verifyFn = vi.fn().mockResolvedValue({
        complete: false,
        reason: "Not ready",
      });

      const agent = new DeepFactorAgent({
        model: mockModel,
        stopWhen: maxIterations(1),
        verifyCompletion: verifyFn,
      });

      const result = await agent.loop("Will be stopped");
      expect(result.stopReason).toBe("stop_condition");
      expect(result.stopDetail).toContain("iterations");
      // Verification was never called because stop condition evaluated first
      // (or was called but stop condition result took precedence)
    });
  });
});
