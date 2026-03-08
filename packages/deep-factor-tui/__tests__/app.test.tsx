import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "ink-testing-library";
import type { UseAgentReturn } from "../src/types.js";
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
  plan: null,
  sendPrompt: vi.fn(),
  submitHumanInput: vi.fn(),
  humanInputRequest: null,
};

vi.mock("../src/hooks/useAgent.js", () => ({
  useAgent: () => mockUseAgent,
}));

vi.mock("../src/tools/bash.js", () => ({
  createBashTool: () => ({ name: "bash", description: "mock", invoke: vi.fn() }),
  bashTool: { name: "bash", description: "mock", invoke: vi.fn() },
}));

// Import after mocks are set up
const { TuiApp } = await import("../src/app.js");

function renderApp(overrides?: Partial<UseAgentReturn>) {
  if (overrides) {
    mockUseAgent = { ...mockUseAgent, ...overrides };
  }
  // Note: lastFrame() only shows the live (non-static) portion with ink-testing-library
  return render(<TuiApp model="gpt-4" maxIter={10} sandbox="workspace" />);
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
      plan: null,
      sendPrompt: vi.fn(),
      submitHumanInput: vi.fn(),
      humanInputRequest: null,
    };
  });

  it("renders live section in idle state", () => {
    const { lastFrame } = renderApp();
    const frame = lastFrame()!;
    // Live section shows status line and input bar
    expect(frame).toContain("idle");
    expect(frame).toContain("Tokens:");
    expect(frame).toContain(">");
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
