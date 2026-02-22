import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeepFactorAgent } from "./agent.js";
import { requestHumanInput } from "./human-in-the-loop.js";
import type { PendingResult } from "./types.js";

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

function makeResultWithHumanInput() {
  return {
    text: "",
    steps: [
      {
        toolCalls: [
          {
            toolCallId: "tc_hi_1",
            toolName: "requestHumanInput",
            input: {
              question: "What color do you prefer?",
              context: "For the UI theme",
              urgency: "medium",
              format: "free_text",
            },
          },
        ],
        toolResults: [
          {
            toolCallId: "tc_hi_1",
            toolName: "requestHumanInput",
            output: {
              requested: true,
              question: "What color do you prefer?",
            },
          },
        ],
        text: "",
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
      },
    ],
    toolCalls: [
      {
        toolCallId: "tc_hi_1",
        toolName: "requestHumanInput",
        input: {
          question: "What color do you prefer?",
        },
      },
    ],
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
    finishReason: "tool-calls",
    response: { messages: [] },
  };
}

function makeResultWithInterruptTool() {
  return {
    text: "",
    steps: [
      {
        toolCalls: [
          {
            toolCallId: "tc_del_1",
            toolName: "deleteUser",
            input: { userId: "123" },
          },
        ],
        toolResults: [
          {
            toolCallId: "tc_del_1",
            toolName: "deleteUser",
            output: { deleted: true },
          },
        ],
        text: "",
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
    finishReason: "tool-calls",
    response: { messages: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestHumanInput tool", () => {
  it("has correct description", () => {
    expect(requestHumanInput.description).toContain("human");
  });

  it("has parameters schema", () => {
    expect(requestHumanInput.parameters).toBeDefined();
  });

  it("execute returns requested flag", async () => {
    const result = await (requestHumanInput as any).execute({
      question: "What is your name?",
      urgency: "high",
      format: "free_text",
    });
    expect(result.requested).toBe(true);
    expect(result.question).toBe("What is your name?");
  });
});

describe("human-in-the-loop: requestHumanInput tool call", () => {
  it("pauses the loop and returns PendingResult", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeResultWithHumanInput() as any,
    );

    const agent = new DeepFactorAgent({
      model: makeMockModel(),
      tools: {
        requestHumanInput: requestHumanInput,
      } as any,
    });

    const result = await agent.loop("Ask user something");
    expect(result.stopReason).toBe("human_input_needed");
    expect(result.stopDetail).toContain("Human input requested");
    expect("resume" in result).toBe(true);
  });

  it("HumanInputRequestedEvent is appended to thread on pause", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeResultWithHumanInput() as any,
    );

    const agent = new DeepFactorAgent({
      model: makeMockModel(),
      tools: {
        requestHumanInput: requestHumanInput,
      } as any,
    });

    const result = await agent.loop("Ask user something");
    const hirEvents = result.thread.events.filter(
      (e) => e.type === "human_input_requested",
    );
    expect(hirEvents.length).toBe(1);
    if (hirEvents[0].type === "human_input_requested") {
      expect(hirEvents[0].question).toBe("What color do you prefer?");
    }
  });

  it("resume continues the loop and returns AgentResult", async () => {
    // First call: agent calls requestHumanInput
    mockGenerateText.mockResolvedValueOnce(
      makeResultWithHumanInput() as any,
    );

    const agent = new DeepFactorAgent({
      model: makeMockModel(),
      tools: {
        requestHumanInput: requestHumanInput,
      } as any,
    });

    const pendingResult = (await agent.loop(
      "Ask user something",
    )) as PendingResult;
    expect(pendingResult.stopReason).toBe("human_input_needed");

    // Resume with human response
    mockGenerateText.mockResolvedValueOnce(
      makeDefaultResult("Blue is a great choice!") as any,
    );

    const finalResult = await pendingResult.resume("Blue");
    expect(finalResult.stopReason).toBe("completed");
    expect(finalResult.response).toBe("Blue is a great choice!");
  });

  it("HumanInputReceivedEvent is appended on resume", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeResultWithHumanInput() as any,
    );

    const agent = new DeepFactorAgent({
      model: makeMockModel(),
      tools: {
        requestHumanInput: requestHumanInput,
      } as any,
    });

    const pendingResult = (await agent.loop(
      "Ask user something",
    )) as PendingResult;

    mockGenerateText.mockResolvedValueOnce(
      makeDefaultResult("Thanks!") as any,
    );

    const finalResult = await pendingResult.resume("My answer");

    const receivedEvents = finalResult.thread.events.filter(
      (e) => e.type === "human_input_received",
    );
    expect(receivedEvents.length).toBe(1);
    if (receivedEvents[0].type === "human_input_received") {
      expect(receivedEvents[0].response).toBe("My answer");
    }
  });
});

