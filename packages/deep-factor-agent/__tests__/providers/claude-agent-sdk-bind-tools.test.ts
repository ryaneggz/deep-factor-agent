import { tool } from "@langchain/core/tools";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClaudeAgentSdkProvider,
  formatToolDefinitions,
} from "../../src/providers/claude-agent-sdk.js";
import type { SdkResponseMessage } from "../../src/providers/claude-agent-sdk.js";

async function* mockQueryGenerator(messages: unknown[]): AsyncGenerator<unknown> {
  for (const message of messages) {
    yield message;
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

let mockQueryFn: ReturnType<typeof createMockQuery>["queryFn"];

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  get query() {
    return mockQueryFn;
  },
}));

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
    const withTools = provider.bindTools?.([readFileTool]);

    expect(withTools).toBeDefined();
    expect(withTools).not.toBe(provider);
  });

  it("leaves the original adapter unchanged", async () => {
    const { queryFn, calls } = createMockQuery([
      { role: "assistant", content: [{ type: "text", text: "ok" }] } satisfies SdkResponseMessage,
    ]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    provider.bindTools?.([readFileTool]);
    await provider.invoke([new HumanMessage("test")]);

    expect(calls[0]?.options?.allowedTools).toBeUndefined();
    expect(calls[0]?.options?.systemPrompt).toBeUndefined();
  });

  it("injects bound tool names into allowedTools", async () => {
    const { queryFn, calls } = createMockQuery([
      { role: "assistant", content: [{ type: "text", text: "ok" }] } satisfies SdkResponseMessage,
    ]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider().bindTools?.([readFileTool, writeFileTool]);
    await provider?.invoke([new HumanMessage("test")]);

    expect(calls[0]?.options?.allowedTools).toEqual(["read_file", "write_file"]);
  });

  it("merges provider allowedTools with bound tools", async () => {
    const { queryFn, calls } = createMockQuery([
      { role: "assistant", content: [{ type: "text", text: "ok" }] } satisfies SdkResponseMessage,
    ]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider({
      allowedTools: ["Read", "Edit"],
    }).bindTools?.([readFileTool]);
    await provider?.invoke([new HumanMessage("test")]);

    expect(calls[0]?.options?.allowedTools).toEqual(["Read", "Edit", "read_file"]);
  });

  it("injects tool definitions into the system prompt", async () => {
    const { queryFn, calls } = createMockQuery([
      { role: "assistant", content: [{ type: "text", text: "ok" }] } satisfies SdkResponseMessage,
    ]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider().bindTools?.([readFileTool]);
    await provider?.invoke([new HumanMessage("test")]);

    const systemPrompt = String(calls[0]?.options?.systemPrompt);
    expect(systemPrompt).toContain("[Available Tools]");
    expect(systemPrompt).toContain("read_file");
  });
});

describe("formatToolDefinitions()", () => {
  it("formats tool names, descriptions, and schemas", () => {
    const result = formatToolDefinitions([readFileTool, writeFileTool]);

    expect(result).toContain("[Available Tools]");
    expect(result).toContain("read_file");
    expect(result).toContain("write_file");
    expect(result).toContain("tool_use");

    const jsonMatch = result.match(/\[Available Tools\]\n([\s\S]*?)\n\nWhen/);
    expect(jsonMatch).not.toBeNull();
    expect(JSON.parse(jsonMatch?.[1] ?? "[]")).toHaveLength(2);
  });
});
