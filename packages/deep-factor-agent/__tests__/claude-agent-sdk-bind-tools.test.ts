import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import {
  createClaudeAgentSdkProvider,
  formatToolDefinitions,
} from "../src/providers/claude-agent-sdk.js";
import type { SdkResponseMessage } from "../src/providers/claude-agent-sdk.js";

// --- Helpers to build mock SDK query() generators ---

async function* mockQueryGenerator(messages: unknown[]): AsyncGenerator<unknown> {
  for (const msg of messages) {
    yield msg;
  }
}

function createMockQuery(sdkMessages: unknown[]) {
  const calls: Array<{ prompt: string; options?: Record<string, unknown> }> = [];
  const queryFn = (args: { prompt: string; options?: Record<string, unknown> }) => {
    calls.push(args);
    return mockQueryGenerator(sdkMessages);
  };
  return { queryFn, calls };
}

// --- Mock the SDK module ---
let mockQueryFn: ReturnType<typeof createMockQuery>["queryFn"];

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  get query() {
    return mockQueryFn;
  },
}));

// --- Test tools ---

const readFileTool = tool(async ({ path }: { path: string }) => `Contents of ${path}`, {
  name: "read_file",
  description: "Read a file from the filesystem",
  schema: z.object({ path: z.string().describe("The file path to read") }),
});

const writeFileTool = tool(
  async ({ path, content }: { path: string; content: string }) =>
    `Wrote ${content.length} chars to ${path}`,
  {
    name: "write_file",
    description: "Write content to a file",
    schema: z.object({
      path: z.string().describe("The file path to write"),
      content: z.string().describe("The content to write"),
    }),
  },
);

describe("createClaudeAgentSdkProvider bindTools()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a new adapter instance", () => {
    const provider = createClaudeAgentSdkProvider();
    const withTools = provider.bindTools!([readFileTool]);

    expect(withTools).not.toBe(provider);
    expect(withTools.invoke).toBeDefined();
    expect(withTools.bindTools).toBeDefined();
  });

  it("original adapter is unchanged (immutable pattern)", async () => {
    const assistantMsg: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
    };
    const { queryFn, calls } = createMockQuery([assistantMsg]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    provider.bindTools!([readFileTool]);

    // Invoke the ORIGINAL provider — should NOT have tool definitions
    await provider.invoke([new HumanMessage("test")]);

    expect(calls).toHaveLength(1);
    // Original should not have allowedTools with bound tool names
    const opts = calls[0].options!;
    expect(opts.allowedTools).toBeUndefined();
    expect(opts.systemPrompt).toBeUndefined();
  });

  it("bound adapter injects tool names into allowedTools", async () => {
    const assistantMsg: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
    };
    const { queryFn, calls } = createMockQuery([assistantMsg]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const withTools = provider.bindTools!([readFileTool, writeFileTool]);

    await withTools.invoke([new HumanMessage("test")]);

    expect(calls).toHaveLength(1);
    const opts = calls[0].options!;
    expect(opts.allowedTools).toEqual(["read_file", "write_file"]);
  });

  it("merges bound tool names with provider allowedTools", async () => {
    const assistantMsg: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
    };
    const { queryFn, calls } = createMockQuery([assistantMsg]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider({
      allowedTools: ["Read", "Edit"],
    });
    const withTools = provider.bindTools!([readFileTool]);

    await withTools.invoke([new HumanMessage("test")]);

    expect(calls[0].options!.allowedTools).toEqual(["Read", "Edit", "read_file"]);
  });

  it("injects tool definitions into systemPrompt", async () => {
    const assistantMsg: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
    };
    const { queryFn, calls } = createMockQuery([assistantMsg]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const withTools = provider.bindTools!([readFileTool]);

    await withTools.invoke([new HumanMessage("test")]);

    const systemPrompt = calls[0].options!.systemPrompt as string;
    expect(systemPrompt).toContain("[Available Tools]");
    expect(systemPrompt).toContain("read_file");
    expect(systemPrompt).toContain("Read a file from the filesystem");
  });

  it("combines provider systemPrompt with tool definitions", async () => {
    const assistantMsg: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
    };
    const { queryFn, calls } = createMockQuery([assistantMsg]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider({
      systemPrompt: "You are helpful",
    });
    const withTools = provider.bindTools!([readFileTool]);

    await withTools.invoke([new HumanMessage("test")]);

    const systemPrompt = calls[0].options!.systemPrompt as string;
    expect(systemPrompt).toContain("You are helpful");
    expect(systemPrompt).toContain("[Available Tools]");
    expect(systemPrompt).toContain("read_file");
  });

  it("bindTools can be called multiple times (chaining)", () => {
    const provider = createClaudeAgentSdkProvider();
    const withRead = provider.bindTools!([readFileTool]);
    const withBoth = withRead.bindTools!([readFileTool, writeFileTool]);

    expect(withRead).not.toBe(provider);
    expect(withBoth).not.toBe(withRead);
    expect(withBoth).not.toBe(provider);
  });

  it("second bindTools replaces tools (not appends)", async () => {
    const assistantMsg: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
    };
    const { queryFn, calls } = createMockQuery([assistantMsg]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const withRead = provider.bindTools!([readFileTool]);
    const withWrite = withRead.bindTools!([writeFileTool]);

    await withWrite.invoke([new HumanMessage("test")]);

    const opts = calls[0].options!;
    expect(opts.allowedTools).toEqual(["write_file"]);
    const systemPrompt = opts.systemPrompt as string;
    expect(systemPrompt).not.toContain("read_file");
    expect(systemPrompt).toContain("write_file");
  });

  it("bound adapter still handles tool_use blocks in response", async () => {
    const assistantMsg: SdkResponseMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me read that file." },
        {
          type: "tool_use",
          id: "call_1",
          name: "read_file",
          input: { path: "/tmp/test.txt" },
        },
      ],
      usage: { input_tokens: 20, output_tokens: 15 },
    };
    const { queryFn } = createMockQuery([assistantMsg]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const withTools = provider.bindTools!([readFileTool]);
    const result = await withTools.invoke([new HumanMessage("Read the file")]);

    expect(result.content).toBe("Let me read that file.");
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0]).toMatchObject({
      name: "read_file",
      id: "call_1",
      args: { path: "/tmp/test.txt" },
    });
  });
});

describe("formatToolDefinitions()", () => {
  it("formats a single tool with schema", () => {
    const result = formatToolDefinitions([readFileTool]);

    expect(result).toContain("[Available Tools]");
    expect(result).toContain("read_file");
    expect(result).toContain("Read a file from the filesystem");
    expect(result).toContain("tool_use");

    // Verify JSON is parseable
    const jsonMatch = result.match(/\[Available Tools\]\n([\s\S]*?)\n\nWhen/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![1]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("read_file");
  });

  it("formats multiple tools", () => {
    const result = formatToolDefinitions([readFileTool, writeFileTool]);

    const jsonMatch = result.match(/\[Available Tools\]\n([\s\S]*?)\n\nWhen/);
    const parsed = JSON.parse(jsonMatch![1]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("read_file");
    expect(parsed[1].name).toBe("write_file");
  });

  it("includes parameter schemas from Zod definitions", () => {
    const result = formatToolDefinitions([readFileTool]);

    const jsonMatch = result.match(/\[Available Tools\]\n([\s\S]*?)\n\nWhen/);
    const parsed = JSON.parse(jsonMatch![1]);
    expect(parsed[0].parameters).toBeDefined();
    expect(parsed[0].parameters.type).toBe("object");
    expect(parsed[0].parameters.properties).toHaveProperty("path");
  });
});
