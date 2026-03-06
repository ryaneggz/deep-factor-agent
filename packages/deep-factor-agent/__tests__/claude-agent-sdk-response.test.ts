import { describe, it, expect } from "vitest";
import {
  parseResponseText,
  parseToolUseBlocks,
  parseUsageMetadata,
  throwOnSdkError,
  parseSdkResponse,
} from "../src/providers/claude-agent-sdk.js";
import type { SdkContentBlock, SdkResponseMessage } from "../src/providers/claude-agent-sdk.js";

describe("parseResponseText", () => {
  it("extracts text from a single text block", () => {
    const content: SdkContentBlock[] = [{ type: "text", text: "Hello world" }];
    expect(parseResponseText(content)).toBe("Hello world");
  });

  it("joins multiple text blocks", () => {
    const content: SdkContentBlock[] = [
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ];
    expect(parseResponseText(content)).toBe("Hello world");
  });

  it("ignores non-text blocks", () => {
    const content: SdkContentBlock[] = [
      { type: "text", text: "Hello" },
      { type: "tool_use", id: "call_1", name: "read", input: {} },
      { type: "text", text: " world" },
    ];
    expect(parseResponseText(content)).toBe("Hello world");
  });

  it("returns empty string when no text blocks present", () => {
    const content: SdkContentBlock[] = [
      { type: "tool_use", id: "call_1", name: "read", input: {} },
    ];
    expect(parseResponseText(content)).toBe("");
  });

  it("returns empty string for empty content array", () => {
    expect(parseResponseText([])).toBe("");
  });

  it("ignores unknown block types", () => {
    const content: SdkContentBlock[] = [
      { type: "thinking", thinking: "hmm..." },
      { type: "text", text: "result" },
    ];
    expect(parseResponseText(content)).toBe("result");
  });
});

describe("parseToolUseBlocks", () => {
  it("extracts a single tool_use block", () => {
    const content: SdkContentBlock[] = [
      { type: "tool_use", id: "call_1", name: "calculator", input: { expr: "2+2" } },
    ];
    const result = parseToolUseBlocks(content);
    expect(result).toEqual([
      { name: "calculator", args: { expr: "2+2" }, id: "call_1", type: "tool_call" },
    ]);
  });

  it("extracts multiple tool_use blocks", () => {
    const content: SdkContentBlock[] = [
      { type: "tool_use", id: "call_1", name: "read_file", input: { path: "a.ts" } },
      { type: "tool_use", id: "call_2", name: "read_file", input: { path: "b.ts" } },
    ];
    const result = parseToolUseBlocks(content);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("call_1");
    expect(result[1].id).toBe("call_2");
  });

  it("ignores non-tool_use blocks", () => {
    const content: SdkContentBlock[] = [
      { type: "text", text: "Let me help." },
      { type: "tool_use", id: "call_1", name: "bash", input: { cmd: "ls" } },
    ];
    const result = parseToolUseBlocks(content);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("bash");
  });

  it("returns empty array when no tool_use blocks", () => {
    const content: SdkContentBlock[] = [{ type: "text", text: "No tools needed." }];
    expect(parseToolUseBlocks(content)).toEqual([]);
  });

  it("handles tool_use with null input", () => {
    const content: SdkContentBlock[] = [
      { type: "tool_use", id: "call_1", name: "no_args_tool", input: null },
    ];
    const result = parseToolUseBlocks(content);
    expect(result[0].args).toEqual({});
  });

  it("handles tool_use with primitive input", () => {
    const content: SdkContentBlock[] = [
      { type: "tool_use", id: "call_1", name: "odd_tool", input: "string_input" },
    ];
    const result = parseToolUseBlocks(content);
    expect(result[0].args).toEqual({});
  });
});

describe("parseUsageMetadata", () => {
  it("maps SDK usage to LangChain format", () => {
    const usage = { input_tokens: 100, output_tokens: 50 };
    const result = parseUsageMetadata(usage);
    expect(result).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    });
  });

  it("returns undefined when usage is undefined", () => {
    expect(parseUsageMetadata(undefined)).toBeUndefined();
  });

  it("handles zero token counts", () => {
    const usage = { input_tokens: 0, output_tokens: 0 };
    const result = parseUsageMetadata(usage);
    expect(result).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    });
  });

  it("ignores cache fields (passes through without error)", () => {
    const usage = {
      input_tokens: 200,
      output_tokens: 100,
      cache_creation_input_tokens: 50,
      cache_read_input_tokens: 30,
    };
    const result = parseUsageMetadata(usage);
    expect(result).toEqual({
      input_tokens: 200,
      output_tokens: 100,
      total_tokens: 300,
    });
  });
});

