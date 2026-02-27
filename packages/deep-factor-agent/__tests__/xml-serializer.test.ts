import { describe, it, expect } from "vitest";
import {
  serializeThreadToXml,
  escapeXml,
} from "../src/xml-serializer.js";
import type { AgentEvent } from "../src/types.js";

describe("escapeXml", () => {
  it("escapes ampersand", () => {
    expect(escapeXml("a & b")).toBe("a &amp; b");
  });

  it("escapes less-than", () => {
    expect(escapeXml("a < b")).toBe("a &lt; b");
  });

  it("escapes greater-than", () => {
    expect(escapeXml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(escapeXml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeXml("it's")).toBe("it&apos;s");
  });

  it("escapes all special characters in a single string", () => {
    expect(escapeXml(`<div class="a" id='b'>&</div>`)).toBe(
      "&lt;div class=&quot;a&quot; id=&apos;b&apos;&gt;&amp;&lt;/div&gt;",
    );
  });

  it("leaves plain text unchanged", () => {
    expect(escapeXml("hello world 123")).toBe("hello world 123");
  });

  it("handles empty string", () => {
    expect(escapeXml("")).toBe("");
  });
});

describe("serializeThreadToXml", () => {
  it("returns empty thread for no events", () => {
    expect(serializeThreadToXml([])).toBe("<thread>\n</thread>");
  });

  it("serializes user message as human type", () => {
    const events: AgentEvent[] = [
      {
        type: "message",
        role: "user",
        content: "What is 2+2?",
        timestamp: 1000,
        iteration: 0,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('type="human"');
    expect(xml).toContain('id="0"');
    expect(xml).toContain('iteration="0"');
    expect(xml).toContain("What is 2+2?");
  });

  it("serializes assistant message as ai type", () => {
    const events: AgentEvent[] = [
      {
        type: "message",
        role: "assistant",
        content: "The answer is 4.",
        timestamp: 1000,
        iteration: 1,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('type="ai"');
    expect(xml).toContain("The answer is 4.");
  });

  it("serializes system message as system type", () => {
    const events: AgentEvent[] = [
      {
        type: "message",
        role: "system",
        content: "You are helpful.",
        timestamp: 1000,
        iteration: 0,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('type="system"');
    expect(xml).toContain("You are helpful.");
  });

  it("serializes tool_call as tool_input", () => {
    const events: AgentEvent[] = [
      {
        type: "tool_call",
        toolName: "calculator",
        toolCallId: "tc_1",
        args: { expression: "2+2" },
        timestamp: 1000,
        iteration: 1,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('type="tool_input"');
    expect(xml).toContain('name="calculator"');
    // JSON content is XML-escaped (quotes become &quot;)
    expect(xml).toContain("{&quot;expression&quot;:&quot;2+2&quot;}");
  });

  it("serializes tool_result as tool_output with name resolved from tool_call", () => {
    const events: AgentEvent[] = [
      {
        type: "tool_call",
        toolName: "calculator",
        toolCallId: "tc_1",
        args: { expression: "2+2" },
        timestamp: 1000,
        iteration: 1,
      },
      {
        type: "tool_result",
        toolCallId: "tc_1",
        result: "4",
        timestamp: 1001,
        iteration: 1,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('type="tool_output"');
    expect(xml).toContain('name="calculator"');
    expect(xml).toContain('status="success"');
    expect(xml).toContain(">4</event>");
  });

  it("falls back to unknown when tool_call not found for tool_result", () => {
    const events: AgentEvent[] = [
      {
        type: "tool_result",
        toolCallId: "tc_missing",
        result: "something",
        timestamp: 1000,
        iteration: 1,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('name="unknown"');
  });

  it("serializes error events with recoverable attribute", () => {
    const events: AgentEvent[] = [
      {
        type: "error",
        error: "Something went wrong",
        recoverable: true,
        timestamp: 1000,
        iteration: 1,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('type="error"');
    expect(xml).toContain('recoverable="true"');
    expect(xml).toContain("Something went wrong");
  });

  it("serializes non-recoverable errors", () => {
    const events: AgentEvent[] = [
      {
        type: "error",
        error: "Fatal error",
        recoverable: false,
        timestamp: 1000,
        iteration: 2,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('recoverable="false"');
  });

  it("serializes human_input_requested events", () => {
    const events: AgentEvent[] = [
      {
        type: "human_input_requested",
        question: "Should I continue?",
        timestamp: 1000,
        iteration: 1,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('type="human_input_requested"');
    expect(xml).toContain("Should I continue?");
  });

  it("serializes human_input_received events", () => {
    const events: AgentEvent[] = [
      {
        type: "human_input_received",
        response: "Yes, go ahead",
        timestamp: 1000,
        iteration: 1,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('type="human_input_received"');
    expect(xml).toContain("Yes, go ahead");
  });

  it("serializes completion events", () => {
    const events: AgentEvent[] = [
      {
        type: "completion",
        result: "Task done",
        verified: true,
        timestamp: 1000,
        iteration: 1,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('type="completion"');
    expect(xml).toContain("Task done");
  });

  it("serializes summary events with summarizedIterations", () => {
    const events: AgentEvent[] = [
      {
        type: "summary",
        summarizedIterations: [1, 2, 3],
        summary: "Previous work summary",
        timestamp: 1000,
        iteration: 4,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('type="summary"');
    expect(xml).toContain('summarizedIterations="1,2,3"');
    expect(xml).toContain("Previous work summary");
  });

  it("escapes content in event bodies", () => {
    const events: AgentEvent[] = [
      {
        type: "message",
        role: "user",
        content: "What about <script>alert('xss')</script>?",
        timestamp: 1000,
        iteration: 0,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain("&lt;script&gt;alert(&apos;xss&apos;)&lt;/script&gt;");
    expect(xml).not.toContain("<script>");
  });

  it("escapes attribute values", () => {
    const events: AgentEvent[] = [
      {
        type: "tool_call",
        toolName: 'my"tool',
        toolCallId: "tc_1",
        args: {},
        timestamp: 1000,
        iteration: 1,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('name="my&quot;tool"');
  });

  it("assigns sequential ids", () => {
    const events: AgentEvent[] = [
      {
        type: "message",
        role: "user",
        content: "Hello",
        timestamp: 1000,
        iteration: 0,
      },
      {
        type: "message",
        role: "assistant",
        content: "Hi",
        timestamp: 1001,
        iteration: 1,
      },
      {
        type: "completion",
        result: "Hi",
        verified: false,
        timestamp: 1002,
        iteration: 1,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toContain('id="0"');
    expect(xml).toContain('id="1"');
    expect(xml).toContain('id="2"');
  });

  it("appends assistantPrefill after closing tag", () => {
    const events: AgentEvent[] = [
      {
        type: "message",
        role: "user",
        content: "Hello",
        timestamp: 1000,
        iteration: 0,
      },
    ];
    const xml = serializeThreadToXml(events, {
      assistantPrefill: "Based on the above, I will now",
    });
    expect(xml).toContain("</thread>\nBased on the above, I will now");
  });

  it("appends assistantPrefill to empty thread", () => {
    const xml = serializeThreadToXml([], {
      assistantPrefill: "Starting fresh",
    });
    expect(xml).toBe("<thread>\n</thread>\nStarting fresh");
  });

  it("produces valid XML structure", () => {
    const events: AgentEvent[] = [
      {
        type: "message",
        role: "user",
        content: "What is 2+2?",
        timestamp: 1000,
        iteration: 0,
      },
      {
        type: "tool_call",
        toolName: "calculator",
        toolCallId: "tc_1",
        args: { expression: "2+2" },
        timestamp: 1001,
        iteration: 1,
      },
      {
        type: "tool_result",
        toolCallId: "tc_1",
        result: 4,
        timestamp: 1002,
        iteration: 1,
      },
      {
        type: "message",
        role: "assistant",
        content: "The answer is 4.",
        timestamp: 1003,
        iteration: 1,
      },
      {
        type: "completion",
        result: "The answer is 4.",
        verified: true,
        timestamp: 1004,
        iteration: 1,
      },
    ];
    const xml = serializeThreadToXml(events);
    expect(xml).toMatch(/^<thread>\n/);
    expect(xml).toMatch(/\n<\/thread>$/);
    // Each event is on its own line
    const lines = xml.split("\n");
    expect(lines[0]).toBe("<thread>");
    expect(lines[lines.length - 1]).toBe("</thread>");
    // All intermediate lines should be events
    for (let i = 1; i < lines.length - 1; i++) {
      expect(lines[i]).toMatch(/^\s*<event /);
      expect(lines[i]).toMatch(/<\/event>$/);
    }
  });
});
