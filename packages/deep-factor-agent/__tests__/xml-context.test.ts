import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeepFactorAgent } from "../src/agent.js";
import { createDeepFactorAgent } from "../src/create-agent.js";
import { maxIterations } from "../src/stop-conditions.js";
import { AIMessage } from "@langchain/core/messages";

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

describe("XML Context Mode", () => {
  describe("buildXmlMessages dispatch", () => {
    it("uses standard mode by default", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage("Done"));

      const agent = new DeepFactorAgent({
        model: mockModel,
        stopWhen: [maxIterations(1)],
      });

      const result = await agent.loop("Hello");
      expect(result.response).toBe("Done");

      // In standard mode, the model receives individual messages
      const invokeCall = mockModel.invoke.mock.calls[0][0];
      // Should have at least a HumanMessage for "Hello"
      const humanMsg = invokeCall.find(
        (m: any) => m.constructor.name === "HumanMessage",
      );
      expect(humanMsg).toBeDefined();
      // Standard mode does NOT wrap in <thread> XML
      expect(humanMsg.content).toBe("Hello");
    });

    it("uses XML mode when contextMode is xml", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage("Done"));

      const agent = new DeepFactorAgent({
        model: mockModel,
        stopWhen: [maxIterations(1)],
        contextMode: "xml",
      });

      const result = await agent.loop("Hello");
      expect(result.response).toBe("Done");

      // In XML mode, the model receives a SystemMessage + HumanMessage(xml)
      const invokeCall = mockModel.invoke.mock.calls[0][0];
      const humanMsg = invokeCall.find(
        (m: any) => m.constructor.name === "HumanMessage",
      );
      expect(humanMsg).toBeDefined();
      // XML mode wraps everything in <thread>
      expect(humanMsg.content).toContain("<thread>");
      expect(humanMsg.content).toContain("</thread>");
      expect(humanMsg.content).toContain("Hello");
    });

    it("XML mode produces SystemMessage + HumanMessage(xml) structure", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage("Done"));

      const agent = new DeepFactorAgent({
        model: mockModel,
        instructions: "Be helpful",
        stopWhen: [maxIterations(1)],
        contextMode: "xml",
      });

      await agent.loop("Hello");

      const invokeCall = mockModel.invoke.mock.calls[0][0];
      // First message should be SystemMessage
      expect(invokeCall[0].constructor.name).toBe("SystemMessage");
      expect(invokeCall[0].content).toContain("Be helpful");
      // Second message should be HumanMessage with XML
      expect(invokeCall[1].constructor.name).toBe("HumanMessage");
      expect(invokeCall[1].content).toContain("<thread>");
    });
  });

  describe("factory default", () => {
    it("defaults contextMode to standard", async () => {
      const mockModel = makeMockModel();
      mockModel.invoke.mockResolvedValueOnce(makeAIMessage("Done"));

      const agent = createDeepFactorAgent({
        model: mockModel,
      });

      const result = await agent.loop("Hello");
      expect(result.response).toBe("Done");

      // Standard mode — no XML wrapping
      const invokeCall = mockModel.invoke.mock.calls[0][0];
      const humanMsg = invokeCall.find(
        (m: any) => m.constructor.name === "HumanMessage",
      );
      expect(humanMsg).toBeDefined();
      expect(humanMsg.content).toBe("Hello");
    });
  });

  describe("XML mode includes all event types", () => {
    it("XML HumanMessage contains tool events from prior iteration", async () => {
      const mockModel = makeMockModel();

      // Iteration 1: model calls a tool, then responds
      mockModel.invoke
        .mockResolvedValueOnce(
          makeAIMessage("", {
            tool_calls: [{ name: "search", args: { q: "test" }, id: "tc_1" }],
          }),
        )
        .mockResolvedValueOnce(makeAIMessage("Found it"))
        // Iteration 2: model returns final
        .mockResolvedValueOnce(makeAIMessage("All done"));

      const searchTool: any = {
        name: "search",
        invoke: vi.fn().mockResolvedValue("result data"),
        schema: { parse: (x: any) => x },
      };

      const agent = new DeepFactorAgent({
        model: mockModel,
        tools: [searchTool],
        contextMode: "xml",
        verifyCompletion: async ({ iteration }) =>
          iteration >= 2
            ? { complete: true }
            : { complete: false, reason: "Continue" },
        stopWhen: [maxIterations(5)],
      });

      const result = await agent.loop("Find something");
      expect(result.response).toBe("All done");

      // On iteration 2, the XML should contain the tool_call and tool_result from iteration 1
      // The 3rd invoke call is iteration 2's first call
      const iter2Call = mockModel.invoke.mock.calls[2][0];
      const xmlMsg = iter2Call.find(
        (m: any) => m.constructor.name === "HumanMessage",
      );
      expect(xmlMsg).toBeDefined();
      expect(xmlMsg.content).toContain('type="tool_input"');
      expect(xmlMsg.content).toContain('type="tool_output"');
      expect(xmlMsg.content).toContain("search");
    });
  });
});
