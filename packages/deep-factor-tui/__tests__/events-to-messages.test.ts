import { describe, it, expect } from "vitest";
import { eventsToChatMessages } from "../src/hooks/useAgent.js";
import type { AgentEvent } from "deep-factor-agent";

describe("eventsToChatMessages — error event surfacing (no mocks)", () => {
  it("maps error events to tool_result chat messages", () => {
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
        recoverable: true,
        timestamp: 3,
        iteration: 2,
      },
      {
        type: "error",
        error: "Authentication failed: invalid API key",
        recoverable: false,
        timestamp: 4,
        iteration: 3,
      },
    ];

    const messages = eventsToChatMessages(events);

    // 1 user message + 3 error messages
    expect(messages).toHaveLength(4);

    // First message is the user message
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello");

    // Remaining 3 are error events surfaced as tool_result
    for (let i = 1; i <= 3; i++) {
      expect(messages[i].role).toBe("tool_result");
      expect(messages[i].content).toContain("Error:");
      expect(messages[i].content).toContain("Authentication failed: invalid API key");
    }
  });

  it("interleaves error messages with other events in order", () => {
    const events: AgentEvent[] = [
      {
        type: "message",
        role: "user",
        content: "Run a command",
        timestamp: 1,
        iteration: 1,
      },
      {
        type: "tool_call",
        toolName: "bash",
        toolCallId: "tc1",
        args: { cmd: "ls" },
        timestamp: 2,
        iteration: 1,
      },
      {
        type: "error",
        error: "Process exited with code 1",
        recoverable: true,
        timestamp: 3,
        iteration: 1,
      },
    ];

    const messages = eventsToChatMessages(events);

    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("tool_call");
    expect(messages[2].role).toBe("tool_result");
    expect(messages[2].content).toContain("Process exited with code 1");
  });

  it("does not drop error events (previously they were silently skipped)", () => {
    const events: AgentEvent[] = [
      {
        type: "error",
        error: "Connection refused",
        recoverable: false,
        timestamp: 1,
        iteration: 1,
      },
    ];

    const messages = eventsToChatMessages(events);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain("Connection refused");
  });
});
