import { describe, it, expect } from "vitest";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { messagesToXml, messagesToPrompt, parseToolCalls } from "../../src/providers/messages-to-xml.js";

describe("messagesToXml", () => {
  it("serializes system/human/ai/tool messages to XML", () => {
    const messages = [
      new SystemMessage("You are helpful"),
      new HumanMessage("Hello"),
      new AIMessage({
        content: "I'll help",
        tool_calls: [{ name: "calc", id: "tc_1", args: { x: 1 } }],
      }),
      new ToolMessage({ tool_call_id: "tc_1", content: "42" }),
    ];

    const xml = messagesToXml(messages);

    expect(xml).toMatch(/^<thread>/);
    expect(xml).toMatch(/<\/thread>$/);
    expect(xml).toContain('<event type="system"');
    expect(xml).toContain('<event type="human"');
    expect(xml).toContain('<event type="ai"');
    expect(xml).toContain('<event type="tool_input"');
    expect(xml).toContain('name="calc"');
    expect(xml).toContain('call_id="tc_1"');
    expect(xml).toContain('<event type="tool_output"');
  });

  it("resolves tool names from AIMessage.tool_calls map", () => {
    const messages = [
      new AIMessage({
        content: "",
        tool_calls: [{ name: "search", id: "tc_2", args: { q: "test" } }],
      }),
      new ToolMessage({ tool_call_id: "tc_2", content: "results" }),
    ];

    const xml = messagesToXml(messages);
    // tool_output should resolve name="search" via the map
    expect(xml).toContain('<event type="tool_output"');
    expect(xml).toContain('name="search"');
    expect(xml).toContain('call_id="tc_2"');
  });

  it("falls back to 'unknown' for unresolvable tool names", () => {
    const messages = [
      new ToolMessage({ tool_call_id: "orphan_id", content: "result" }),
    ];

    const xml = messagesToXml(messages);
    expect(xml).toContain('name="unknown"');
  });

  it("escapes XML special characters", () => {
    const messages = [
      new HumanMessage('What is <b>"1 & 2"</b>?'),
    ];

    const xml = messagesToXml(messages);
    expect(xml).toContain("&lt;b&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;");
  });

  it("passes through pre-serialized XML (content starts with <thread>)", () => {
    const preSerialized = '<thread>\n  <event type="human" id="0" iteration="1">Hello</event>\n</thread>';
    const messages = [new HumanMessage(preSerialized)];

    const xml = messagesToXml(messages);
    expect(xml).toBe(preSerialized);
  });

  it("sets iteration='0' for all events", () => {
    const messages = [
      new SystemMessage("sys"),
      new HumanMessage("hi"),
    ];

    const xml = messagesToXml(messages);
    const iterationMatches = xml.match(/iteration="0"/g);
    expect(iterationMatches).toHaveLength(2);
  });
});

describe("messagesToPrompt", () => {
  it("serializes system/human/ai/tool messages to labeled text", () => {
    const messages = [
      new SystemMessage("You are helpful"),
      new HumanMessage("Hello"),
      new AIMessage("Hi there"),
      new ToolMessage({ tool_call_id: "call_1", content: "result" }),
    ];

    const prompt = messagesToPrompt(messages);
    expect(prompt).toContain("[System]\nYou are helpful");
    expect(prompt).toContain("[User]\nHello");
    expect(prompt).toContain("[Assistant]\nHi there");
    expect(prompt).toContain("[Tool Result]\nresult");
  });

  it("separates messages with double newlines", () => {
    const messages = [new HumanMessage("First"), new HumanMessage("Second")];
    const prompt = messagesToPrompt(messages);
    expect(prompt).toBe("[User]\nFirst\n\n[User]\nSecond");
  });
});

describe("parseToolCalls", () => {
  it("extracts tool calls from a JSON code block", () => {
    const text = 'Some text\n\n```json\n{"tool_calls": [{"name": "calc", "args": {"x": 1}, "id": "c1"}]}\n```\n\nMore text';
    const result = parseToolCalls(text);
    expect(result).toEqual([{ name: "calc", args: { x: 1 }, id: "c1" }]);
  });

  it("returns empty array when no JSON block present", () => {
    expect(parseToolCalls("Just plain text")).toEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseToolCalls("```json\n{ invalid json }\n```")).toEqual([]);
  });

  it("assigns default ids when missing", () => {
    const text = '```json\n{"tool_calls": [{"name": "t", "args": {}}]}\n```';
    const result = parseToolCalls(text);
    expect(result[0].id).toBe("call_0");
  });

  it("handles multiple tool calls", () => {
    const text = '```json\n{"tool_calls": [{"name": "a", "args": {}, "id": "1"}, {"name": "b", "args": {"k": "v"}, "id": "2"}]}\n```';
    const result = parseToolCalls(text);
    expect(result).toHaveLength(2);
  });
});
