import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";

// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import {
  createClaudeCliProvider,
  messagesToPrompt,
  parseToolCalls,
} from "../../src/providers/claude-cli.js";
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

describe("createClaudeCliProvider", () => {
  it("returns a ModelAdapter with invoke and bindTools", () => {
    const provider = createClaudeCliProvider();
    expect(provider).toBeDefined();
    expect(typeof provider.invoke).toBe("function");
    expect(typeof provider.bindTools).toBe("function");
    expect(isModelAdapter(provider)).toBe(true);
  });

  it("calls claude -p <prompt> --no-input via execFile", async () => {
    simulateExecFile("Hello from Claude CLI");
    const provider = createClaudeCliProvider();

    const result = await provider.invoke([new HumanMessage("Hi")]);

    expect(mockExecFile).toHaveBeenCalledOnce();
    const [file, args] = mockExecFile.mock.calls[0] as any[];
    expect(file).toBe("claude");
    expect(args).toContain("-p");
    expect(args).toContain("--no-input");

    expect(result).toBeInstanceOf(AIMessage);
    expect(result.content).toBe("Hello from Claude CLI");
    expect(result.tool_calls).toEqual([]);
  });

  it("passes --model flag when model option is set", async () => {
    simulateExecFile("Response");
    const provider = createClaudeCliProvider({ model: "sonnet" });

    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
  });

  it("uses custom cliPath", async () => {
    simulateExecFile("Response");
    const provider = createClaudeCliProvider({
      cliPath: "/usr/local/bin/claude-dev",
    });

    await provider.invoke([new HumanMessage("Hi")]);

    const file = (mockExecFile.mock.calls[0] as any[])[0];
    expect(file).toBe("/usr/local/bin/claude-dev");
  });

  it("throws on CLI error", async () => {
    simulateExecFileError("CLI process exited with code 1");
    const provider = createClaudeCliProvider();

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
    const provider = createClaudeCliProvider();

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
    const provider = createClaudeCliProvider();

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
    const provider = createClaudeCliProvider();

    const result = await provider.invoke([new HumanMessage("Calculate and get time")]);

    expect(result.tool_calls).toHaveLength(2);
    expect(result.tool_calls![0].name).toBe("calculator");
    expect(result.tool_calls![1].name).toBe("get_time");
  });

  it("injects tool definitions into prompt when tools bound", async () => {
    simulateExecFile("Plain response");
    const provider = createClaudeCliProvider();

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
    const prompt = args[1]; // -p <prompt>
    expect(prompt).toContain("[Available Tools]");
    expect(prompt).toContain("calculator");
    expect(prompt).toContain("tool_calls");
  });

  it("passes timeout and maxBuffer options", async () => {
    simulateExecFile("Response");
    const provider = createClaudeCliProvider({
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    await provider.invoke([new HumanMessage("Hi")]);

    const opts = (mockExecFile.mock.calls[0] as any[])[2];
    expect(opts.timeout).toBe(60_000);
    expect(opts.maxBuffer).toBe(5 * 1024 * 1024);
  });
});

describe("messagesToPrompt", () => {
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

  it("separates messages with double newlines", () => {
    const messages = [
      new HumanMessage("First"),
      new HumanMessage("Second"),
    ];

    const prompt = messagesToPrompt(messages);
    expect(prompt).toBe("[User]\nFirst\n\n[User]\nSecond");
  });
});

describe("parseToolCalls", () => {
  it("extracts tool calls from a JSON code block", () => {
    const text = `Some text

\`\`\`json
{
  "tool_calls": [
    { "name": "calc", "args": { "x": 1 }, "id": "c1" }
  ]
}
\`\`\`

More text`;

    const result = parseToolCalls(text);
    expect(result).toEqual([{ name: "calc", args: { x: 1 }, id: "c1" }]);
  });

  it("returns empty array when no JSON block present", () => {
    expect(parseToolCalls("Just plain text")).toEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    const text = "```json\n{ invalid json }\n```";
    expect(parseToolCalls(text)).toEqual([]);
  });

  it("assigns default ids when missing", () => {
    const text = '```json\n{"tool_calls": [{"name": "t", "args": {}}]}\n```';
    const result = parseToolCalls(text);
    expect(result[0].id).toBe("call_0");
  });

  it("handles multiple tool calls", () => {
    const text = `\`\`\`json
{
  "tool_calls": [
    { "name": "a", "args": {}, "id": "1" },
    { "name": "b", "args": { "k": "v" }, "id": "2" }
  ]
}
\`\`\``;
    const result = parseToolCalls(text);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("a");
    expect(result[1].name).toBe("b");
    expect(result[1].args).toEqual({ k: "v" });
  });
});

describe("isModelAdapter", () => {
  it("returns true for a ModelAdapter", () => {
    const adapter = createClaudeCliProvider();
    expect(isModelAdapter(adapter)).toBe(true);
  });

  it("returns false for a BaseChatModel-like object with _generate", () => {
    const baseChatModel = {
      invoke: vi.fn(),
      bindTools: vi.fn(),
      _generate: vi.fn(),
    };
    expect(isModelAdapter(baseChatModel)).toBe(false);
  });

  it("returns false for null/undefined/primitives", () => {
    expect(isModelAdapter(null)).toBe(false);
    expect(isModelAdapter(undefined)).toBe(false);
    expect(isModelAdapter("string")).toBe(false);
    expect(isModelAdapter(42)).toBe(false);
  });
});
