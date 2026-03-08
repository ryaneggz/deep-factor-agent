import { describe, it, expect } from "vitest";
import {
  parseResponseText,
  parseSdkResponse,
  parseToolUseBlocks,
  parseUsageMetadata,
  throwOnSdkError,
} from "../../src/providers/claude-agent-sdk.js";
import type { SdkContentBlock, SdkResponseMessage } from "../../src/providers/claude-agent-sdk.js";

describe("parseResponseText", () => {
  it("joins text blocks and ignores non-text blocks", () => {
    const content: SdkContentBlock[] = [
      { type: "text", text: "Hello" },
      { type: "tool_use", id: "call_1", name: "read", input: {} },
      { type: "text", text: " world" },
    ];
    expect(parseResponseText(content)).toBe("Hello world");
  });

  it("returns an empty string when no text blocks are present", () => {
    expect(parseResponseText([{ type: "tool_use", id: "call_1", name: "read", input: {} }])).toBe(
      "",
    );
  });
});

describe("parseToolUseBlocks", () => {
  it("extracts tool_use blocks", () => {
    expect(
      parseToolUseBlocks([
        { type: "tool_use", id: "call_1", name: "calculator", input: { expr: "2+2" } },
      ]),
    ).toEqual([{ name: "calculator", args: { expr: "2+2" }, id: "call_1", type: "tool_call" }]);
  });

  it("coerces null or primitive input to an empty object", () => {
    expect(
      parseToolUseBlocks([
        { type: "tool_use", id: "call_1", name: "no_args_tool", input: null },
        { type: "tool_use", id: "call_2", name: "odd_tool", input: "string_input" },
      ]),
    ).toEqual([
      { name: "no_args_tool", args: {}, id: "call_1", type: "tool_call" },
      { name: "odd_tool", args: {}, id: "call_2", type: "tool_call" },
    ]);
  });
});

describe("parseUsageMetadata", () => {
  it("maps SDK usage to LangChain format", () => {
    expect(parseUsageMetadata({ input_tokens: 100, output_tokens: 50 })).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    });
  });
});

describe("throwOnSdkError", () => {
  it("throws descriptive errors for SDK failures", () => {
    expect(() =>
      throwOnSdkError({
        type: "error",
        error_type: "rate_limit",
        message: "Too many requests",
      }),
    ).toThrow("Claude Agent SDK rate limited: Too many requests");
  });

  it("ignores non-error payloads", () => {
    expect(() => throwOnSdkError({ type: "message", role: "assistant" })).not.toThrow();
  });
});

describe("parseSdkResponse", () => {
  it("parses text content, tool calls, and usage", () => {
    const response: SdkResponseMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me calculate that." },
        { type: "tool_use", id: "call_1", name: "calculator", input: { expr: "2+2" } },
      ],
      usage: { input_tokens: 30, output_tokens: 15 },
    };

    const message = parseSdkResponse(response);

    expect(message.content).toBe("Let me calculate that.");
    expect(message.tool_calls).toEqual([
      { name: "calculator", args: { expr: "2+2" }, id: "call_1", type: "tool_call" },
    ]);
    expect((message as unknown as { usage_metadata?: unknown }).usage_metadata).toEqual({
      input_tokens: 30,
      output_tokens: 15,
      total_tokens: 45,
    });
  });
});
