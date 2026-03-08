import type { AgentEvent } from "deep-factor-agent";
import { describe, expect, it } from "vitest";
import { eventsToChatMessages } from "../src/hooks/useAgent.js";

describe("eventsToChatMessages", () => {
  it("surfaces error events as tool_result messages", () => {
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
      role: "tool_result",
      content: "Error: Authentication failed: invalid API key",
    });
    expect(messages[2]).toMatchObject({
      role: "tool_result",
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
        timestamp: 1,
        iteration: 1,
      },
      {
        type: "tool_result",
        toolCallId: "tool-1",
        result: "A",
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
    });
  });
});
