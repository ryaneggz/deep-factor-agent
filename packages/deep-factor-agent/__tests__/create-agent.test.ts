import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { createDeepFactorAgent } from "../src/create-agent.js";
import { DeepFactorAgent } from "../src/agent.js";

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

function makeAIMessage(content = "Test response") {
  return new AIMessage({
    content,
    usage_metadata: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    },
  });
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
    const mockModel = makeMockModel();
    mockModel.invoke.mockResolvedValueOnce(makeAIMessage());

    const agent = createDeepFactorAgent({
      model: mockModel,
    });

    const result = await agent.loop("Hello");
    expect(result.response).toBe("Test response");
    expect(result.thread).toBeDefined();
    expect(result.usage).toBeDefined();
    expect(result.iterations).toBe(1);
    expect(result.stopReason).toBe("completed");
  });

  it("stream() returns streaming result with mocked model", async () => {
    const mockModel = makeMockModel();
    mockModel.stream.mockReturnValueOnce(
      (async function* () {
        yield { content: "chunk" };
      })(),
    );

    const agent = createDeepFactorAgent({
      model: mockModel,
    });

    const result = await agent.stream("Hello");
    expect(result).toBeDefined();
  });

  it("custom settings override defaults", async () => {
    const mockModel = makeMockModel();
    mockModel.invoke.mockResolvedValueOnce(makeAIMessage());

    const customMiddleware = { name: "custom" };
    const agent = createDeepFactorAgent({
      model: mockModel,
      instructions: "Custom instructions",
      middleware: [customMiddleware],
    });

    const result = await agent.loop("Test");
    expect(result.stopReason).toBe("completed");
  });

  it("applies default maxIterations(10) stop condition", async () => {
    const mockModel = makeMockModel();
    for (let i = 0; i < 11; i++) {
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage());
    }

    const agent = createDeepFactorAgent({
      model: mockModel,
      verifyCompletion: async () => ({
        complete: false,
        reason: "not done",
      }),
    });

    const result = await agent.loop("Test default stop");
    expect(result.stopReason).toBe("stop_condition");
    expect(result.iterations).toBeLessThanOrEqual(10);
  });
});

describe("barrel exports", () => {
  it("all public types and functions are importable", async () => {
    const exports = await import("../src/index.js");

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
    expect(exports.requestHumanInputSchema).toBeDefined();
    expect(exports.TOOL_NAME_REQUEST_HUMAN_INPUT).toBeDefined();

    // Type guard
    expect(exports.isPendingResult).toBeDefined();

    // Tool adapter utilities
    expect(exports.createLangChainTool).toBeDefined();
    expect(exports.toolArrayToMap).toBeDefined();
    expect(exports.findToolByName).toBeDefined();

    // XML serializer
    expect(exports.serializeThreadToXml).toBeDefined();
    expect(exports.escapeXml).toBeDefined();

    // Middleware constants
    expect(exports.TOOL_NAME_WRITE_TODOS).toBeDefined();
  });
});
