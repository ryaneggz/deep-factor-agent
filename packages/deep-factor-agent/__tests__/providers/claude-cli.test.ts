import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";

// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

import { execFile, spawn } from "node:child_process";
import { createClaudeCliProvider } from "../../src/providers/claude-cli.js";
import { isModelAdapter } from "../../src/providers/types.js";

const mockExecFile = vi.mocked(execFile);
const mockSpawn = vi.mocked(spawn);

function makeJsonOutput(
  result: string,
  usage: { input_tokens: number; output_tokens: number } = {
    input_tokens: 12,
    output_tokens: 8,
  },
  extra: Record<string, unknown> = {},
) {
  return JSON.stringify({
    result,
    stop_reason: "end_turn",
    session_id: "session_123",
    usage,
    ...extra,
  });
}

function simulateExecFile(stdout: string) {
  mockExecFile.mockImplementation((_file: any, _args: any, _opts: any, cb: any) => {
    cb(null, stdout, "");
    return {} as any;
  });
}

function simulateExecFileError(message: string, stderr = "") {
  mockExecFile.mockImplementation((_file: any, _args: any, _opts: any, cb: any) => {
    cb(new Error(message), "", stderr);
    return {} as any;
  });
}

function simulateSpawnStream(chunks: string[], options?: { code?: number; stderr?: string }) {
  mockSpawn.mockImplementationOnce((_file: any, _args: any, _opts: any) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();

    queueMicrotask(() => {
      for (const chunk of chunks) {
        child.stdout.write(chunk);
      }
      if (options?.stderr) {
        child.stderr.write(options.stderr);
      }
      child.stdout.end();
      child.stderr.end();
      child.emit("close", options?.code ?? 0);
    });

    return child as any;
  });
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

  it("calls claude with JSON output mode via execFile", async () => {
    simulateExecFile(makeJsonOutput("Hello from Claude CLI"));
    const provider = createClaudeCliProvider();

    const result = await provider.invoke([new HumanMessage("Hi")]);

    expect(mockExecFile).toHaveBeenCalledOnce();
    const [file, args] = mockExecFile.mock.calls[0] as any[];
    expect(file).toBe("claude");
    expect(args).toEqual([
      "--print",
      "--output-format",
      "json",
      "--tools",
      "",
      "--permission-mode",
      "bypassPermissions",
      '<thread>\n  <event type="human" id="0" iteration="0">Hi</event>\n</thread>',
    ]);

    expect(result).toBeInstanceOf(AIMessage);
    expect(result.content).toBe("Hello from Claude CLI");
    expect(result.tool_calls).toEqual([]);
  });

  it("uses XML encoding by default (prompt contains <thread>)", async () => {
    simulateExecFile(makeJsonOutput("Response"));
    const provider = createClaudeCliProvider();

    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    const prompt = args[7];
    expect(prompt).toContain("<thread>");
    expect(prompt).toContain('<event type="human"');
    expect(prompt).not.toContain("[User]");
  });

  it("uses text encoding when inputEncoding: 'text'", async () => {
    simulateExecFile(makeJsonOutput("Response"));
    const provider = createClaudeCliProvider({ inputEncoding: "text" });

    await provider.invoke([new SystemMessage("Be concise."), new HumanMessage("What is 2+2?")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    const prompt = args[7];
    expect(prompt).toContain("[System]");
    expect(prompt).toContain("[User]");
    expect(prompt).not.toContain("<thread>");
  });

  it("passes --model flag when model option is set", async () => {
    simulateExecFile(makeJsonOutput("Response"));
    const provider = createClaudeCliProvider({ model: "sonnet" });

    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    expect(args).toEqual([
      "--print",
      "--output-format",
      "json",
      "--tools",
      "",
      "--permission-mode",
      "bypassPermissions",
      "--model",
      "sonnet",
      '<thread>\n  <event type="human" id="0" iteration="0">Hi</event>\n</thread>',
    ]);
  });

  it("passes the configured Claude permission mode", async () => {
    simulateExecFile(makeJsonOutput("Response"));
    const provider = createClaudeCliProvider({ permissionMode: "plan" });

    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    expect(args).toContain("--permission-mode");
    expect(args).toContain("plan");
  });

  it("disables built-in Claude tools by default", async () => {
    simulateExecFile(makeJsonOutput("Response"));
    const provider = createClaudeCliProvider();

    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    expect(args).toContain("--tools");
    expect(args).toContain("");
  });

  it("uses custom cliPath", async () => {
    simulateExecFile(makeJsonOutput("Response"));
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

    await expect(provider.invoke([new HumanMessage("Hi")])).rejects.toThrow(
      "Claude CLI invocation failed (claude --print --output-format json --tools  --permission-mode bypassPermissions): CLI process exited with code 1",
    );
  });

  it("includes Claude stderr in provider failures", async () => {
    simulateExecFileError("CLI process exited with code 1", "Permission denied by policy");
    const provider = createClaudeCliProvider();

    await expect(provider.invoke([new HumanMessage("Hi")])).rejects.toThrow(
      "Permission denied by policy",
    );
  });

  it("parses tool calls from the JSON envelope result body", async () => {
    const cliOutput = makeJsonOutput(`I need to calculate something.

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
\`\`\``);
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
    simulateExecFile(makeJsonOutput("The answer is 42."));
    const provider = createClaudeCliProvider();

    const result = await provider.invoke([new HumanMessage("What is the meaning of life?")]);

    expect(result.content).toBe("The answer is 42.");
    expect(result.tool_calls).toEqual([]);
  });

  it("attaches usage_metadata from Claude CLI usage fields", async () => {
    simulateExecFile(
      makeJsonOutput("The answer is 42.", {
        input_tokens: 21,
        output_tokens: 9,
      }),
    );
    const provider = createClaudeCliProvider();

    const result = await provider.invoke([new HumanMessage("What is the meaning of life?")]);

    expect((result as AIMessage & { usage_metadata?: unknown }).usage_metadata).toEqual({
      input_tokens: 21,
      output_tokens: 9,
      total_tokens: 30,
    });
  });

  it("attaches Claude response metadata from the JSON envelope", async () => {
    simulateExecFile(
      makeJsonOutput(
        "The answer is 42.",
        {
          input_tokens: 21,
          output_tokens: 9,
        },
        {
          model: "claude-sonnet-4-20250514",
          permission_denials: [{ tool: "Bash", reason: "blocked" }],
        },
      ),
    );
    const provider = createClaudeCliProvider({ permissionMode: "plan", model: "sonnet" });

    const result = await provider.invoke([new HumanMessage("What is the meaning of life?")]);

    expect((result as AIMessage & { response_metadata?: unknown }).response_metadata).toEqual({
      session_id: "session_123",
      stop_reason: "end_turn",
      permission_mode: "plan",
      model: "claude-sonnet-4-20250514",
      permission_denials: [{ tool: "Bash", reason: "blocked" }],
    });
  });

  it("handles multiple tool calls in one response", async () => {
    const cliOutput = makeJsonOutput(`\`\`\`json
{
  "tool_calls": [
    { "name": "calculator", "args": { "expression": "2 + 2" }, "id": "call_1" },
    { "name": "get_time", "args": {}, "id": "call_2" }
  ]
}
\`\`\``);
    simulateExecFile(cliOutput);
    const provider = createClaudeCliProvider();

    const result = await provider.invoke([new HumanMessage("Calculate and get time")]);

    expect(result.tool_calls).toHaveLength(2);
    expect(result.tool_calls![0].name).toBe("calculator");
    expect(result.tool_calls![1].name).toBe("get_time");
  });

  it("injects tool definitions into prompt when tools bound", async () => {
    simulateExecFile(makeJsonOutput("Plain response"));
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
    const prompt = args[7];
    expect(prompt).toContain("[Available Tools]");
    expect(prompt).toContain("calculator");
    expect(prompt).toContain("tool_calls");
  });

  it("serializes Zod schemas as JSON Schema (not Zod internals)", async () => {
    simulateExecFile(makeJsonOutput("Plain response"));
    const provider = createClaudeCliProvider();

    const calcTool = tool(async ({ expression }: { expression: string }) => expression, {
      name: "calculator",
      description: "Evaluate math",
      schema: z.object({
        expression: z.string().describe("The math expression"),
      }),
    });

    provider.bindTools!([calcTool]);
    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    const prompt = args[7];
    // Should contain JSON Schema properties, not Zod internals
    expect(prompt).toContain('"type": "object"');
    expect(prompt).toContain('"type": "string"');
    expect(prompt).not.toContain('"def"');
    expect(prompt).not.toContain('"shape"');
  });

  it("passes timeout and maxBuffer options", async () => {
    simulateExecFile(makeJsonOutput("Response"));
    const provider = createClaudeCliProvider({
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    await provider.invoke([new HumanMessage("Hi")]);

    const opts = (mockExecFile.mock.calls[0] as any[])[2];
    expect(opts.timeout).toBe(60_000);
    expect(opts.maxBuffer).toBe(5 * 1024 * 1024);
  });

  it("throws when Claude CLI returns malformed JSON", async () => {
    simulateExecFile("not valid json");
    const provider = createClaudeCliProvider();

    await expect(provider.invoke([new HumanMessage("Hi")])).rejects.toThrow(
      "Claude CLI returned invalid JSON output",
    );
  });

  it("parses stream-json updates and returns the final AIMessage", async () => {
    simulateSpawnStream([
      `${JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "session_stream",
        model: "claude-sonnet-4-20250514",
      })}\n`,
      `${JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Inspecting repository." },
            {
              type: "tool_use",
              id: "tool-1",
              name: "bash",
              input: { command: "pwd" },
            },
          ],
          usage: {
            input_tokens: 11,
            output_tokens: 4,
            total_tokens: 15,
          },
          stop_reason: "tool_use",
        },
      })}\n`,
      `${JSON.stringify({
        type: "result",
        subtype: "success",
        result: "Inspecting repository.",
        usage: {
          input_tokens: 11,
          output_tokens: 4,
          total_tokens: 15,
        },
        stop_reason: "tool_use",
      })}\n`,
    ]);
    const provider = createClaudeCliProvider({
      outputFormat: "stream-json",
      verbose: true,
      includePartialMessages: true,
    });
    const updates: Array<{ type: string; [key: string]: unknown }> = [];

    const result = await provider.invokeWithUpdates!(
      [new HumanMessage("Inspect the repo")],
      (update) => updates.push(update),
    );

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [file, args] = mockSpawn.mock.calls[0] as any[];
    expect(file).toBe("claude");
    expect(args).toEqual([
      "--print",
      "--output-format",
      "stream-json",
      "--tools",
      "",
      "--verbose",
      "--include-partial-messages",
      "--permission-mode",
      "bypassPermissions",
      '<thread>\n  <event type="human" id="0" iteration="0">Inspect the repo</event>\n</thread>',
    ]);

    expect(updates.map((update) => update.type)).toEqual([
      "assistant_message",
      "tool_call",
      "usage",
      "usage",
      "final",
    ]);
    expect(result.content).toBe("Inspecting repository.");
    expect(result.tool_calls).toEqual([
      {
        name: "bash",
        args: { command: "pwd" },
        id: "tool-1",
      },
    ]);
    expect((result as AIMessage & { usage_metadata?: unknown }).usage_metadata).toEqual({
      input_tokens: 11,
      output_tokens: 4,
      total_tokens: 15,
    });
  });

  it("uses partial message deltas as the final fallback text in stream-json mode", async () => {
    simulateSpawnStream([
      `${JSON.stringify({
        type: "stream_event",
        delta: { type: "text_delta", text: "Partial " },
      })}\n`,
      `${JSON.stringify({
        type: "stream_event",
        delta: { type: "text_delta", text: "response" },
      })}\n`,
      `${JSON.stringify({
        type: "result",
        subtype: "success",
        usage: {
          input_tokens: 8,
          output_tokens: 2,
          total_tokens: 10,
        },
      })}\n`,
    ]);
    const provider = createClaudeCliProvider({ outputFormat: "stream-json" });

    const result = await provider.invoke([new HumanMessage("Hi")]);

    expect(result.content).toBe("Partial response");
    expect(result.tool_calls).toEqual([]);
  });

  it("strips JSON-in-text tool calls from assistant_message updates in stream-json mode", async () => {
    const textWithToolJson = `I'll run that command for you.

\`\`\`json
{
  "tool_calls": [
    {
      "name": "bash",
      "args": { "command": "echo hello" },
      "id": "call_1"
    }
  ]
}
\`\`\``;

    simulateSpawnStream([
      `${JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: textWithToolJson }],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
      })}\n`,
      `${JSON.stringify({
        type: "result",
        subtype: "success",
        result: "I'll run that command for you.",
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      })}\n`,
    ]);
    const provider = createClaudeCliProvider({ outputFormat: "stream-json" });
    const updates: Array<{ type: string; content?: string; toolCall?: unknown }> = [];

    await provider.invokeWithUpdates!([new HumanMessage("Run echo hello")], (update) =>
      updates.push(update),
    );

    // tool_call should come before assistant_message
    const types = updates.map((u) => u.type);
    expect(types).toContain("tool_call");

    // assistant_message should NOT contain the JSON block
    const assistantMsgs = updates.filter((u) => u.type === "assistant_message");
    for (const msg of assistantMsgs) {
      expect(msg.content).not.toContain("```json");
      expect(msg.content).not.toContain("tool_calls");
    }

    // tool_call update should have the parsed tool call
    const toolCallUpdate = updates.find((u) => u.type === "tool_call");
    expect(toolCallUpdate?.toolCall).toEqual({
      name: "bash",
      args: { command: "echo hello" },
      id: "call_1",
    });
  });

  it("surfaces malformed stream-json lines as provider errors immediately", async () => {
    simulateSpawnStream([
      '{"type":"assistant","message":{"content":[{"type":"text","text":"ok"}]}}\n',
      "not-json\n",
    ]);
    const provider = createClaudeCliProvider({
      outputFormat: "stream-json",
      verbose: true,
      includePartialMessages: true,
    });
    const updates: Array<{ type: string; error?: string }> = [];

    await expect(
      provider.invokeWithUpdates!([new HumanMessage("Hi")], (update) => {
        updates.push(update);
      }),
    ).rejects.toThrow("Claude CLI stream-json produced malformed JSON");

    expect(updates.at(-1)).toMatchObject({
      type: "error",
    });
    expect(updates.at(-1)?.error).toContain("malformed JSON");
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
