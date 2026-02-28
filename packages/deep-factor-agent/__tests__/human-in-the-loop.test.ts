import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { DeepFactorAgent } from "../src/agent.js";
import { requestHumanInput } from "../src/human-in-the-loop.js";
import type { PendingResult } from "../src/types.js";

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

const defaultUsage = {
  input_tokens: 100,
  output_tokens: 50,
  total_tokens: 150,
};

function makeAIMessage(
  content = "Test response",
  options: {
    tool_calls?: Array<{
      name: string;
      args: Record<string, any>;
      id: string;
    }>;
  } = {},
) {
  return new AIMessage({
    content,
    tool_calls: options.tool_calls ?? [],
    usage_metadata: defaultUsage,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestHumanInput tool", () => {
  it("has correct description", () => {
    expect(requestHumanInput.description).toContain("human");
  });

  it("has schema", () => {
    expect(requestHumanInput.schema).toBeDefined();
  });

  it("invoke returns requested flag", async () => {
    const result = await requestHumanInput.invoke({
      question: "What is your name?",
      urgency: "high",
      format: "free_text",
    });
    const parsed = JSON.parse(result as string);
    expect(parsed.requested).toBe(true);
    expect(parsed.question).toBe("What is your name?");
  });
});

describe("human-in-the-loop: requestHumanInput tool call", () => {
  it("pauses the loop and returns PendingResult", async () => {
    const mockModel = makeMockModel();
    mockModel.invoke.mockResolvedValueOnce(
      makeAIMessage("", {
        tool_calls: [
          {
            name: "requestHumanInput",
            args: {
              question: "What color do you prefer?",
              context: "For the UI theme",
              urgency: "medium",
              format: "free_text",
            },
            id: "tc_hi_1",
          },
        ],
      }),
    );

    const agent = new DeepFactorAgent({
      model: mockModel,
      tools: [requestHumanInput],
    });

    const result = await agent.loop("Ask user something");
    expect(result.stopReason).toBe("human_input_needed");
    expect(result.stopDetail).toContain("Human input requested");
    expect("resume" in result).toBe(true);
  });

  it("HumanInputRequestedEvent is appended to thread on pause", async () => {
    const mockModel = makeMockModel();
    mockModel.invoke.mockResolvedValueOnce(
      makeAIMessage("", {
        tool_calls: [
          {
            name: "requestHumanInput",
            args: {
              question: "What color do you prefer?",
              context: "For the UI theme",
              urgency: "medium",
              format: "free_text",
            },
            id: "tc_hi_1",
          },
        ],
      }),
    );

    const agent = new DeepFactorAgent({
      model: mockModel,
      tools: [requestHumanInput],
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
    const mockModel = makeMockModel();
    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: "requestHumanInput",
              args: {
                question: "What color do you prefer?",
                format: "free_text",
              },
              id: "tc_hi_1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(makeAIMessage("Blue is a great choice!"));

    const agent = new DeepFactorAgent({
      model: mockModel,
      tools: [requestHumanInput],
    });

    const pendingResult = (await agent.loop(
      "Ask user something",
    )) as PendingResult;
    expect(pendingResult.stopReason).toBe("human_input_needed");

    const finalResult = await pendingResult.resume("Blue");
    expect(finalResult.stopReason).toBe("completed");
    expect(finalResult.response).toBe("Blue is a great choice!");
  });

  it("HumanInputReceivedEvent is appended on resume", async () => {
    const mockModel = makeMockModel();
    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: "requestHumanInput",
              args: { question: "Q?", format: "free_text" },
              id: "tc_hi_1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(makeAIMessage("Thanks!"));

    const agent = new DeepFactorAgent({
      model: mockModel,
      tools: [requestHumanInput],
    });

    const pendingResult = (await agent.loop(
      "Ask user something",
    )) as PendingResult;

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
    const mockModel = makeMockModel();
    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: "deleteUser",
              args: { userId: "123" },
              id: "tc_del_1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(makeAIMessage(""));

    const agent = new DeepFactorAgent({
      model: mockModel,
      interruptOn: ["deleteUser"],
    });

    const result = await agent.loop("Delete user 123");
    expect(result.stopReason).toBe("human_input_needed");
    expect(result.stopDetail).toContain("deleteUser");
    expect("resume" in result).toBe(true);
  });

  it("resume with 'approved' continues the loop", async () => {
    const mockModel = makeMockModel();
    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: "deleteUser",
              args: { userId: "123" },
              id: "tc_del_1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(makeAIMessage(""))
      .mockResolvedValueOnce(
        makeAIMessage("User deleted successfully"),
      );

    const agent = new DeepFactorAgent({
      model: mockModel,
      interruptOn: ["deleteUser"],
    });

    const pendingResult = (await agent.loop(
      "Delete user 123",
    )) as PendingResult;

    const finalResult = await pendingResult.resume("approved");
    expect(finalResult.stopReason).toBe("completed");
  });

  it("resume with 'denied: reason' skips tool execution", async () => {
    const mockModel = makeMockModel();
    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: "deleteUser",
              args: { userId: "123" },
              id: "tc_del_1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(makeAIMessage(""))
      .mockResolvedValueOnce(
        makeAIMessage("Understood, deletion was denied."),
      );

    const agent = new DeepFactorAgent({
      model: mockModel,
      interruptOn: ["deleteUser"],
    });

    const pendingResult = (await agent.loop(
      "Delete user 123",
    )) as PendingResult;

    const finalResult = await pendingResult.resume(
      "denied: User deletion not authorized",
    );
    expect(finalResult.stopReason).toBe("completed");

    const receivedEvents = finalResult.thread.events.filter(
      (e) => e.type === "human_input_received",
    );
    expect(receivedEvents.length).toBe(1);
    if (receivedEvents[0].type === "human_input_received") {
      expect(receivedEvents[0].response).toContain("denied");
    }
  });

  it("produces valid message sequence on resume (every tool_call has matching ToolMessage)", async () => {
    const mockModel = makeMockModel();
    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: "deleteUser",
              args: { userId: "123" },
              id: "tc_del_1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(makeAIMessage(""))
      .mockResolvedValueOnce(
        makeAIMessage("Done"),
      );

    const agent = new DeepFactorAgent({
      model: mockModel,
      interruptOn: ["deleteUser"],
    });

    const pendingResult = (await agent.loop(
      "Delete user 123",
    )) as PendingResult;

    // Verify the thread has a synthetic tool_result for the interrupted tool
    const toolResults = pendingResult.thread.events.filter(
      (e) => e.type === "tool_result",
    );
    expect(toolResults.length).toBe(1);
    expect(String(toolResults[0].result)).toContain("not executed");

    await pendingResult.resume("approved");

    // The third invoke call is the resume — capture messages sent to the model
    const resumeCallMessages = mockModel.invoke.mock.calls[2][0];

    // Validate: for every AIMessage with tool_calls, there must be a
    // subsequent ToolMessage with the matching tool_call_id before the
    // next non-ToolMessage
    const toolCallIds = new Set<string>();
    const toolResultIds = new Set<string>();
    for (const msg of resumeCallMessages) {
      if (msg.constructor.name === "AIMessage" && msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          toolCallIds.add(tc.id);
        }
      }
      if (msg.constructor.name === "ToolMessage") {
        toolResultIds.add(msg.tool_call_id);
      }
    }

    // Every tool_call ID must have a matching ToolMessage
    for (const id of toolCallIds) {
      expect(toolResultIds.has(id)).toBe(true);
    }
  });

  it("after resume, the loop continues from where it left off", async () => {
    const mockModel = makeMockModel();
    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: "deleteUser",
              args: { userId: "123" },
              id: "tc_del_1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(makeAIMessage(""))
      .mockResolvedValueOnce(
        makeAIMessage("Continuing after approval"),
      );

    const agent = new DeepFactorAgent({
      model: mockModel,
      interruptOn: ["deleteUser"],
    });

    const pendingResult = (await agent.loop(
      "Delete user 123",
    )) as PendingResult;
    expect(pendingResult.iterations).toBe(1);

    const finalResult = await pendingResult.resume("approved");
    expect(finalResult.iterations).toBe(2);
  });
});

describe("multiple pause/resume cycles", () => {
  it("supports multiple pause/resume within a single run", async () => {
    const mockModel = makeMockModel();
    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: "requestHumanInput",
              args: { question: "Color?", format: "free_text" },
              id: "tc_1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(makeAIMessage("Got it, working on it"))
      .mockResolvedValueOnce(makeAIMessage("All done!"));

    const agent = new DeepFactorAgent({
      model: mockModel,
      tools: [requestHumanInput],
      verifyCompletion: vi
        .fn()
        .mockResolvedValueOnce({
          complete: false,
          reason: "Need more info",
        })
        .mockResolvedValueOnce({ complete: true }),
    });

    const pending1 = (await agent.loop(
      "Multi-step task",
    )) as PendingResult;
    expect(pending1.stopReason).toBe("human_input_needed");

    const finalResult = await pending1.resume("Use blue theme");
    expect(
      ["completed", "stop_condition"].includes(finalResult.stopReason),
    ).toBe(true);
  });
});
