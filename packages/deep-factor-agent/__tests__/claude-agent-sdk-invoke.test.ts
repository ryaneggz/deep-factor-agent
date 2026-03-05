import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createClaudeAgentSdkProvider } from "../src/providers/claude-agent-sdk.js";
import type { SdkResponseMessage } from "../src/providers/claude-agent-sdk.js";

// --- Helpers to build mock SDK query() generators ---

/** Create an async generator that yields a sequence of SDK messages. */
async function* mockQueryGenerator(messages: unknown[]): AsyncGenerator<unknown> {
  for (const msg of messages) {
    yield msg;
  }
}

/** Build a mock query function that captures its args and yields given messages. */
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

describe("createClaudeAgentSdkProvider invoke()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns AIMessage with text content from assistant response", async () => {
    const assistantMsg: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Hello from SDK!" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const { queryFn } = createMockQuery([assistantMsg]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const result = await provider.invoke([new HumanMessage("Hi")]);

    expect(result.content).toBe("Hello from SDK!");
    expect(result.tool_calls).toEqual([]);
  });

  it("returns AIMessage with tool_calls from assistant response", async () => {
    const assistantMsg: SdkResponseMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "" },
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
    const result = await provider.invoke([new HumanMessage("Read the file")]);

    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0]).toMatchObject({
      name: "read_file",
      id: "call_1",
      args: { path: "/tmp/test.txt" },
    });
  });

  it("returns AIMessage with mixed text and tool_calls", async () => {
    const assistantMsg: SdkResponseMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me check that file." },
        {
          type: "tool_use",
          id: "call_2",
          name: "bash",
          input: { command: "ls" },
        },
      ],
      usage: { input_tokens: 15, output_tokens: 20 },
    };
    const { queryFn } = createMockQuery([assistantMsg]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const result = await provider.invoke([new HumanMessage("list files")]);

    expect(result.content).toBe("Let me check that file.");
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0].name).toBe("bash");
  });

  it("populates usage_metadata from SDK usage data", async () => {
    const assistantMsg: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    const { queryFn } = createMockQuery([assistantMsg]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const result = await provider.invoke([new HumanMessage("test")]);

    const usageMeta = (result as unknown as { usage_metadata?: unknown }).usage_metadata;
    expect(usageMeta).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    });
  });

  it("uses the last assistant message when multiple are yielded", async () => {
    const first: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "first" }],
    };
    const second: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "second" }],
    };
    const { queryFn } = createMockQuery([first, second]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const result = await provider.invoke([new HumanMessage("test")]);

    expect(result.content).toBe("second");
  });

  it("falls back to result text when no assistant message", async () => {
    const resultMsg = { result: "Fallback result text" };
    const { queryFn } = createMockQuery([resultMsg]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    const result = await provider.invoke([new HumanMessage("test")]);

    expect(result.content).toBe("Fallback result text");
  });

  it("throws when no assistant message or result", async () => {
    const systemMsg = { type: "system", subtype: "init", session_id: "abc" };
    const { queryFn } = createMockQuery([systemMsg]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    await expect(provider.invoke([new HumanMessage("test")])).rejects.toThrow(
      "Claude Agent SDK query returned no assistant message",
    );
  });

  it("throws on SDK error results", async () => {
    const errorResult = {
      type: "error",
      error_type: "rate_limit",
      message: "Too many requests",
    };
    const { queryFn } = createMockQuery([errorResult]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    await expect(provider.invoke([new HumanMessage("test")])).rejects.toThrow(
      "Claude Agent SDK rate limited: Too many requests",
    );
  });

  it("throws on auth_failed error", async () => {
    const errorResult = {
      type: "error",
      error_type: "auth_failed",
      message: "Invalid API key",
    };
    const { queryFn } = createMockQuery([errorResult]);
    mockQueryFn = queryFn;

    const provider = createClaudeAgentSdkProvider();
    await expect(provider.invoke([new HumanMessage("test")])).rejects.toThrow(
      "Claude Agent SDK authentication failed: Invalid API key",
    );
  });

  describe("SDK query options", () => {
    it("defaults maxTurns to 1", async () => {
      const assistantMsg: SdkResponseMessage = {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
      };
      const { queryFn, calls } = createMockQuery([assistantMsg]);
      mockQueryFn = queryFn;

      const provider = createClaudeAgentSdkProvider();
      await provider.invoke([new HumanMessage("test")]);

      expect(calls).toHaveLength(1);
      expect(calls[0].options?.maxTurns).toBe(1);
    });

    it("defaults permissionMode to bypassPermissions", async () => {
      const assistantMsg: SdkResponseMessage = {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
      };
      const { queryFn, calls } = createMockQuery([assistantMsg]);
      mockQueryFn = queryFn;

      const provider = createClaudeAgentSdkProvider();
      await provider.invoke([new HumanMessage("test")]);

      expect(calls[0].options?.permissionMode).toBe("bypassPermissions");
      expect(calls[0].options?.allowDangerouslySkipPermissions).toBe(true);
    });

    it("passes custom maxTurns from provider options", async () => {
      const assistantMsg: SdkResponseMessage = {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
      };
      const { queryFn, calls } = createMockQuery([assistantMsg]);
      mockQueryFn = queryFn;

      const provider = createClaudeAgentSdkProvider({ maxTurns: 5 });
      await provider.invoke([new HumanMessage("test")]);

      expect(calls[0].options?.maxTurns).toBe(5);
    });

    it("passes model, cwd, and other options to SDK", async () => {
      const assistantMsg: SdkResponseMessage = {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
      };
      const { queryFn, calls } = createMockQuery([assistantMsg]);
      mockQueryFn = queryFn;

      const provider = createClaudeAgentSdkProvider({
        model: "claude-opus-4-6",
        cwd: "/tmp/work",
        thinking: { type: "adaptive" },
        effort: "high",
        allowedTools: ["Read", "Edit"],
        disallowedTools: ["Bash"],
      });
      await provider.invoke([new HumanMessage("test")]);

      const opts = calls[0].options!;
      expect(opts.model).toBe("claude-opus-4-6");
      expect(opts.cwd).toBe("/tmp/work");
      expect(opts.thinking).toEqual({ type: "adaptive" });
      expect(opts.effort).toBe("high");
      expect(opts.allowedTools).toEqual(["Read", "Edit"]);
      expect(opts.disallowedTools).toEqual(["Bash"]);
    });

    it("extracts SystemMessage into SDK systemPrompt", async () => {
      const assistantMsg: SdkResponseMessage = {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
      };
      const { queryFn, calls } = createMockQuery([assistantMsg]);
      mockQueryFn = queryFn;

      const provider = createClaudeAgentSdkProvider();
      await provider.invoke([new SystemMessage("You are helpful"), new HumanMessage("test")]);

      expect(calls[0].options?.systemPrompt).toBe("You are helpful");
    });

    it("combines provider systemPrompt with extracted SystemMessages", async () => {
      const assistantMsg: SdkResponseMessage = {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
      };
      const { queryFn, calls } = createMockQuery([assistantMsg]);
      mockQueryFn = queryFn;

      const provider = createClaudeAgentSdkProvider({
        systemPrompt: "Provider system prompt",
      });
      await provider.invoke([new SystemMessage("Message system prompt"), new HumanMessage("test")]);

      expect(calls[0].options?.systemPrompt).toBe(
        "Provider system prompt\n\nMessage system prompt",
      );
    });

    it("passes converted prompt string to SDK query", async () => {
      const assistantMsg: SdkResponseMessage = {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
      };
      const { queryFn, calls } = createMockQuery([assistantMsg]);
      mockQueryFn = queryFn;

      const provider = createClaudeAgentSdkProvider();
      await provider.invoke([new HumanMessage("Hello there")]);

      expect(calls[0].prompt).toBe("[User]: Hello there");
    });

    it("passes MCP servers to SDK options", async () => {
      const assistantMsg: SdkResponseMessage = {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
      };
      const { queryFn, calls } = createMockQuery([assistantMsg]);
      mockQueryFn = queryFn;

      const mcpServers = {
        playwright: { command: "npx", args: ["@playwright/mcp@latest"] },
      };
      const provider = createClaudeAgentSdkProvider({ mcpServers });
      await provider.invoke([new HumanMessage("test")]);

      expect(calls[0].options?.mcpServers).toEqual(mcpServers);
    });

    it("passes persistSession to SDK options", async () => {
      const assistantMsg: SdkResponseMessage = {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
      };
      const { queryFn, calls } = createMockQuery([assistantMsg]);
      mockQueryFn = queryFn;

      const provider = createClaudeAgentSdkProvider({ persistSession: true });
      await provider.invoke([new HumanMessage("test")]);

      expect(calls[0].options?.persistSession).toBe(true);
    });
  });

  describe("timeout", () => {
    it("respects custom timeout option", async () => {
      // Create a query that never resolves
      const neverResolve = () => {
        return (async function* () {
          await new Promise(() => {}); // Never resolves
          yield { type: "text", text: "unreachable" };
        })();
      };
      mockQueryFn = () => neverResolve();

      const provider = createClaudeAgentSdkProvider({ timeout: 50 });
      await expect(provider.invoke([new HumanMessage("test")])).rejects.toThrow(
        "Claude Agent SDK query timed out after 50ms",
      );
    });
  });

  describe("SDK not installed", () => {
    it("throws helpful error when SDK is not installed", async () => {
      // Temporarily override mock to simulate missing SDK
      vi.doUnmock("@anthropic-ai/claude-agent-sdk");
      vi.doMock("@anthropic-ai/claude-agent-sdk", () => {
        throw new Error("Cannot find module '@anthropic-ai/claude-agent-sdk'");
      });

      // We need to re-import the provider to pick up the new mock
      const { createClaudeAgentSdkProvider: freshProvider } =
        await import("../src/providers/claude-agent-sdk.js");

      const provider = freshProvider();
      await expect(provider.invoke([new HumanMessage("test")])).rejects.toThrow(
        "Claude Agent SDK (@anthropic-ai/claude-agent-sdk) is not installed",
      );

      // Restore mock
      vi.doUnmock("@anthropic-ai/claude-agent-sdk");
      vi.doMock("@anthropic-ai/claude-agent-sdk", () => ({
        get query() {
          return mockQueryFn;
        },
      }));
    });
  });
});
