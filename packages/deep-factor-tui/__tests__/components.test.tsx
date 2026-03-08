import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { Header } from "../src/components/Header.js";
import { StatusLine } from "../src/components/StatusLine.js";
import { MessageBubble } from "../src/components/MessageBubble.js";
import { LiveSection } from "../src/components/LiveSection.js";
import type { TokenUsage } from "deep-factor-agent";

const zeroUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
describe("Header", () => {
  it("renders the title", () => {
    const { lastFrame } = render(<Header model="gpt-4" />);
    expect(lastFrame()).toContain("Deep Factor TUI");
  });

  it("renders the model name", () => {
    const { lastFrame } = render(<Header model="claude-sonnet" />);
    expect(lastFrame()).toContain("claude-sonnet");
  });
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
// MessageBubble
// ---------------------------------------------------------------------------
describe("MessageBubble", () => {
  it("renders user message with 'You:' prefix", () => {
    const { lastFrame } = render(
      <MessageBubble message={{ id: "msg-0", role: "user", content: "test input" }} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("You:");
    expect(frame).toContain("test input");
  });

  it("renders assistant message with 'AI:' prefix", () => {
    const { lastFrame } = render(
      <MessageBubble message={{ id: "msg-0", role: "assistant", content: "test reply" }} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("AI:");
    expect(frame).toContain("test reply");
  });

  it("truncates tool_result at 200 chars", () => {
    const longContent = "x".repeat(300);
    const { lastFrame } = render(
      <MessageBubble message={{ id: "msg-0", role: "tool_result", content: longContent }} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("...");
    expect(frame).not.toContain(longContent);
  });

  it("renders tool_call with tool name", () => {
    const { lastFrame } = render(
      <MessageBubble
        message={{
          id: "msg-0",
          role: "tool_call",
          content: "bash",
          toolName: "bash",
          toolArgs: { cmd: "ls" },
        }}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("bash");
  });
});

// ---------------------------------------------------------------------------
// LiveSection
// ---------------------------------------------------------------------------
describe("LiveSection", () => {
  const noop = () => {};

  it('shows "Thinking..." when running', () => {
    const { lastFrame } = render(
      <LiveSection
        status="running"
        error={null}
        plan={null}
        humanInputRequest={null}
        usage={zeroUsage}
        iterations={0}
        onSubmit={noop}
      />,
    );
    expect(lastFrame()).toContain("Thinking...");
  });

  it("shows error message", () => {
    const { lastFrame } = render(
      <LiveSection
        status="error"
        error={new Error("something broke")}
        plan={null}
        humanInputRequest={null}
        usage={zeroUsage}
        iterations={0}
        onSubmit={noop}
      />,
    );
    expect(lastFrame()).toContain("something broke");
  });

  it("shows human input request with choices", () => {
    const { lastFrame } = render(
      <LiveSection
        status="pending_input"
        error={null}
        plan={null}
        humanInputRequest={{
          type: "human_input_requested",
          question: "Pick a color",
          choices: ["red", "blue"],
        }}
        usage={zeroUsage}
        iterations={0}
        onSubmit={noop}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Pick a color");
    expect(frame).toContain("red");
    expect(frame).toContain("blue");
  });

  it("shows InputBar when idle", () => {
    const { lastFrame } = render(
      <LiveSection
        status="idle"
        error={null}
        plan={null}
        humanInputRequest={null}
        usage={zeroUsage}
        iterations={0}
        onSubmit={noop}
      />,
    );
    expect(lastFrame()).toContain(">");
  });

  it("hides InputBar when running", () => {
    const { lastFrame } = render(
      <LiveSection
        status="running"
        error={null}
        plan={null}
        humanInputRequest={null}
        usage={zeroUsage}
        iterations={0}
        onSubmit={noop}
      />,
    );
    const frame = lastFrame()!;
    const lines = frame.split("\n");
    const hasInputPrompt = lines.some((l) => l.includes(">") && l.includes("_"));
    expect(hasInputPrompt).toBe(false);
  });

  it("renders StatusLine with usage info", () => {
    const usage: TokenUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    const { lastFrame } = render(
      <LiveSection
        status="idle"
        error={null}
        plan={null}
        humanInputRequest={null}
        usage={usage}
        iterations={2}
        onSubmit={noop}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("15");
    expect(frame).toContain("2");
  });
});
