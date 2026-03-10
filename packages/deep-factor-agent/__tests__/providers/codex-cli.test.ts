import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

import { execFile, spawn } from "node:child_process";
import { createCodexCliProvider } from "../../src/providers/codex-cli.js";
import { isModelAdapter } from "../../src/providers/types.js";

const mockExecFile = vi.mocked(execFile);
const mockSpawn = vi.mocked(spawn);

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

describe("createCodexCliProvider", () => {
  it("returns a ModelAdapter with invoke, invokeWithUpdates, and bindTools", () => {
    const provider = createCodexCliProvider();
    expect(provider).toBeDefined();
    expect(typeof provider.invoke).toBe("function");
    expect(typeof provider.invokeWithUpdates).toBe("function");
    expect(typeof provider.bindTools).toBe("function");
    expect(isModelAdapter(provider)).toBe(true);
  });

  it("invokes codex exec in text mode with read-only sandbox and skip-git-repo-check by default", async () => {
    simulateExecFile("Hello from Codex CLI");
    const provider = createCodexCliProvider();

    const result = await provider.invoke([new HumanMessage("Hi")]);

    expect(mockExecFile).toHaveBeenCalledOnce();
    const [file, args] = mockExecFile.mock.calls[0] as any[];
    expect(file).toBe("codex");
    expect(args).toEqual([
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      '<thread>\n  <event type="human" id="0" iteration="0">Hi</event>\n</thread>',
    ]);
    expect(args).not.toContain("--full-auto");

    expect(result).toBeInstanceOf(AIMessage);
    expect(result.content).toBe("Hello from Codex CLI");
    expect(result.tool_calls).toEqual([]);
  });

  it("uses XML encoding by default (prompt contains <thread>)", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider();

    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    const prompt = args.at(-1)!;
    expect(prompt).toContain("<thread>");
    expect(prompt).toContain('<event type="human"');
    expect(prompt).not.toContain("[User]");
  });

  it("uses text encoding when inputEncoding is text", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider({ inputEncoding: "text" });

    await provider.invoke([new SystemMessage("Be concise."), new HumanMessage("What is 2+2?")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    const prompt = args.at(-1)!;
    expect(prompt).toContain("[System]");
    expect(prompt).toContain("[User]");
    expect(prompt).not.toContain("<thread>");
  });

  it("passes --model when model is configured", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider({ model: "gpt-5.4" });

    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    expect(args).toContain("--model");
    expect(args).toContain("gpt-5.4");
  });

  it("uses the configured cliPath", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider({
      cliPath: "/usr/local/bin/codex-dev",
    });

    await provider.invoke([new HumanMessage("Hi")]);

    const file = (mockExecFile.mock.calls[0] as any[])[0];
    expect(file).toBe("/usr/local/bin/codex-dev");
  });

  it("passes timeout and maxBuffer options to execFile", async () => {
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

  it("throws on CLI error", async () => {
    simulateExecFileError("CLI process exited with code 1", "repo check failed");
    const provider = createCodexCliProvider();

    await expect(provider.invoke([new HumanMessage("Hi")])).rejects.toThrow("repo check failed");
  });

  it("parses prompt-engineered tool calls from text-mode responses", async () => {
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

    expect(result.tool_calls).toEqual([
      {
        name: "calculator",
        args: { expression: "2 + 2" },
        id: "call_1",
      },
    ]);
    expect(result.content).toBe("I need to calculate something.");
  });

  it("injects tool definitions into the prompt when tools are bound", async () => {
    simulateExecFile("Plain response");
    const provider = createCodexCliProvider();

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
    const prompt = args.at(-1)!;
    expect(prompt).toContain("[Available Tools]");
    expect(prompt).toContain("calculator");
    expect(prompt).toContain('"type": "object"');
    expect(prompt).not.toContain('"def"');
  });

  it("supports invoke() in jsonl mode for final-only callers", async () => {
    simulateSpawnStream([
      '{"type":"thread.started","thread_id":"thread_123"}\n',
      '{"type":"turn.started"}\n',
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"hello"}}\n',
      '{"type":"turn.completed","usage":{"input_tokens":11,"cached_input_tokens":7,"output_tokens":5}}\n',
    ]);

    const provider = createCodexCliProvider({ outputFormat: "jsonl" });
    const result = await provider.invoke([new HumanMessage("Hi")]);

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [file, args] = mockSpawn.mock.calls[0] as any[];
    expect(file).toBe("codex");
    expect(args).toEqual([
      "exec",
      "--json",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      '<thread>\n  <event type="human" id="0" iteration="0">Hi</event>\n</thread>',
    ]);
    expect(result.content).toBe("hello");
    expect(result.usage_metadata).toEqual({
      input_tokens: 11,
      output_tokens: 5,
      total_tokens: 16,
      cache_read_input_tokens: 7,
    });
  });

  it("streams assistant progress, usage, and final updates from jsonl output", async () => {
    simulateSpawnStream([
      '{"type":"thread.started","thread_id":"thread_123"}\n',
      '{"type":"turn.started"}\n',
      '{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"thinking"}}\n',
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"hello"}}\n',
      '{"type":"turn.completed","usage":{"input_tokens":11,"cached_input_tokens":7,"output_tokens":5}}\n',
    ]);

    const provider = createCodexCliProvider();
    const updates: Array<Record<string, unknown>> = [];

    const result = await provider.invokeWithUpdates!([new HumanMessage("Hi")], (update) => {
      updates.push(update as Record<string, unknown>);
    });

    expect(result.content).toBe("hello");
    expect(result.usage_metadata).toEqual({
      input_tokens: 11,
      output_tokens: 5,
      total_tokens: 16,
      cache_read_input_tokens: 7,
    });
    expect(updates).toEqual([
      { type: "assistant_message", content: "hello" },
      {
        type: "usage",
        usage: {
          inputTokens: 11,
          outputTokens: 5,
          totalTokens: 16,
          cacheReadTokens: 7,
        },
      },
      {
        type: "final",
        content: "hello",
        usage: {
          inputTokens: 11,
          outputTokens: 5,
          totalTokens: 16,
          cacheReadTokens: 7,
        },
      },
    ]);
  });

  it("parses JSON tool calls from an agent_message and emits live tool_call updates", async () => {
    simulateSpawnStream([
      '{"type":"thread.started","thread_id":"thread_123"}\n',
      '{"type":"turn.started"}\n',
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"```json\\n{\\n  \\"tool_calls\\": [\\n    { \\"name\\": \\"bash\\", \\"args\\": { \\"command\\": \\"pwd\\" }, \\"id\\": \\"call_1\\" }\\n  ]\\n}\\n```"}}\n',
      '{"type":"turn.completed","usage":{"input_tokens":9,"output_tokens":3}}\n',
    ]);

    const provider = createCodexCliProvider();
    const updates: Array<Record<string, unknown>> = [];

    const result = await provider.invokeWithUpdates!([new HumanMessage("Use bash")], (update) => {
      updates.push(update as Record<string, unknown>);
    });

    expect(result.content).toBe("");
    expect(result.tool_calls).toEqual([
      {
        name: "bash",
        args: { command: "pwd" },
        id: "call_1",
      },
    ]);
    expect(updates).toEqual([
      {
        type: "tool_call",
        toolCall: {
          name: "bash",
          args: { command: "pwd" },
          id: "call_1",
        },
      },
      {
        type: "usage",
        usage: {
          inputTokens: 9,
          outputTokens: 3,
          totalTokens: 12,
        },
      },
      {
        type: "final",
        usage: {
          inputTokens: 9,
          outputTokens: 3,
          totalTokens: 12,
        },
      },
    ]);
  });

  it("fails immediately on malformed jsonl output", async () => {
    simulateSpawnStream(['{"type":"thread.started","thread_id":"thread_123"}\n', "not-json\n"]);

    const provider = createCodexCliProvider();
    const updates: Array<Record<string, unknown>> = [];

    await expect(
      provider.invokeWithUpdates!([new HumanMessage("Hi")], (update) => {
        updates.push(update as Record<string, unknown>);
      }),
    ).rejects.toThrow("malformed JSONL");

    expect(updates).toContainEqual({
      type: "error",
      error: expect.stringContaining("malformed JSONL"),
      rawStopReason: "malformed_jsonl",
    });
  });

  it("fails on native command_execution stream items as a contract violation", async () => {
    simulateSpawnStream([
      '{"type":"thread.started","thread_id":"thread_123"}\n',
      '{"type":"turn.started"}\n',
      '{"type":"item.started","item":{"id":"item_2","type":"command_execution","command":"pwd","status":"in_progress"}}\n',
    ]);

    const provider = createCodexCliProvider();
    const updates: Array<Record<string, unknown>> = [];

    await expect(
      provider.invokeWithUpdates!([new HumanMessage("Run pwd")], (update) => {
        updates.push(update as Record<string, unknown>);
      }),
    ).rejects.toThrow("violates the Deep Factor provider contract");

    expect(updates).toContainEqual({
      type: "error",
      error: expect.stringContaining("violates the Deep Factor provider contract"),
      rawStopReason: "contract_violation",
    });
  });
});
