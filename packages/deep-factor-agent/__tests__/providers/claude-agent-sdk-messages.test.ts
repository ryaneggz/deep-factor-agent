import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { describe, it, expect } from "vitest";
import {
  convertMessages,
  convertMessagesToPrompt,
  extractSystemPrompt,
} from "../../src/providers/claude-agent-sdk.js";

describe("extractSystemPrompt", () => {
  it("returns undefined when no SystemMessage is present", () => {
    expect(extractSystemPrompt([new HumanMessage("Hello")])).toBeUndefined();
  });

  it("extracts a single SystemMessage", () => {
    expect(
      extractSystemPrompt([new SystemMessage("You are helpful."), new HumanMessage("Hi")]),
    ).toBe("You are helpful.");
  });

  it("joins multiple SystemMessages with double newlines", () => {
    expect(
      extractSystemPrompt([
        new SystemMessage("Be concise."),
        new SystemMessage("Use formal language."),
        new HumanMessage("Hello"),
      ]),
    ).toBe("Be concise.\n\nUse formal language.");
  });
});

describe("convertMessagesToPrompt", () => {
  it("converts a HumanMessage to user format", () => {
    expect(convertMessagesToPrompt([new HumanMessage("What is 2+2?")])).toBe(
      "[User]: What is 2+2?",
    );
  });

  it("skips SystemMessages", () => {
    expect(
      convertMessagesToPrompt([new SystemMessage("Be helpful."), new HumanMessage("Hi")]),
    ).toBe("[User]: Hi");
  });

  it("converts AIMessage text content", () => {
    expect(
      convertMessagesToPrompt([new AIMessage({ content: "The answer is 4.", tool_calls: [] })]),
    ).toBe("[Assistant]: The answer is 4.");
  });

  it("converts AIMessage tool calls", () => {
    const result = convertMessagesToPrompt([
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "calculator", args: { expr: "2+2" }, id: "call_1", type: "tool_call" },
        ],
      }),
    ]);

    expect(result).toContain("[Tool Calls]:");
    expect(result).toContain('calculator({"expr":"2+2"}) [id: call_1]');
  });

  it("converts ToolMessage results", () => {
    expect(
      convertMessagesToPrompt([new ToolMessage({ content: "4", tool_call_id: "call_1" })]),
    ).toBe("[Tool Result (call_1)]: 4");
  });

  it("handles content blocks", () => {
    expect(
      convertMessagesToPrompt([
        new HumanMessage({
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
        }),
      ]),
    ).toBe("[User]: Hello world");
  });
});

describe("convertMessages", () => {
  it("returns both systemPrompt and prompt", () => {
    expect(
      convertMessages([new SystemMessage("Be helpful."), new HumanMessage("Hi there")]),
    ).toEqual({
      systemPrompt: "Be helpful.",
      prompt: "[User]: Hi there",
    });
  });
});
