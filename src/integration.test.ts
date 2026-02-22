import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDeepFactorAgent } from "./create-agent.js";
import { DeepFactorAgent } from "./agent.js";
import { maxIterations, maxTokens } from "./stop-conditions.js";
import { requestHumanInput } from "./human-in-the-loop.js";
import type { PendingResult, AgentMiddleware } from "./types.js";

// Mock the AI SDK
vi.mock("ai", () => {
  return {
    generateText: vi.fn(),
    streamText: vi.fn(),
    stepCountIs: vi.fn(() => () => true),
  };
});

import { generateText } from "ai";

const mockGenerateText = vi.mocked(generateText);

function makeMockModel() {
  return {
    specificationVersion: "v1" as const,
    provider: "test",
    modelId: "test-model",
    doGenerate: vi.fn(),
  } as any;
}

function makeResult(text = "Response", overrides: Record<string, unknown> = {}) {
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
        ...(overrides.step ?? {}),
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Integration: full workflow", () => {
  it("createDeepFactorAgent -> loop() with tools, middleware, stop conditions", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeResult("Task completed", {
        steps: [
          {
            toolCalls: [
              {
                toolCallId: "tc_1",
                toolName: "searchDocs",
                input: { query: "typescript" },
              },
            ],
            toolResults: [
              {
                toolCallId: "tc_1",
                toolName: "searchDocs",
                output: { docs: ["found result"] },
              },
            ],
            text: "Task completed",
            usage: {
              inputTokens: 200,
              outputTokens: 100,
              totalTokens: 300,
            },
          },
        ],
        totalUsage: {
          inputTokens: 200,
          outputTokens: 100,
          totalTokens: 300,
        },
      }) as any,
    );

    const agent = createDeepFactorAgent({
      model: makeMockModel(),
      tools: {
        searchDocs: {
          description: "Search documentation",
          parameters: {},
          execute: async (args: any) => ({ docs: ["result"] }),
        },
      } as any,
      stopWhen: [maxIterations(5), maxTokens(50000)],
    });

    const result = await agent.loop("Search for TypeScript docs");
    expect(result.stopReason).toBe("completed");
    expect(result.response).toBe("Task completed");
    expect(result.usage.inputTokens).toBe(200);

    // Tool call and result recorded
    const toolCalls = result.thread.events.filter(
      (e) => e.type === "tool_call",
    );
    const toolResults = result.thread.events.filter(
      (e) => e.type === "tool_result",
    );
    expect(toolCalls.length).toBe(1);
    expect(toolResults.length).toBe(1);
  });

  it("multi-iteration with verification feedback", async () => {
    mockGenerateText
      .mockResolvedValueOnce(makeResult("Draft 1") as any)
      .mockResolvedValueOnce(makeResult("Draft 2 - improved") as any);

    const agent = createDeepFactorAgent({
      model: makeMockModel(),
      verifyCompletion: vi
        .fn()
        .mockResolvedValueOnce({
          complete: false,
          reason: "Missing error handling",
        })
        .mockResolvedValueOnce({ complete: true }),
      middleware: [], // No built-in middleware for cleaner test
    });

    const result = await agent.loop("Write a function");
    expect(result.stopReason).toBe("completed");
    expect(result.iterations).toBe(2);
    expect(result.response).toBe("Draft 2 - improved");

    // Verification feedback injected
    const feedbackMessages = result.thread.events.filter(
      (e) =>
        e.type === "message" &&
        e.role === "user" &&
        e.content.includes("Verification failed"),
    );
    expect(feedbackMessages.length).toBe(1);
  });

  it("human-in-the-loop: pause, resume, continue", async () => {
    // Agent calls requestHumanInput
    mockGenerateText.mockResolvedValueOnce(
      makeResult("", {
        steps: [
          {
            toolCalls: [
              {
                toolCallId: "tc_hi",
                toolName: "requestHumanInput",
                input: { question: "Which DB to use?", format: "free_text" },
              },
            ],
            toolResults: [
              {
                toolCallId: "tc_hi",
                toolName: "requestHumanInput",
                output: { requested: true, question: "Which DB to use?" },
              },
            ],
            text: "",
            usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
          },
        ],
        totalUsage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
      }) as any,
    );

    const agent = createDeepFactorAgent({
      model: makeMockModel(),
      tools: { requestHumanInput } as any,
      middleware: [],
    });

    const pending = (await agent.loop(
      "Set up database",
    )) as PendingResult;
    expect(pending.stopReason).toBe("human_input_needed");

    // Resume with human response
    mockGenerateText.mockResolvedValueOnce(
      makeResult("Set up PostgreSQL as requested") as any,
    );

    const final = await pending.resume("PostgreSQL");
    expect(final.stopReason).toBe("completed");
    expect(final.response).toBe("Set up PostgreSQL as requested");

    // Both events recorded
    const requested = final.thread.events.filter(
      (e) => e.type === "human_input_requested",
    );
    const received = final.thread.events.filter(
      (e) => e.type === "human_input_received",
    );
    expect(requested.length).toBe(1);
    expect(received.length).toBe(1);
  });

  it("middleware hooks fire in correct order", async () => {
    const order: string[] = [];

    const mw1: AgentMiddleware = {
      name: "logger1",
      beforeIteration: async () => {
        order.push("before1");
      },
      afterIteration: async () => {
        order.push("after1");
      },
    };
    const mw2: AgentMiddleware = {
      name: "logger2",
      beforeIteration: async () => {
        order.push("before2");
      },
      afterIteration: async () => {
        order.push("after2");
      },
    };

    mockGenerateText.mockResolvedValueOnce(makeResult() as any);

    const agent = createDeepFactorAgent({
      model: makeMockModel(),
      middleware: [mw1, mw2],
    });

    await agent.loop("Test middleware order");
    expect(order).toEqual(["before1", "before2", "after1", "after2"]);
  });

  it("token usage aggregation across iterations", async () => {
    mockGenerateText
      .mockResolvedValueOnce(
        makeResult("r1", {
          totalUsage: {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          },
        }) as any,
      )
      .mockResolvedValueOnce(
        makeResult("r2", {
          totalUsage: {
            inputTokens: 200,
            outputTokens: 100,
            totalTokens: 300,
          },
        }) as any,
      )
      .mockResolvedValueOnce(
        makeResult("r3", {
          totalUsage: {
            inputTokens: 300,
            outputTokens: 150,
            totalTokens: 450,
          },
        }) as any,
      );

    const agent = createDeepFactorAgent({
      model: makeMockModel(),
      verifyCompletion: vi
        .fn()
        .mockResolvedValueOnce({ complete: false, reason: "try again" })
        .mockResolvedValueOnce({ complete: false, reason: "once more" })
        .mockResolvedValueOnce({ complete: true }),
      middleware: [],
    });

    const result = await agent.loop("Accumulate tokens");
    expect(result.iterations).toBe(3);
    expect(result.usage.inputTokens).toBe(600);
    expect(result.usage.outputTokens).toBe(300);
    expect(result.usage.totalTokens).toBe(900);
  });

  it("all tests with mocked LLM - no real API calls", () => {
    // This is an assertion that we're using mocks
    expect(vi.isMockFunction(generateText)).toBe(true);
  });
});
