import { describe, expect, it, vi } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { DeepFactorAgent } from "../src/agent.js";
import type { AgentExecutionUpdate } from "../src/types.js";
import type { ModelAdapter, ModelInvocationUpdate } from "../src/providers/types.js";

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

function makeAIMessage(
  content = "Test response",
  options: {
    tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
    usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  } = {},
) {
  return new AIMessage({
    content,
    tool_calls: options.tool_calls ?? [],
    usage_metadata: options.usage ?? {
      input_tokens: 20,
      output_tokens: 10,
      total_tokens: 30,
    },
  });
}

function makeStreamingAdapter(
  invocations: Array<{
    updates?: ModelInvocationUpdate[];
    response: AIMessage;
  }>,
): ModelAdapter {
  let index = 0;

  return {
    invoke: vi.fn(async () => invocations[index++]?.response ?? makeAIMessage("")),
    invokeWithUpdates: vi.fn(async (_messages, onUpdate) => {
      const invocation = invocations[index++];
      if (!invocation) {
        return makeAIMessage("");
      }
      for (const update of invocation.updates ?? []) {
        onUpdate(update);
      }
      return invocation.response;
    }),
    bindTools() {
      return this;
    },
  };
}

describe("DeepFactorAgent update streaming", () => {
  it("emits ordered live updates for tool calls, tool results, assistant output, and completion", async () => {
    const searchTool = tool(async () => "found", {
      name: "search",
      description: "Search for something",
      schema: z.object({ query: z.string() }),
    });
    const mockModel = makeMockModel();
    const updates: AgentExecutionUpdate[] = [];

    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [{ name: "search", args: { query: "repo" }, id: "tool-1" }],
        }),
      )
      .mockResolvedValueOnce(makeAIMessage("Search complete."));

    const agent = new DeepFactorAgent({
      model: mockModel,
      tools: [searchTool],
      streamMode: "updates",
      onUpdate: (update) => updates.push(update),
    });

    const result = await agent.loop("Search the repo");

    expect(result.stopReason).toBe("completed");
    expect(updates[0]?.lastEvent).toMatchObject({
      type: "message",
      role: "user",
      content: "Search the repo",
    });

    const eventTypes = updates
      .map((update) => update.lastEvent?.type)
      .filter((type): type is NonNullable<typeof type> => Boolean(type));

    expect(eventTypes).toContain("tool_call");
    expect(eventTypes).toContain("tool_result");
    expect(eventTypes).toContain("completion");
    expect(eventTypes.indexOf("tool_call")).toBeLessThan(eventTypes.indexOf("tool_result"));
    expect(eventTypes.indexOf("tool_result")).toBeLessThan(eventTypes.lastIndexOf("message"));

    const usageUpdate = updates.find(
      (update) =>
        update.lastEvent == null && update.status === "running" && update.usage.totalTokens === 60,
    );
    expect(usageUpdate).toBeDefined();
    expect(updates.at(-1)).toMatchObject({
      status: "done",
      stopReason: "completed",
    });
  });

  it("emits plan and pending-input snapshots as soon as plan mode pauses", async () => {
    const mockModel = makeMockModel();
    const updates: AgentExecutionUpdate[] = [];

    mockModel.invoke.mockResolvedValueOnce(
      makeAIMessage("<proposed_plan>\n# Plan\n\n1. Inspect\n2. Patch\n</proposed_plan>"),
    );

    const agent = new DeepFactorAgent({
      model: mockModel,
      mode: "plan",
      streamMode: "updates",
      onUpdate: (update) => updates.push(update),
    });

    const result = await agent.loop("Draft a plan");

    expect(result.stopReason).toBe("human_input_needed");
    expect(
      updates.find((update) => {
        const event = update.lastEvent;
        return event?.type === "plan" && event.content.includes("# Plan");
      }),
    ).toBeDefined();
    expect(
      updates.find(
        (update) =>
          update.lastEvent?.type === "human_input_requested" && update.status === "pending_input",
      ),
    ).toBeDefined();
    expect(updates.at(-1)).toMatchObject({
      status: "pending_input",
      stopReason: "human_input_needed",
    });
  });

  it("streams Claude-style tool calls before tool results without duplicating the final assistant text", async () => {
    const searchTool = tool(async () => "found", {
      name: "search",
      description: "Search for something",
      schema: z.object({ query: z.string() }),
    });
    const updates: AgentExecutionUpdate[] = [];
    const model = makeStreamingAdapter([
      {
        updates: [
          {
            type: "tool_call",
            toolCall: { name: "search", id: "tool-1", args: { query: "repo" } },
          },
          {
            type: "usage",
            usage: { inputTokens: 6, outputTokens: 2, totalTokens: 8 },
          },
        ],
        response: makeAIMessage("", {
          tool_calls: [{ name: "search", args: { query: "repo" }, id: "tool-1" }],
          usage: { input_tokens: 6, output_tokens: 2, total_tokens: 8 },
        }),
      },
      {
        updates: [
          {
            type: "assistant_message",
            content: "Search complete.",
          },
          {
            type: "usage",
            usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 },
          },
        ],
        response: makeAIMessage("Search complete.", {
          usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 },
        }),
      },
    ]);

    const agent = new DeepFactorAgent({
      model,
      tools: [searchTool],
      streamMode: "updates",
      onUpdate: (update) => updates.push(update),
    });

    const result = await agent.loop("Search the repo");

    expect(result.stopReason).toBe("completed");
    const toolCallIndex = result.thread.events.findIndex(
      (event) => event.type === "tool_call" && event.toolCallId === "tool-1",
    );
    const toolResultIndex = result.thread.events.findIndex(
      (event) => event.type === "tool_result" && event.toolCallId === "tool-1",
    );
    expect(toolCallIndex).toBeGreaterThan(-1);
    expect(toolResultIndex).toBeGreaterThan(toolCallIndex);
    expect(
      result.thread.events.filter(
        (event) =>
          event.type === "message" &&
          event.role === "assistant" &&
          event.content === "Search complete.",
      ),
    ).toHaveLength(1);

    const usageSnapshots = updates
      .map((update) => update.usage.totalTokens)
      .filter((value) => value > 0);
    expect(usageSnapshots).toContain(8);
    expect(usageSnapshots).toContain(15);
  });

  it("shows approval-gated tool calls before the pending approval pause", async () => {
    const writeTool = tool(async () => "written", {
      name: "write_file",
      description: "Write a file",
      schema: z.object({ path: z.string(), content: z.string() }),
    }) as ReturnType<typeof tool> & { metadata?: { mutatesState: boolean } };
    writeTool.metadata = { mutatesState: true };

    const model = makeStreamingAdapter([
      {
        updates: [
          {
            type: "tool_call",
            toolCall: {
              name: "write_file",
              id: "tool-approve",
              args: { path: "a.txt", content: "hello" },
            },
          },
        ],
        response: makeAIMessage("", {
          tool_calls: [
            {
              name: "write_file",
              id: "tool-approve",
              args: { path: "a.txt", content: "hello" },
            },
          ],
        }),
      },
    ]);

    const agent = new DeepFactorAgent({
      model,
      tools: [writeTool],
      mode: "approve",
      streamMode: "updates",
    });

    const result = await agent.loop("Write the file");

    expect(result.stopReason).toBe("human_input_needed");
    const toolCallIndex = result.thread.events.findIndex(
      (event) => event.type === "tool_call" && event.toolCallId === "tool-approve",
    );
    const approvalIndex = result.thread.events.findIndex(
      (event) => event.type === "human_input_requested" && event.kind === "approval",
    );
    expect(toolCallIndex).toBeGreaterThan(-1);
    expect(approvalIndex).toBeGreaterThan(toolCallIndex);
  });

  it("emits plan events live for provider-native updates without leaving duplicate assistant text", async () => {
    const updates: AgentExecutionUpdate[] = [];
    const planText = "<proposed_plan>\n# Plan\n\n1. Inspect\n2. Patch\n</proposed_plan>";
    const model = makeStreamingAdapter([
      {
        updates: [
          {
            type: "assistant_message",
            content: planText,
          },
        ],
        response: makeAIMessage(planText),
      },
    ]);

    const agent = new DeepFactorAgent({
      model,
      mode: "plan",
      streamMode: "updates",
      onUpdate: (update) => updates.push(update),
    });

    const result = await agent.loop("Draft a plan");

    expect(result.stopReason).toBe("human_input_needed");
    expect(
      updates.find(
        (update) =>
          update.lastEvent?.type === "plan" && update.lastEvent.content.includes("# Plan"),
      ),
    ).toBeDefined();
    expect(
      result.thread.events.filter(
        (event) => event.type === "message" && event.role === "assistant",
      ),
    ).toHaveLength(0);
    expect(
      result.thread.events.filter(
        (event) => event.type === "plan" && event.content.includes("# Plan"),
      ),
    ).toHaveLength(1);
  });

  it("surfaces streaming provider errors immediately and preserves the single error event for the failed iteration", async () => {
    const updates: AgentExecutionUpdate[] = [];
    const model: ModelAdapter = {
      invoke: vi.fn(),
      invokeWithUpdates: vi.fn(async (_messages, onUpdate) => {
        onUpdate({ type: "error", error: "Claude stream parse failed" });
        throw new Error("Claude stream parse failed");
      }),
      bindTools() {
        return this;
      },
    };

    const agent = new DeepFactorAgent({
      model,
      streamMode: "updates",
      onUpdate: (update) => updates.push(update),
    });

    const result = await agent.loop("Hello");

    expect(result.stopReason).toBe("max_errors");
    expect(
      updates.find(
        (update) =>
          update.lastEvent?.type === "error" && update.lastEvent.error.includes("parse failed"),
      ),
    ).toBeDefined();
    const iterationZeroErrors = result.thread.events.filter(
      (event) => event.type === "error" && event.iteration === 1,
    );
    expect(iterationZeroErrors).toHaveLength(1);
  });

  it("preserves parallelGroup metadata on live tool result updates", async () => {
    const readFileTool = tool(async ({ path }: { path: string }) => `read:${path}`, {
      name: "read_file",
      description: "Read a file",
      schema: z.object({ path: z.string() }),
    });
    const mockModel = makeMockModel();
    const updates: AgentExecutionUpdate[] = [];

    mockModel.invoke
      .mockResolvedValueOnce(
        makeAIMessage("", {
          tool_calls: [
            { name: "read_file", args: { path: "a.txt" }, id: "tool-1" },
            { name: "read_file", args: { path: "b.txt" }, id: "tool-2" },
          ],
        }),
      )
      .mockResolvedValueOnce(makeAIMessage("Done reading."));

    const agent = new DeepFactorAgent({
      model: mockModel,
      tools: [readFileTool],
      parallelToolCalls: true,
      streamMode: "updates",
      onUpdate: (update) => updates.push(update),
    });

    await agent.loop("Read both files");

    const resultUpdates = updates
      .map((update) => update.lastEvent)
      .filter((event): event is NonNullable<typeof event> => event?.type === "tool_result");

    expect(resultUpdates).toHaveLength(2);
    expect(resultUpdates[0]?.parallelGroup).toBeDefined();
    expect(resultUpdates[0]?.parallelGroup).toBe(resultUpdates[1]?.parallelGroup);
  });

  it("ignores subscriber callback failures", async () => {
    const mockModel = makeMockModel();

    mockModel.invoke.mockResolvedValueOnce(makeAIMessage("Recovered."));

    const agent = new DeepFactorAgent({
      model: mockModel,
      streamMode: "updates",
      onUpdate: () => {
        throw new Error("UI callback failed");
      },
    });

    const result = await agent.loop("Hello");

    expect(result.stopReason).toBe("completed");
    expect(result.response).toBe("Recovered.");
  });
});
