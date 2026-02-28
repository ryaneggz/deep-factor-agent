import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";

// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import {
  createCodexCliProvider,
  messagesToPrompt,
  parseToolCalls,
} from "../../src/providers/codex-cli.js";
import { isModelAdapter } from "../../src/providers/types.js";

const mockExecFile = vi.mocked(execFile);

function simulateExecFile(stdout: string) {
  mockExecFile.mockImplementation(
    (_file: any, _args: any, _opts: any, cb: any) => {
      cb(null, stdout, "");
      return {} as any;
    },
  );
}

function simulateExecFileError(message: string) {
  mockExecFile.mockImplementation(
    (_file: any, _args: any, _opts: any, cb: any) => {
      cb(new Error(message), "", "");
      return {} as any;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCodexCliProvider", () => {
  it("returns a ModelAdapter with invoke and bindTools", () => {
    const provider = createCodexCliProvider();
    expect(provider).toBeDefined();
    expect(typeof provider.invoke).toBe("function");
    expect(typeof provider.bindTools).toBe("function");
    expect(isModelAdapter(provider)).toBe(true);
  });

  it("calls codex exec <prompt> --full-auto --sandbox read-only via execFile", async () => {
    simulateExecFile("Hello from Codex CLI");
    const provider = createCodexCliProvider();

    const result = await provider.invoke([new HumanMessage("Hi")]);

    expect(mockExecFile).toHaveBeenCalledOnce();
    const [file, args] = mockExecFile.mock.calls[0] as any[];
    expect(file).toBe("codex");
    expect(args[0]).toBe("exec");
    expect(args).toContain("--full-auto");
    expect(args).toContain("--sandbox");
    expect(args).toContain("read-only");

    expect(result).toBeInstanceOf(AIMessage);
    expect(result.content).toBe("Hello from Codex CLI");
    expect(result.tool_calls).toEqual([]);
  });

  it("passes --model flag when model option is set", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider({ model: "o4-mini" });

    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    expect(args).toContain("--model");
    expect(args).toContain("o4-mini");
  });

  it("uses custom cliPath", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider({
      cliPath: "/usr/local/bin/codex-dev",
    });

    await provider.invoke([new HumanMessage("Hi")]);

    const file = (mockExecFile.mock.calls[0] as any[])[0];
    expect(file).toBe("/usr/local/bin/codex-dev");
  });

  it("throws on CLI error", async () => {
    simulateExecFileError("CLI process exited with code 1");
    const provider = createCodexCliProvider();

    await expect(
      provider.invoke([new HumanMessage("Hi")]),
    ).rejects.toThrow("CLI process exited with code 1");
  });

  it("parses tool calls from JSON code block", async () => {
    const cliOutput = `I need to calculate something.

\`\`\`json
{
  "tool_calls": [
    {
      "name": "calculator",
      "args": { "expression": "2 + 2" },
      "id": "call_1"
    }
  ]
}
\`\`\``;
    simulateExecFile(cliOutput);
    const provider = createCodexCliProvider();

    const result = await provider.invoke([new HumanMessage("What is 2+2?")]);

    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0]).toEqual({
      name: "calculator",
      args: { expression: "2 + 2" },
      id: "call_1",
    });
  });

  it("returns plain text with empty tool_calls when no JSON block", async () => {
    simulateExecFile("The answer is 42.");
    const provider = createCodexCliProvider();

    const result = await provider.invoke([new HumanMessage("What is the meaning of life?")]);

    expect(result.content).toBe("The answer is 42.");
    expect(result.tool_calls).toEqual([]);
  });

  it("handles multiple tool calls in one response", async () => {
    const cliOutput = `\`\`\`json
{
  "tool_calls": [
    { "name": "calculator", "args": { "expression": "2 + 2" }, "id": "call_1" },
    { "name": "get_time", "args": {}, "id": "call_2" }
  ]
}
\`\`\``;
    simulateExecFile(cliOutput);
    const provider = createCodexCliProvider();

    const result = await provider.invoke([new HumanMessage("Calculate and get time")]);

    expect(result.tool_calls).toHaveLength(2);
    expect(result.tool_calls![0].name).toBe("calculator");
    expect(result.tool_calls![1].name).toBe("get_time");
  });

  it("injects tool definitions into prompt when tools bound", async () => {
    simulateExecFile("Plain response");
    const provider = createCodexCliProvider();

    const mockTool = {
      name: "calculator",
      description: "Evaluate math",
      schema: { type: "object", properties: { expr: { type: "string" } } },
      invoke: vi.fn(),
      lc_namespace: ["test"],
    } as any;

    provider.bindTools!([mockTool]);
    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    // args[0] = "exec", args[1] = prompt
    const prompt = args[1];
    expect(prompt).toContain("[Available Tools]");
    expect(prompt).toContain("calculator");
    expect(prompt).toContain("tool_calls");
  });

  it("passes timeout and maxBuffer options", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider({
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    await provider.invoke([new HumanMessage("Hi")]);

    const opts = (mockExecFile.mock.calls[0] as any[])[2];
    expect(opts.timeout).toBe(60_000);
    expect(opts.maxBuffer).toBe(5 * 1024 * 1024);
  });

  it("uses correct CLI argument structure (exec, prompt, flags)", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider({ model: "o4-mini" });

    await provider.invoke([new HumanMessage("Test prompt")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    // Expected: ["exec", <prompt>, "--full-auto", "--sandbox", "read-only", "--model", "o4-mini"]
    expect(args[0]).toBe("exec");
    expect(args[2]).toBe("--full-auto");
    expect(args[3]).toBe("--sandbox");
    expect(args[4]).toBe("read-only");
    expect(args[5]).toBe("--model");
    expect(args[6]).toBe("o4-mini");
  });
});

describe("messagesToPrompt (codex)", () => {
  it("serializes system/human/ai/tool messages", () => {
    const messages = [
      new SystemMessage("You are helpful"),
      new HumanMessage("Hello"),
      new AIMessage("Hi there"),
      new ToolMessage({ tool_call_id: "call_1", content: "result" }),
    ];

    const prompt = messagesToPrompt(messages);

    expect(prompt).toContain("[System]\nYou are helpful");
    expect(prompt).toContain("[User]\nHello");
    expect(prompt).toContain("[Assistant]\nHi there");
    expect(prompt).toContain("[Tool Result]\nresult");
  });
});

describe("parseToolCalls (codex)", () => {
  it("extracts tool calls from a JSON code block", () => {
    const text = `\`\`\`json
{ "tool_calls": [{ "name": "calc", "args": { "x": 1 }, "id": "c1" }] }
\`\`\``;

    const result = parseToolCalls(text);
    expect(result).toEqual([{ name: "calc", args: { x: 1 }, id: "c1" }]);
  });

  it("returns empty array when no JSON block present", () => {
    expect(parseToolCalls("Just plain text")).toEqual([]);
  });
});
