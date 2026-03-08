import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClaudeAgentSdkProvider } from "../../src/providers/claude-agent-sdk.js";
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

describe("createClaudeAgentSdkProvider invoke()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an AIMessage with text content from the assistant response", async () => {
    const assistantMessage: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Hello from SDK!" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const { queryFn } = createMockQuery([assistantMessage]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const result = await provider.invoke([new HumanMessage("Hi")]);

    expect(result.content).toBe("Hello from SDK!");
    expect(result.tool_calls).toEqual([]);
  });

  it("returns an AIMessage with tool calls from the assistant response", async () => {
    const assistantMessage: SdkResponseMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "" },
        { type: "tool_use", id: "call_1", name: "read_file", input: { path: "/tmp/test.txt" } },
      ],
      usage: { input_tokens: 20, output_tokens: 15 },
    };
    const { queryFn } = createMockQuery([assistantMessage]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const result = await provider.invoke([new HumanMessage("Read the file")]);

    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls?.[0]).toMatchObject({
      name: "read_file",
      id: "call_1",
      args: { path: "/tmp/test.txt" },
    });
  });

  it("uses the last assistant message when multiple are yielded", async () => {
    const { queryFn } = createMockQuery([
      {
        role: "assistant",
        content: [{ type: "text", text: "first" }],
      } satisfies SdkResponseMessage,
      {
        role: "assistant",
        content: [{ type: "text", text: "second" }],
      } satisfies SdkResponseMessage,
    ]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const result = await provider.invoke([new HumanMessage("test")]);

    expect(result.content).toBe("second");
  });

  it("falls back to the result event when no assistant message is yielded", async () => {
    const { queryFn } = createMockQuery([{ type: "result", result: "Fallback result text" }]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const result = await provider.invoke([new HumanMessage("test")]);

    expect(result.content).toBe("Fallback result text");
  });

  it("throws when the SDK returns an error payload", async () => {
    const { queryFn } = createMockQuery([
      { type: "error", error_type: "auth_failed", message: "Invalid API key" },
    ]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    await expect(provider.invoke([new HumanMessage("test")])).rejects.toThrow(
      "Claude Agent SDK authentication failed: Invalid API key",
    );
  });

  it("passes system prompt, converted prompt, and provider options to the SDK", async () => {
    const assistantMessage: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
    };
    const { queryFn, calls } = createMockQuery([assistantMessage]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider({
      model: "claude-opus-4-6",
      cwd: "/tmp/work",
      thinking: { type: "adaptive" },
      effort: "high",
      allowedTools: ["Read", "Edit"],
      disallowedTools: ["Bash"],
      systemPrompt: "Provider system prompt",
      persistSession: true,
    });
    await provider.invoke([new SystemMessage("Message system prompt"), new HumanMessage("test")]);

    expect(calls[0]?.prompt).toBe("[User]: test");
    expect(calls[0]?.options).toMatchObject({
      model: "claude-opus-4-6",
      cwd: "/tmp/work",
      thinking: { type: "adaptive" },
      effort: "high",
      allowedTools: ["Read", "Edit"],
      disallowedTools: ["Bash"],
      persistSession: true,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    });
    expect(calls[0]?.options?.systemPrompt).toBe("Provider system prompt\n\nMessage system prompt");
  });

  it("respects a custom timeout", async () => {
    mockQueryFn = () =>
      (async function* () {
        await new Promise(() => {});
        yield { type: "text", text: "unreachable" };
      })();

    const provider = createClaudeAgentSdkProvider({ timeout: 50 });
    await expect(provider.invoke([new HumanMessage("test")])).rejects.toThrow(
      "Claude Agent SDK query timed out after 50ms",
    );
  });
});
