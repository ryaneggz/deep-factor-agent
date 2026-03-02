import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { Header } from "../src/components/Header.js";
import { StatusLine } from "../src/components/StatusLine.js";
import { MessageList } from "../src/components/MessageList.js";
import { MessageBubble } from "../src/components/MessageBubble.js";
import { Content } from "../src/components/Content.js";
import { Footer } from "../src/components/Footer.js";
import type { AgentStatus, ChatMessage } from "../src/types.js";
import type { TokenUsage } from "deep-factor-agent";

const zeroUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
describe("Header", () => {
  it("renders the title", () => {
    const { lastFrame } = render(<Header model="gpt-4" status="idle" />);
    expect(lastFrame()).toContain("Deep Factor TUI");
  });

  it("renders the model name", () => {
    const { lastFrame } = render(<Header model="claude-sonnet" status="idle" />);
    expect(lastFrame()).toContain("claude-sonnet");
  });

  const statuses: AgentStatus[] = ["idle", "running", "done", "error", "pending_input"];
  for (const status of statuses) {
    it(`renders status "${status}"`, () => {
      const { lastFrame } = render(<Header model="gpt-4" status={status} />);
      expect(lastFrame()).toContain(status);
    });
  }
});

// ---------------------------------------------------------------------------
// StatusLine
// ---------------------------------------------------------------------------
describe("StatusLine", () => {
  it("renders token counts", () => {
    const usage: TokenUsage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };
    const { lastFrame } = render(<StatusLine usage={usage} iterations={3} status="done" />);
    const frame = lastFrame()!;
    expect(frame).toContain("150");
    expect(frame).toContain("100");
    expect(frame).toContain("50");
  });

  it("renders iterations", () => {
    const { lastFrame } = render(<StatusLine usage={zeroUsage} iterations={7} status="running" />);
    expect(lastFrame()).toContain("7");
  });

  it("renders status text", () => {
    const { lastFrame } = render(<StatusLine usage={zeroUsage} iterations={0} status="idle" />);
    expect(lastFrame()).toContain("idle");
  });
});

// ---------------------------------------------------------------------------
// MessageList
// ---------------------------------------------------------------------------
describe("MessageList", () => {
  it("renders empty without error", () => {
    const { lastFrame } = render(<MessageList messages={[]} />);
    expect(lastFrame()).toBeDefined();
  });

  it("renders user and assistant messages", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ];
    const { lastFrame } = render(<MessageList messages={msgs} />);
    const frame = lastFrame()!;
    expect(frame).toContain("Hello");
    expect(frame).toContain("Hi there");
  });

  it("truncates to maxVisible", () => {
    const msgs: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: "user" as const,
      content: `msg-${i}`,
    }));
    const { lastFrame } = render(<MessageList messages={msgs} maxVisible={3} />);
    const frame = lastFrame()!;
    // Should show last 3 messages (indices 7, 8, 9)
    expect(frame).toContain("msg-7");
    expect(frame).toContain("msg-8");
    expect(frame).toContain("msg-9");
    // Should not show earlier messages
    expect(frame).not.toContain("msg-0");
    expect(frame).not.toContain("msg-6");
  });
});

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------
describe("MessageBubble", () => {
  it("renders user message with 'You:' prefix", () => {
    const { lastFrame } = render(
      <MessageBubble message={{ role: "user", content: "test input" }} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("You:");
    expect(frame).toContain("test input");
  });

  it("renders assistant message with 'AI:' prefix", () => {
    const { lastFrame } = render(
      <MessageBubble message={{ role: "assistant", content: "test reply" }} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("AI:");
    expect(frame).toContain("test reply");
  });

  it("truncates tool_result at 200 chars", () => {
    const longContent = "x".repeat(300);
    const { lastFrame } = render(
      <MessageBubble message={{ role: "tool_result", content: longContent }} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("...");
    // Should not contain the full 300-char string
    expect(frame).not.toContain(longContent);
  });

  it("renders tool_call with tool name", () => {
    const { lastFrame } = render(
      <MessageBubble
        message={{ role: "tool_call", content: "bash", toolName: "bash", toolArgs: { cmd: "ls" } }}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("bash");
  });
});

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------
describe("Content", () => {
  it("renders messages", () => {
    const msgs: ChatMessage[] = [{ role: "user", content: "hello world" }];
    const { lastFrame } = render(
      <Content messages={msgs} status="idle" error={null} humanInputRequest={null} />,
    );
    expect(lastFrame()).toContain("hello world");
  });

  it('shows "Thinking..." when running', () => {
    const { lastFrame } = render(
      <Content messages={[]} status="running" error={null} humanInputRequest={null} />,
    );
    expect(lastFrame()).toContain("Thinking...");
  });

  it("shows error message", () => {
    const { lastFrame } = render(
      <Content
        messages={[]}
        status="error"
        error={new Error("something broke")}
        humanInputRequest={null}
      />,
    );
    expect(lastFrame()).toContain("something broke");
  });

  it("shows human input request with choices", () => {
    const { lastFrame } = render(
      <Content
        messages={[]}
        status="pending_input"
        error={null}
        humanInputRequest={{
          type: "human_input_requested",
          question: "Pick a color",
          choices: ["red", "blue"],
        }}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Pick a color");
    expect(frame).toContain("red");
    expect(frame).toContain("blue");
  });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
describe("Footer", () => {
  const noop = () => {};

  it("renders StatusLine", () => {
    const usage: TokenUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    const { lastFrame } = render(
      <Footer usage={usage} iterations={2} status="idle" onSubmit={noop} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("15");
    expect(frame).toContain("2");
  });

  it("shows InputBar when idle", () => {
    const { lastFrame } = render(
      <Footer usage={zeroUsage} iterations={0} status="idle" onSubmit={noop} />,
    );
    expect(lastFrame()).toContain(">");
  });

  it("shows InputBar when done", () => {
    const { lastFrame } = render(
      <Footer usage={zeroUsage} iterations={0} status="done" onSubmit={noop} />,
    );
    expect(lastFrame()).toContain(">");
  });

  it("hides InputBar when running", () => {
    const { lastFrame } = render(
      <Footer usage={zeroUsage} iterations={0} status="running" onSubmit={noop} />,
    );
    // The ">" prompt from InputBar should not appear
    // But StatusLine text should still be there
    expect(lastFrame()).toContain("running");
    // InputBar renders "> " as its prompt indicator
    const frame = lastFrame()!;
    const lines = frame.split("\n");
    const hasInputPrompt = lines.some((l) => l.includes(">") && l.includes("_"));
    expect(hasInputPrompt).toBe(false);
  });
});
