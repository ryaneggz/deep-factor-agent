import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeepFactorAgent } from "../src/agent.js";
import { maxIterations } from "../src/stop-conditions.js";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

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

describe("Thread Retention", () => {
  describe("Standard mode retains tool calls across iterations", () => {
    it("buildMessages produces AIMessage with tool_calls and ToolMessage for tool events", async () => {
      const mockModel = makeMockModel();

      // Iteration 1: model calls a tool
      mockModel.invoke
        .mockResolvedValueOnce(
          makeAIMessage("", {
            tool_calls: [{ name: "search", args: { q: "test" }, id: "tc_1" }],
          }),
        )
        .mockResolvedValueOnce(makeAIMessage("Found results"))
        // Iteration 2: model returns final
        .mockResolvedValueOnce(makeAIMessage("Summary complete"));

      const searchTool: any = {
        name: "search",
        invoke: vi.fn().mockResolvedValue("search result data"),
        schema: { parse: (x: any) => x },
      };

      const agent = new DeepFactorAgent({
        model: mockModel,
        tools: [searchTool],
        contextMode: "standard",
        verifyCompletion: async ({ iteration }) =>
          iteration >= 2
            ? { complete: true }
            : { complete: false, reason: "Continue" },
        stopWhen: [maxIterations(5)],
      });

      const result = await agent.loop("Search for something");
      expect(result.response).toBe("Summary complete");

      // On iteration 2, the model should receive the tool_call and tool_result from iteration 1
      // as individual AIMessage/ToolMessage objects
      const iter2Call = mockModel.invoke.mock.calls[2][0];

      // Find the AIMessage that has tool_calls
      const toolCallMsg = iter2Call.find(
        (m: any) =>
          m.constructor.name === "AIMessage" &&
          m.tool_calls &&
          m.tool_calls.length > 0,
      );
      expect(toolCallMsg).toBeDefined();
      expect(toolCallMsg.tool_calls[0].name).toBe("search");
      expect(toolCallMsg.tool_calls[0].id).toBe("tc_1");

      // Find the ToolMessage
      const toolResultMsg = iter2Call.find(
        (m: any) => m.constructor.name === "ToolMessage",
      );
      expect(toolResultMsg).toBeDefined();
      expect(toolResultMsg.tool_call_id).toBe("tc_1");
      expect(toolResultMsg.content).toContain("search result data");
    });
  });

  describe("Standard mode retains errors across iterations", () => {
    it("buildMessages produces HumanMessage with error text for error events", async () => {
      const mockModel = makeMockModel();

      // Iteration 1: throws an error
      mockModel.invoke
        .mockRejectedValueOnce(new Error("API timeout"))
        // Iteration 2: succeeds
        .mockResolvedValueOnce(makeAIMessage("Recovered successfully"));

      const agent = new DeepFactorAgent({
        model: mockModel,
        contextMode: "standard",
        stopWhen: [maxIterations(3)],
      });

      const result = await agent.loop("Do something");
      expect(result.response).toBe("Recovered successfully");

      // On iteration 2, the model should see the error from iteration 1
      const iter2Call = mockModel.invoke.mock.calls[1][0];
      const errorMsg = iter2Call.find(
        (m: any) =>
          m.constructor.name === "HumanMessage" &&
          typeof m.content === "string" &&
          m.content.includes("[Error"),
      );
      expect(errorMsg).toBeDefined();
      expect(errorMsg.content).toContain("recoverable");
      expect(errorMsg.content).toContain("API timeout");
    });
  });

  describe("XML mode retains all event types across iterations", () => {
    it("XML HumanMessage contains all event types from prior iterations", async () => {
      const mockModel = makeMockModel();

      // Iteration 1: model calls a tool
      mockModel.invoke
        .mockResolvedValueOnce(
          makeAIMessage("", {
            tool_calls: [{ name: "calc", args: { x: 1 }, id: "tc_1" }],
          }),
        )
        .mockResolvedValueOnce(makeAIMessage("Result is 1"))
        // Iteration 2: returns final
        .mockResolvedValueOnce(makeAIMessage("All done"));

      const calcTool: any = {
        name: "calc",
        invoke: vi.fn().mockResolvedValue("42"),
        schema: { parse: (x: any) => x },
      };

      const agent = new DeepFactorAgent({
        model: mockModel,
        tools: [calcTool],
        contextMode: "xml",
        verifyCompletion: async ({ iteration }) =>
          iteration >= 2
            ? { complete: true }
            : { complete: false, reason: "Continue" },
        stopWhen: [maxIterations(5)],
      });

      const result = await agent.loop("Calculate something");
      expect(result.response).toBe("All done");

      // On iteration 2, XML should contain all prior events
      const iter2Call = mockModel.invoke.mock.calls[2][0];
      const xmlMsg = iter2Call.find(
        (m: any) => m.constructor.name === "HumanMessage",
      );
      expect(xmlMsg).toBeDefined();

      const xml = xmlMsg.content;
      expect(xml).toContain("<thread>");
      expect(xml).toContain("</thread>");
      expect(xml).toContain('type="human"'); // user message
      expect(xml).toContain('type="tool_input"'); // tool call
      expect(xml).toContain('type="tool_output"'); // tool result
      expect(xml).toContain('type="ai"'); // assistant message
    });
  });

  describe("Multi-iteration loop preserves tool history (standard mode)", () => {
    it("model receives prior tool calls on iteration 2", async () => {
      const mockModel = makeMockModel();

      // Iteration 1: tool call + response
      mockModel.invoke
        .mockResolvedValueOnce(
          makeAIMessage("", {
            tool_calls: [
              { name: "read_file", args: { path: "/a.txt" }, id: "tc_1" },
            ],
          }),
        )
        .mockResolvedValueOnce(makeAIMessage("File read"))
        // Iteration 2: another tool call + response
        .mockResolvedValueOnce(
          makeAIMessage("", {
            tool_calls: [
              { name: "write_file", args: { path: "/b.txt", data: "hi" }, id: "tc_2" },
            ],
          }),
        )
        .mockResolvedValueOnce(makeAIMessage("File written"))
        // Iteration 3: final
        .mockResolvedValueOnce(makeAIMessage("Complete"));

      const readTool: any = {
        name: "read_file",
        invoke: vi.fn().mockResolvedValue("file contents"),
        schema: { parse: (x: any) => x },
      };
      const writeTool: any = {
        name: "write_file",
        invoke: vi.fn().mockResolvedValue("ok"),
        schema: { parse: (x: any) => x },
      };

      const agent = new DeepFactorAgent({
        model: mockModel,
        tools: [readTool, writeTool],
        contextMode: "standard",
        verifyCompletion: async ({ iteration }) =>
          iteration >= 3
            ? { complete: true }
            : { complete: false, reason: "Keep going" },
        stopWhen: [maxIterations(10)],
      });

      const result = await agent.loop("Read then write");
      expect(result.iterations).toBe(3);

      // On iteration 3, model should see tool events from both iteration 1 and 2
      const iter3Call = mockModel.invoke.mock.calls[4][0];

      // Count AIMessages with tool_calls
      const toolCallMsgs = iter3Call.filter(
        (m: any) =>
          m.constructor.name === "AIMessage" &&
          m.tool_calls &&
          m.tool_calls.length > 0,
      );
      expect(toolCallMsgs.length).toBeGreaterThanOrEqual(2);

      // Count ToolMessages
      const toolResultMsgs = iter3Call.filter(
        (m: any) => m.constructor.name === "ToolMessage",
      );
      expect(toolResultMsgs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Multi-iteration loop preserves tool history (XML mode)", () => {
    it("model receives prior tool events as XML on iteration 2", async () => {
      const mockModel = makeMockModel();

      // Iteration 1: tool call + response
      mockModel.invoke
        .mockResolvedValueOnce(
          makeAIMessage("", {
            tool_calls: [
              { name: "search", args: { q: "test" }, id: "tc_1" },
            ],
          }),
        )
        .mockResolvedValueOnce(makeAIMessage("Found"))
        // Iteration 2: final
        .mockResolvedValueOnce(makeAIMessage("Done"));

      const searchTool: any = {
        name: "search",
        invoke: vi.fn().mockResolvedValue("results"),
        schema: { parse: (x: any) => x },
      };

      const agent = new DeepFactorAgent({
        model: mockModel,
        tools: [searchTool],
        contextMode: "xml",
        verifyCompletion: async ({ iteration }) =>
          iteration >= 2
            ? { complete: true }
            : { complete: false, reason: "Keep going" },
        stopWhen: [maxIterations(5)],
      });

      const result = await agent.loop("Search please");
      expect(result.iterations).toBe(2);

      // On iteration 2, XML should contain events from iteration 1
      const iter2Call = mockModel.invoke.mock.calls[2][0];
      const xmlMsg = iter2Call.find(
        (m: any) => m.constructor.name === "HumanMessage",
      );
      const xml = xmlMsg.content;

      // Should contain tool events from iteration 1
      expect(xml).toContain('type="tool_input"');
      expect(xml).toContain('name="search"');
      expect(xml).toContain('type="tool_output"');
    });
  });

  describe("Standard and XML modes produce equivalent information", () => {
    it("both modes preserve the same tool interaction data", async () => {
      const makeAgent = (mode: "standard" | "xml") => {
        const mockModel = makeMockModel();

        // Same sequence: tool call then final response
        mockModel.invoke
          .mockResolvedValueOnce(
            makeAIMessage("", {
              tool_calls: [{ name: "calc", args: { n: 5 }, id: "tc_1" }],
            }),
          )
          .mockResolvedValueOnce(makeAIMessage("Result"))
          .mockResolvedValueOnce(makeAIMessage("Final"));

        const calcTool: any = {
          name: "calc",
          invoke: vi.fn().mockResolvedValue("25"),
          schema: { parse: (x: any) => x },
        };

        const agent = new DeepFactorAgent({
          model: mockModel,
          tools: [calcTool],
          contextMode: mode,
          verifyCompletion: async ({ iteration }) =>
            iteration >= 2
              ? { complete: true }
              : { complete: false, reason: "Continue" },
          stopWhen: [maxIterations(5)],
        });

        return { agent, mockModel };
      };

      // Run both modes
      const standard = makeAgent("standard");
      const xml = makeAgent("xml");

      const stdResult = await standard.agent.loop("Calc 5");
      const xmlResult = await xml.agent.loop("Calc 5");

      // Both should produce the same thread events
      expect(stdResult.thread.events.length).toBe(xmlResult.thread.events.length);

      // Both should have tool_call and tool_result events
      const stdToolCalls = stdResult.thread.events.filter(
        (e) => e.type === "tool_call",
      );
      const xmlToolCalls = xmlResult.thread.events.filter(
        (e) => e.type === "tool_call",
      );
      expect(stdToolCalls.length).toBe(xmlToolCalls.length);

      const stdToolResults = stdResult.thread.events.filter(
        (e) => e.type === "tool_result",
      );
      const xmlToolResults = xmlResult.thread.events.filter(
        (e) => e.type === "tool_result",
      );
      expect(stdToolResults.length).toBe(xmlToolResults.length);

      // Both should complete with same response
      expect(stdResult.response).toBe(xmlResult.response);
    });
  });
});
