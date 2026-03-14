import type { AgentEvent } from "deep-factor-agent";
import { describe, expect, it } from "vitest";
import {
  eventsToChatMessages,
  filterDisplayMessages,
  isToolCallEnvelopeMessage,
  containsToolCallBlock,
} from "../src/hooks/useAgent.js";

describe("eventsToChatMessages", () => {
  it("surfaces error events as error messages", () => {
    const events: AgentEvent[] = [
      {
        type: "message",
        role: "user",
        content: "Hello",
        timestamp: 1,
        iteration: 1,
      },
      {
        type: "error",
        error: "Authentication failed: invalid API key",
        recoverable: true,
        timestamp: 2,
        iteration: 1,
      },
      {
        type: "error",
        error: "Authentication failed: invalid API key",
        recoverable: false,
        timestamp: 3,
        iteration: 2,
      },
    ];

    const messages = eventsToChatMessages(events);

    expect(messages).toHaveLength(3);
    expect(messages[1]).toMatchObject({
      role: "error",
      content: "Error: Authentication failed: invalid API key",
    });
    expect(messages[2]).toMatchObject({
      role: "error",
      content: "Error: Authentication failed: invalid API key",
    });
  });

  it("preserves parallel tool metadata on tool results", () => {
    const events: AgentEvent[] = [
      {
        type: "tool_call",
        toolName: "read_file",
        toolCallId: "tool-1",
        args: { path: "a.txt" },
        display: { kind: "file_read", label: "Read(a.txt)" },
        timestamp: 1,
        iteration: 1,
      },
      {
        type: "tool_result",
        toolCallId: "tool-1",
        result: "A",
        display: {
          kind: "file_read",
          label: "Read(a.txt)",
          fileReads: [
            {
              path: "a.txt",
              startLine: 1,
              endLine: 1,
              totalLines: 1,
              previewLines: ["1| A"],
              detailLines: ["1| A"],
            },
          ],
        },
        parallelGroup: "pg-1",
        durationMs: 12,
        timestamp: 2,
        iteration: 1,
      },
    ];

    const messages = eventsToChatMessages(events);

    expect(messages[1]).toMatchObject({
      role: "tool_result",
      content: "A",
      toolCallId: "tool-1",
      parallelGroup: "pg-1",
      durationMs: 12,
      toolDisplay: {
        kind: "file_read",
        label: "Read(a.txt)",
        fileReads: [
          {
            path: "a.txt",
            startLine: 1,
            endLine: 1,
            totalLines: 1,
            previewLines: ["1| A"],
            detailLines: ["1| A"],
          },
        ],
      },
    });
  });

  it("detects and filters pure assistant JSON tool-call envelopes from display only", () => {
    const jsonEnvelope = [
      "```json",
      '{"tool_calls":[{"id":"tool-1","name":"bash","args":{"command":"pwd"}}]}',
      "```",
    ].join("\n");
    const messages = eventsToChatMessages([
      {
        type: "message",
        role: "assistant",
        content: jsonEnvelope,
        timestamp: 1,
        iteration: 1,
      },
      {
        type: "message",
        role: "assistant",
        content: "Working on it.",
        timestamp: 2,
        iteration: 1,
      },
    ]);

    expect(isToolCallEnvelopeMessage(jsonEnvelope)).toBe(true);
    expect(messages).toHaveLength(2);
    expect(filterDisplayMessages(messages)).toEqual([
      { id: "msg-1", role: "assistant", content: "Working on it." },
    ]);
  });

  it("containsToolCallBlock detects fenced JSON inside mixed prose", () => {
    const mixed = [
      "I will list files.",
      '```json\n{"tool_calls":[{"name":"bash","args":{},"id":"1"}]}\n```',
      "And more text.",
    ].join("\n");
    expect(containsToolCallBlock(mixed)).toBe(true);
  });

  it("containsToolCallBlock detects bare JSON array tool calls", () => {
    const bare = 'Some text\n[{"name":"bash","args":{},"id":"1"}]\nMore text';
    expect(containsToolCallBlock(bare)).toBe(true);
  });

  it("containsToolCallBlock returns false for plain text", () => {
    expect(containsToolCallBlock("Just regular text")).toBe(false);
  });

  it("containsToolCallBlock returns false for non-tool-call JSON arrays", () => {
    expect(containsToolCallBlock('[{"x": 1}, {"y": 2}]')).toBe(false);
  });

  it("filterDisplayMessages strips tool call blocks but keeps surrounding prose", () => {
    const mixed = [
      "I will list files.",
      '```json\n{"tool_calls":[{"name":"bash","args":{},"id":"1"}]}\n```',
      "And then review.",
    ].join("\n");
    const messages = eventsToChatMessages([
      {
        type: "message",
        role: "assistant",
        content: mixed,
        timestamp: 1,
        iteration: 1,
      },
    ]);

    const filtered = filterDisplayMessages(messages);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].content).toBe("I will list files.\n\nAnd then review.");
    expect(filtered[0].content).not.toContain("```json");
  });

  it("filterDisplayMessages removes messages that become empty after stripping", () => {
    const onlyJson = '```json\n{"tool_calls":[{"name":"bash","args":{},"id":"1"}]}\n```';
    const messages = eventsToChatMessages([
      {
        type: "message",
        role: "assistant",
        content: onlyJson,
        timestamp: 1,
        iteration: 1,
      },
    ]);

    const filtered = filterDisplayMessages(messages);
    expect(filtered).toHaveLength(0);
  });

  it("filterDisplayMessages strips bare JSON array tool calls from messages", () => {
    const bare =
      'Here are the results:\n[{"name":"bash","args":{"command":"ls"},"id":"call_1"}]\nLet me run that.';
    const messages = eventsToChatMessages([
      {
        type: "message",
        role: "assistant",
        content: bare,
        timestamp: 1,
        iteration: 1,
      },
    ]);

    const filtered = filterDisplayMessages(messages);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].content).not.toContain("[{");
    expect(filtered[0].content).toContain("Here are the results:");
  });
});
