import type { AgentEvent } from "deep-factor-agent";
import { describe, expect, it } from "vitest";
import {
  eventsToChatMessages,
  filterDisplayMessages,
  isToolCallEnvelopeMessage,
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
});
