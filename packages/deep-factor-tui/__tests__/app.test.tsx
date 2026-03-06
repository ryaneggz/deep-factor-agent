import React from "react";
import { Box } from "ink";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "ink-testing-library";
import type { UseAgentReturn, ChatMessage } from "../src/types.js";
import type { TokenUsage } from "deep-factor-agent";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const zeroUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

let mockUseAgent: UseAgentReturn = {
  messages: [],
  status: "idle",
  usage: zeroUsage,
  iterations: 0,
  error: null,
  sendPrompt: vi.fn(),
  submitHumanInput: vi.fn(),
  humanInputRequest: null,
  resetThread: vi.fn(),
};

vi.mock("../src/hooks/useAgent.js", () => ({
  useAgent: () => mockUseAgent,
}));

vi.mock("../src/tools/bash.js", () => ({
  bashTool: { name: "bash", description: "mock", invoke: vi.fn() },
}));

vi.mock("deep-factor-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("deep-factor-agent")>();
  return {
    ...actual,
    createClaudeAgentSdkProvider: vi.fn(() => ({
      invoke: vi.fn(),
      bindTools: vi.fn(),
    })),
  };
});

// Import after mocks are set up
const { TuiApp } = await import("../src/app.js");

/** Wrap TuiApp in a Box that simulates FullScreenBox (explicit height + width). */
function renderApp(overrides?: Partial<UseAgentReturn>) {
  if (overrides) {
    mockUseAgent = { ...mockUseAgent, ...overrides };
  }
  return render(
    <Box height={24} width={80}>
      <TuiApp model="gpt-4" maxIter={10} enableBash={false} provider="langchain" />
    </Box>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TuiApp integration", () => {
  beforeEach(() => {
    mockUseAgent = {
      messages: [],
      status: "idle",
      usage: zeroUsage,
      iterations: 0,
      error: null,
      sendPrompt: vi.fn(),
      submitHumanInput: vi.fn(),
      humanInputRequest: null,
      resetThread: vi.fn(),
    };
  });

  it("renders header, content, and footer in idle state", () => {
    const { lastFrame } = renderApp();
    const frame = lastFrame()!;
    // Header
    expect(frame).toContain("Deep Factor TUI");
    expect(frame).toContain("gpt-4");
    expect(frame).toContain("idle");
    // Footer status line
    expect(frame).toContain("Tokens:");
    // Footer input bar (idle → shows prompt)
    expect(frame).toContain(">");
  });

  it("output fills the full height (24 lines)", () => {
    const { lastFrame } = renderApp();
    const frame = lastFrame()!;
    const lines = frame.split("\n");
    // With the wrapping Box height=24, output should be exactly 24 lines
    expect(lines.length).toBe(24);
  });

  it("displays messages when useAgent returns them", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "What is 2+2?" },
      { role: "assistant", content: "4" },
    ];
    const { lastFrame } = renderApp({ messages: msgs, status: "done", iterations: 1 });
    const frame = lastFrame()!;
    expect(frame).toContain("What is 2+2?");
    expect(frame).toContain("4");
  });

  it('shows "Thinking..." when status is running', () => {
    const { lastFrame } = renderApp({ status: "running" });
    expect(lastFrame()).toContain("Thinking...");
  });

  it("shows error when status is error", () => {
    const { lastFrame } = renderApp({
      status: "error",
      error: new Error("API rate limit exceeded"),
    });
    expect(lastFrame()).toContain("API rate limit exceeded");
  });
});