describe("human-in-the-loop: interruptOn", () => {
  it("pauses before executing a listed tool", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeResultWithInterruptTool() as any,
    );

    const agent = new DeepFactorAgent({
      model: makeMockModel(),
      interruptOn: ["deleteUser"],
    });

    const result = await agent.loop("Delete user 123");
    expect(result.stopReason).toBe("human_input_needed");
    expect(result.stopDetail).toContain("deleteUser");
    expect("resume" in result).toBe(true);
  });

  it("resume with 'approved' continues the loop", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeResultWithInterruptTool() as any,
    );

    const agent = new DeepFactorAgent({
      model: makeMockModel(),
      interruptOn: ["deleteUser"],
    });

    const pendingResult = (await agent.loop(
      "Delete user 123",
    )) as PendingResult;

    mockGenerateText.mockResolvedValueOnce(
      makeDefaultResult("User deleted successfully") as any,
    );

    const finalResult = await pendingResult.resume("approved");
    expect(finalResult.stopReason).toBe("completed");
  });

  it("resume with 'denied: reason' skips tool execution", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeResultWithInterruptTool() as any,
    );

    const agent = new DeepFactorAgent({
      model: makeMockModel(),
      interruptOn: ["deleteUser"],
    });

    const pendingResult = (await agent.loop(
      "Delete user 123",
    )) as PendingResult;

    mockGenerateText.mockResolvedValueOnce(
      makeDefaultResult("Understood, deletion was denied.") as any,
    );

    const finalResult = await pendingResult.resume(
      "denied: User deletion not authorized",
    );
    expect(finalResult.stopReason).toBe("completed");

    // The denial should be in the thread
    const receivedEvents = finalResult.thread.events.filter(
      (e) => e.type === "human_input_received",
    );
    expect(receivedEvents.length).toBe(1);
    if (receivedEvents[0].type === "human_input_received") {
      expect(receivedEvents[0].response).toContain("denied");
    }
  });

  it("after resume, the loop continues from where it left off", async () => {
    mockGenerateText.mockResolvedValueOnce(
      makeResultWithInterruptTool() as any,
    );

    const agent = new DeepFactorAgent({
      model: makeMockModel(),
      interruptOn: ["deleteUser"],
    });

    const pendingResult = (await agent.loop(
      "Delete user 123",
    )) as PendingResult;

    expect(pendingResult.iterations).toBe(1);

    mockGenerateText.mockResolvedValueOnce(
      makeDefaultResult("Continuing after approval") as any,
    );

    const finalResult = await pendingResult.resume("approved");
    expect(finalResult.iterations).toBe(2);
  });
});

describe("multiple pause/resume cycles", () => {
  it("supports multiple pause/resume within a single run", async () => {
    // First iteration: requests human input
    mockGenerateText.mockResolvedValueOnce(
      makeResultWithHumanInput() as any,
    );

    const agent = new DeepFactorAgent({
      model: makeMockModel(),
      tools: {
        requestHumanInput: requestHumanInput,
      } as any,
      verifyCompletion: vi
        .fn()
        .mockResolvedValueOnce({ complete: false, reason: "Need more info" })
        .mockResolvedValueOnce({ complete: true }),
    });

    // First pause
    const pending1 = (await agent.loop(
      "Multi-step task",
    )) as PendingResult;
    expect(pending1.stopReason).toBe("human_input_needed");

    // First resume - agent asks again (via verification failure)
    const secondResult = {
      ...makeDefaultResult("Got it, working on it"),
    };
    mockGenerateText.mockResolvedValueOnce(secondResult as any);

    // Second result after verification failure retry
    mockGenerateText.mockResolvedValueOnce(
      makeDefaultResult("All done!") as any,
    );

    const finalResult = await pending1.resume("Use blue theme");
    // May complete or continue based on verification
    expect(["completed", "stop_condition"].includes(finalResult.stopReason)).toBe(
      true,
    );
  });
});
