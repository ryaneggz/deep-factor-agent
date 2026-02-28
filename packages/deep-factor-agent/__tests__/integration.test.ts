import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createDeepFactorAgent } from "../src/create-agent.js";
import { maxIterations, maxTokens } from "../src/stop-conditions.js";
import { requestHumanInput } from "../src/human-in-the-loop.js";
import type { PendingResult, AgentMiddleware } from "../src/types.js";

function makeMockModel() {
  const model: any = {
    invoke: vi.fn(),
    bindTools: vi.fn(),
    stream: vi.fn(),
    _generate: vi.fn(),
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
  content = "Response",
  options: {
    tool_calls?: Array<{
      name: string;
      args: Record<string, any>;
      id: string;
    }>;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };
  } = {},
) {
  return new AIMessage({
    content,
    tool_calls: options.tool_calls ?? [],
    usage_metadata: options.usage ?? defaultUsage,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Integration: full workflow", () => {
  it("createDeepFactorAgent -> loop() with tools, middleware, stop conditions", async () => {
    const searchDocsTool = tool(
      async (_args: { query: string }) => JSON.stringify({ docs: ["found result"] }),
      {
        name: "searchDocs",
        description: "Search documentation",
        schema: z.object({ query: z.string() }),
      },
    );

    const mockModel = makeMockModel();
    // First invoke: model calls searchDocs tool
    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: "searchDocs",
              args: { query: "typescript" },
              id: "tc_1",
            },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        }),
      )
      // Second invoke: model returns final text after tool result
      .mockResolvedValueOnce(
        makeAIMessage("Task completed", {
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        }),
      );

    const agent = createDeepFactorAgent({
      model: mockModel,
      tools: [searchDocsTool],
      stopWhen: [maxIterations(5), maxTokens(50000)],
    });

    const result = await agent.loop("Search for TypeScript docs");
    expect(result.stopReason).toBe("completed");
    expect(result.response).toBe("Task completed");
    expect(result.usage.inputTokens).toBe(200);

    const toolCalls = result.thread.events.filter((e) => e.type === "tool_call");
    const toolResults = result.thread.events.filter((e) => e.type === "tool_result");
    expect(toolCalls.length).toBe(1);
    expect(toolResults.length).toBe(1);
  });

  it("multi-iteration with verification feedback", async () => {
    const mockModel = makeMockModel();
    mockModel.invoke
      .mockResolvedValueOnce(makeAIMessage("Draft 1"))
      .mockResolvedValueOnce(makeAIMessage("Draft 2 - improved"));

    const agent = createDeepFactorAgent({
      model: mockModel,
      verifyCompletion: vi
        .fn()
        .mockResolvedValueOnce({
          complete: false,
          reason: "Missing error handling",
        })
        .mockResolvedValueOnce({ complete: true }),
      middleware: [],
    });

    const result = await agent.loop("Write a function");
    expect(result.stopReason).toBe("completed");
    expect(result.iterations).toBe(2);
    expect(result.response).toBe("Draft 2 - improved");

    const feedbackMessages = result.thread.events.filter(
      (e) => e.type === "message" && e.role === "user" && e.content.includes("Verification failed"),
    );
    expect(feedbackMessages.length).toBe(1);
  });

  it("human-in-the-loop: pause, resume, continue", async () => {
    const mockModel = makeMockModel();
    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: "requestHumanInput",
              args: { question: "Which DB to use?", format: "free_text" },
              id: "tc_hi",
            },
          ],
          usage: {
            input_tokens: 50,
            output_tokens: 25,
            total_tokens: 75,
          },
        }),
      )
      .mockResolvedValueOnce(makeAIMessage("Set up PostgreSQL as requested"));

    const agent = createDeepFactorAgent({
      model: mockModel,
      tools: [requestHumanInput],
      middleware: [],
    });

    const pending = (await agent.loop("Set up database")) as PendingResult;
    expect(pending.stopReason).toBe("human_input_needed");

    const final = await pending.resume("PostgreSQL");
    expect(final.stopReason).toBe("completed");
    expect(final.response).toBe("Set up PostgreSQL as requested");

    const requested = final.thread.events.filter((e) => e.type === "human_input_requested");
    const received = final.thread.events.filter((e) => e.type === "human_input_received");
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

    const mockModel = makeMockModel();
    mockModel.invoke.mockResolvedValueOnce(makeAIMessage());

    const agent = createDeepFactorAgent({
      model: mockModel,
      middleware: [mw1, mw2],
    });

    await agent.loop("Test middleware order");
    expect(order).toEqual(["before1", "before2", "after1", "after2"]);
  });

  it("token usage aggregation across iterations", async () => {
    const mockModel = makeMockModel();
    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("r1", {
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        }),
      )
      .mockResolvedValueOnce(
        makeAIMessage("r2", {
          usage: {
            input_tokens: 200,
            output_tokens: 100,
            total_tokens: 300,
          },
        }),
      )
      .mockResolvedValueOnce(
        makeAIMessage("r3", {
          usage: {
            input_tokens: 300,
            output_tokens: 150,
            total_tokens: 450,
          },
        }),
      );

    const agent = createDeepFactorAgent({
      model: mockModel,
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

  it("todoMiddleware write-then-read round-trip through agent loop", async () => {
    const mockModel = makeMockModel();

    const todosPayload = [
      { id: "t1", text: "Design schema", status: "done" },
      { id: "t2", text: "Write tests", status: "in_progress" },
    ];

    // Iteration 1: model calls write_todos
    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: "write_todos",
              args: { todos: todosPayload },
              id: "tc_write",
            },
          ],
        }),
      )
      // After write_todos result, model calls read_todos
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            {
              name: "read_todos",
              args: {},
              id: "tc_read",
            },
          ],
        }),
      )
      // After read_todos result, model returns final response
      .mockResolvedValueOnce(makeAIMessage("Todos written and verified"));

    // Use createDeepFactorAgent which adds todoMiddleware by default
    const agent = createDeepFactorAgent({
      model: mockModel,
    });

    const result = await agent.loop("Write and verify todos");
    expect(result.stopReason).toBe("completed");

    // Verify thread.metadata.todos was set by agent.ts interception
    expect(result.thread.metadata.todos).toEqual(todosPayload);

    // Verify read_todos returned the written data (check tool_result events)
    const toolResults = result.thread.events.filter((e) => e.type === "tool_result");
    expect(toolResults.length).toBe(2);

    // The second tool_result is from read_todos — it should contain the written todos
    const readResult = JSON.parse(toolResults[1].result);
    expect(readResult.todos).toEqual(todosPayload);
  });

  it("all tests use mock models - no real API calls", () => {
    const model = makeMockModel();
    expect(vi.isMockFunction(model.invoke)).toBe(true);
  });
});
