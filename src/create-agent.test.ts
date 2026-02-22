import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDeepFactorAgent } from "./create-agent.js";
import { DeepFactorAgent } from "./agent.js";

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

describe("createDeepFactorAgent", () => {
  it("returns a DeepFactorAgent instance", () => {
    const agent = createDeepFactorAgent({
      model: makeMockModel(),
    });
    expect(agent).toBeInstanceOf(DeepFactorAgent);
  });

  it("works with only model specified (defaults applied)", () => {
    const agent = createDeepFactorAgent({
      model: makeMockModel(),
    });
    expect(agent).toBeDefined();
  });

  it("has loop() method", () => {
    const agent = createDeepFactorAgent({
      model: makeMockModel(),
    });
    expect(typeof agent.loop).toBe("function");
  });

  it("has stream() method", () => {
    const agent = createDeepFactorAgent({
      model: makeMockModel(),
    });
    expect(typeof agent.stream).toBe("function");
  });

  it("loop() returns AgentResult with mocked model", async () => {
    mockGenerateText.mockResolvedValueOnce(makeDefaultResult() as any);

    const agent = createDeepFactorAgent({
      model: makeMockModel(),
    });

    const result = await agent.loop("Hello");
    expect(result.response).toBe("Test response");
    expect(result.thread).toBeDefined();
    expect(result.usage).toBeDefined();
    expect(result.iterations).toBe(1);
    expect(result.stopReason).toBe("completed");
  });

  it("stream() returns streaming result with mocked model", () => {
    const mockStreamResult = {
      textStream: (async function* () {
        yield "chunk";
      })(),
      text: Promise.resolve("chunk"),
    };
    mockStreamText.mockReturnValueOnce(mockStreamResult as any);

    const agent = createDeepFactorAgent({
      model: makeMockModel(),
    });

    const result = agent.stream("Hello");
    expect(result).toBeDefined();
  });

  it("custom settings override defaults", async () => {
    mockGenerateText.mockResolvedValueOnce(makeDefaultResult() as any);

    const customMiddleware = { name: "custom" };
    const agent = createDeepFactorAgent({
      model: makeMockModel(),
      instructions: "Custom instructions",
      middleware: [customMiddleware],
    });

    const result = await agent.loop("Test");
    expect(result.stopReason).toBe("completed");
  });

  it("applies default maxIterations(10) stop condition", async () => {
    // Make generateText keep returning results with verification failing
    for (let i = 0; i < 11; i++) {
      mockGenerateText.mockResolvedValueOnce(makeDefaultResult() as any);
    }

    const agent = createDeepFactorAgent({
      model: makeMockModel(),
      verifyCompletion: async () => ({ complete: false, reason: "not done" }),
    });

    const result = await agent.loop("Test default stop");
    // Should stop at iteration 10 due to default maxIterations(10)
    expect(result.stopReason).toBe("stop_condition");
    expect(result.iterations).toBeLessThanOrEqual(10);
  });
});

describe("barrel exports", () => {
  it("all public types and functions are importable", async () => {
    const exports = await import("./index.js");

    // Factory
    expect(exports.createDeepFactorAgent).toBeDefined();

    // Agent class
    expect(exports.DeepFactorAgent).toBeDefined();

    // Stop conditions
    expect(exports.maxIterations).toBeDefined();
    expect(exports.maxTokens).toBeDefined();
    expect(exports.maxInputTokens).toBeDefined();
    expect(exports.maxOutputTokens).toBeDefined();
    expect(exports.maxCost).toBeDefined();
    expect(exports.calculateCost).toBeDefined();
    expect(exports.MODEL_PRICING).toBeDefined();
    expect(exports.evaluateStopConditions).toBeDefined();

    // Middleware
    expect(exports.composeMiddleware).toBeDefined();
    expect(exports.todoMiddleware).toBeDefined();
    expect(exports.errorRecoveryMiddleware).toBeDefined();

    // Context management
    expect(exports.ContextManager).toBeDefined();
    expect(exports.estimateTokens).toBeDefined();

    // Utilities
    expect(exports.addUsage).toBeDefined();

    // Human-in-the-loop
    expect(exports.requestHumanInput).toBeDefined();
  });
});
