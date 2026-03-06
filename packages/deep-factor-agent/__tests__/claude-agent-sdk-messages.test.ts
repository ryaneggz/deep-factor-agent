import { describe, it, expect } from "vitest";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import {
  extractSystemPrompt,
  convertMessagesToPrompt,
  convertMessages,
} from "../src/providers/claude-agent-sdk.js";

describe("extractSystemPrompt", () => {
  it("returns undefined when no SystemMessage is present", () => {
    const messages = [new HumanMessage("Hello")];
    expect(extractSystemPrompt(messages)).toBeUndefined();
  });

  it("extracts a single SystemMessage", () => {
    const messages = [new SystemMessage("You are helpful."), new HumanMessage("Hi")];
    expect(extractSystemPrompt(messages)).toBe("You are helpful.");
  });

  it("joins multiple SystemMessages with double-newlines", () => {
    const messages = [
      new SystemMessage("Be concise."),
      new SystemMessage("Use formal language."),
      new HumanMessage("Hello"),
    ];
    expect(extractSystemPrompt(messages)).toBe("Be concise.\n\nUse formal language.");
  });

  it("handles empty message array", () => {
    expect(extractSystemPrompt([])).toBeUndefined();
  });
});

describe("convertMessagesToPrompt", () => {
  it("converts a HumanMessage to [User] format", () => {
    const messages = [new HumanMessage("What is 2+2?")];
    expect(convertMessagesToPrompt(messages)).toBe("[User]: What is 2+2?");
  });

  it("skips SystemMessages (handled separately)", () => {
    const messages = [new SystemMessage("Be helpful."), new HumanMessage("Hi")];
    expect(convertMessagesToPrompt(messages)).toBe("[User]: Hi");
  });

  it("converts AIMessage with text content", () => {
    const messages = [new AIMessage({ content: "The answer is 4.", tool_calls: [] })];
    expect(convertMessagesToPrompt(messages)).toBe("[Assistant]: The answer is 4.");
  });

  it("converts AIMessage with tool_calls", () => {
    const messages = [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "calculator", args: { expr: "2+2" }, id: "call_1", type: "tool_call" },
        ],
      }),
    ];
    const result = convertMessagesToPrompt(messages);
    expect(result).toContain("[Tool Calls]:");
    expect(result).toContain('calculator({"expr":"2+2"}) [id: call_1]');
  });

  it("converts AIMessage with both text and tool_calls", () => {
    const messages = [
      new AIMessage({
        content: "Let me calculate that.",
        tool_calls: [
          { name: "calculator", args: { expr: "2+2" }, id: "call_1", type: "tool_call" },
        ],
      }),
    ];
    const result = convertMessagesToPrompt(messages);
    expect(result).toContain("[Assistant]: Let me calculate that.");
    expect(result).toContain("[Tool Calls]:");
    expect(result).toContain("calculator");
  });

  it("converts ToolMessage with tool_call_id", () => {
    const messages = [new ToolMessage({ content: "4", tool_call_id: "call_1" })];
    expect(convertMessagesToPrompt(messages)).toBe("[Tool Result (call_1)]: 4");
  });

  it("converts a full conversation round-trip", () => {
    const messages = [
      new SystemMessage("You are a calculator."),
      new HumanMessage("What is 2+2?"),
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "calculator", args: { expr: "2+2" }, id: "call_1", type: "tool_call" },
        ],
      }),
      new ToolMessage({ content: "4", tool_call_id: "call_1" }),
      new AIMessage({ content: "The answer is 4.", tool_calls: [] }),
    ];

    const result = convertMessagesToPrompt(messages);

    // SystemMessage should be skipped
    expect(result).not.toContain("You are a calculator");
    // Should contain all other parts
    expect(result).toContain("[User]: What is 2+2?");
    expect(result).toContain("[Tool Calls]:");
    expect(result).toContain("[Tool Result (call_1)]: 4");
    expect(result).toContain("[Assistant]: The answer is 4.");
  });

  it("handles AIMessage with empty content and no tool_calls", () => {
    const messages = [new AIMessage({ content: "", tool_calls: [] })];
    expect(convertMessagesToPrompt(messages)).toBe("");
  });

  it("handles content blocks (array of text blocks)", () => {
    const messages = [
      new HumanMessage({
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world" },
        ],
      }),
    ];
    expect(convertMessagesToPrompt(messages)).toBe("[User]: Hello world");
  });

  it("handles multiple tool_calls in a single AIMessage", () => {
    const messages = [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "read_file", args: { path: "a.ts" }, id: "call_1", type: "tool_call" },
          { name: "read_file", args: { path: "b.ts" }, id: "call_2", type: "tool_call" },
        ],
      }),
    ];
    const result = convertMessagesToPrompt(messages);
    expect(result).toContain('read_file({"path":"a.ts"}) [id: call_1]');
    expect(result).toContain('read_file({"path":"b.ts"}) [id: call_2]');
  });
});

describe("convertMessages", () => {
  it("returns both systemPrompt and prompt", () => {
    const messages = [new SystemMessage("Be helpful."), new HumanMessage("Hi there")];
    const result = convertMessages(messages);
    expect(result.systemPrompt).toBe("Be helpful.");
    expect(result.prompt).toBe("[User]: Hi there");
  });

  it("returns undefined systemPrompt when no SystemMessage", () => {
    const messages = [new HumanMessage("Hello")];
    const result = convertMessages(messages);
    expect(result.systemPrompt).toBeUndefined();
    expect(result.prompt).toBe("[User]: Hello");
  });

  it("handles empty messages array", () => {
    const result = convertMessages([]);
    expect(result.systemPrompt).toBeUndefined();
    expect(result.prompt).toBe("");
  });
});