describe("throwOnSdkError", () => {
  it("throws on rate_limit error", () => {
    const err = { type: "error", error_type: "rate_limit", message: "Too many requests" };
    expect(() => throwOnSdkError(err)).toThrow("Claude Agent SDK rate limited: Too many requests");
  });

  it("throws on auth_failed error", () => {
    const err = { type: "error", error_type: "auth_failed", message: "Invalid API key" };
    expect(() => throwOnSdkError(err)).toThrow(
      "Claude Agent SDK authentication failed: Invalid API key",
    );
  });

  it("throws on overloaded error", () => {
    const err = { type: "error", error_type: "overloaded", message: "Server busy" };
    expect(() => throwOnSdkError(err)).toThrow("Claude Agent SDK overloaded: Server busy");
  });

  it("throws on unknown error types with type in message", () => {
    const err = { type: "error", error_type: "api_error", message: "Something broke" };
    expect(() => throwOnSdkError(err)).toThrow(
      "Claude Agent SDK error (api_error): Something broke",
    );
  });

  it("does not throw for non-error objects", () => {
    expect(() => throwOnSdkError({ type: "message", role: "assistant" })).not.toThrow();
  });

  it("does not throw for null or primitives", () => {
    expect(() => throwOnSdkError(null)).not.toThrow();
    expect(() => throwOnSdkError(undefined)).not.toThrow();
    expect(() => throwOnSdkError("string")).not.toThrow();
    expect(() => throwOnSdkError(42)).not.toThrow();
  });

  it("handles error without message field", () => {
    const err = { type: "error", error_type: "rate_limit" };
    expect(() => throwOnSdkError(err)).toThrow("Claude Agent SDK rate limited: Unknown SDK error");
  });
});

describe("parseSdkResponse", () => {
  it("parses text-only response", () => {
    const response: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "The answer is 42." }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const msg = parseSdkResponse(response);
    expect(msg.content).toBe("The answer is 42.");
    expect(msg.tool_calls).toEqual([]);
    expect((msg as unknown as { usage_metadata: unknown }).usage_metadata).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    });
  });

  it("parses tool-call-only response", () => {
    const response: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "tool_use", id: "call_1", name: "calculator", input: { expr: "2+2" } }],
      usage: { input_tokens: 20, output_tokens: 10 },
    };
    const msg = parseSdkResponse(response);
    expect(msg.content).toBe("");
    expect(msg.tool_calls).toEqual([
      { name: "calculator", args: { expr: "2+2" }, id: "call_1", type: "tool_call" },
    ]);
  });

  it("parses mixed text + tool_use response", () => {
    const response: SdkResponseMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me calculate that." },
        { type: "tool_use", id: "call_1", name: "calculator", input: { expr: "2+2" } },
      ],
      usage: { input_tokens: 30, output_tokens: 15 },
    };
    const msg = parseSdkResponse(response);
    expect(msg.content).toBe("Let me calculate that.");
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls![0].name).toBe("calculator");
  });

  it("parses response with multiple tool calls", () => {
    const response: SdkResponseMessage = {
      role: "assistant",
      content: [
        { type: "tool_use", id: "call_1", name: "read_file", input: { path: "a.ts" } },
        { type: "tool_use", id: "call_2", name: "read_file", input: { path: "b.ts" } },
      ],
    };
    const msg = parseSdkResponse(response);
    expect(msg.tool_calls).toHaveLength(2);
    expect(msg.tool_calls![0].id).toBe("call_1");
    expect(msg.tool_calls![1].id).toBe("call_2");
  });

  it("handles response without usage data", () => {
    const response: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "No usage info." }],
    };
    const msg = parseSdkResponse(response);
    expect(msg.content).toBe("No usage info.");
    // usage_metadata should not be set
    expect((msg as unknown as { usage_metadata: unknown }).usage_metadata).toBeUndefined();
  });

  it("handles empty content array", () => {
    const response: SdkResponseMessage = {
      role: "assistant",
      content: [],
    };
    const msg = parseSdkResponse(response);
    expect(msg.content).toBe("");
    expect(msg.tool_calls).toEqual([]);
  });

  it("ignores thinking/redacted blocks in content", () => {
    const response: SdkResponseMessage = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Let me consider..." } as SdkContentBlock,
        { type: "text", text: "Here is my answer." },
        { type: "redacted_thinking" } as SdkContentBlock,
      ],
      usage: { input_tokens: 50, output_tokens: 25 },
    };
    const msg = parseSdkResponse(response);
    expect(msg.content).toBe("Here is my answer.");
    expect(msg.tool_calls).toEqual([]);
  });

  it("returns a proper AIMessage instance", () => {
    const response: SdkResponseMessage = {
      role: "assistant",
      content: [{ type: "text", text: "test" }],
    };
    const msg = parseSdkResponse(response);
    expect(msg._getType()).toBe("ai");
  });
});
