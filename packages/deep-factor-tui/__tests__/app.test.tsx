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
  submitPendingInput: vi.fn(),
  pendingUiState: null,
};
const mockClaudeCliProvider = { invoke: vi.fn(), bindTools: vi.fn() };
const createClaudeCliProviderMock = vi.fn(() => mockClaudeCliProvider);
const useAgentMock = vi.fn(() => mockUseAgent);

vi.mock("../src/hooks/useAgent.js", () => ({
  useAgent: useAgentMock,
}));

vi.mock("../src/tools/bash.js", () => ({
  createBashTool: () => ({ name: "bash", description: "mock", invoke: vi.fn() }),
  bashTool: { name: "bash", description: "mock", invoke: vi.fn() },
}));

vi.mock("deep-factor-agent", () => ({
  createClaudeCliProvider: createClaudeCliProviderMock,
}));

const appendSessionMock = vi.fn();
vi.mock("../src/session-logger.js", () => ({
  appendSession: appendSessionMock,
}));

// Import after mocks are set up
const { TuiApp } = await import("../src/app.js");

function renderApp(overrides?: Partial<UseAgentReturn>) {
  if (overrides) {
    mockUseAgent = { ...mockUseAgent, ...overrides };
  }
  // Note: lastFrame() only shows the live (non-static) portion with ink-testing-library
  return render(<TuiApp provider="langchain" model="gpt-4" maxIter={10} sandbox="workspace" />);
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
      submitPendingInput: vi.fn(),
      pendingUiState: null,
    };
    appendSessionMock.mockReset();
    useAgentMock.mockClear();
    createClaudeCliProviderMock.mockClear();
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

  it("routes pending actions through submitPendingInput", () => {
    const submitPendingInput = vi.fn();
    const { stdin } = renderApp({
      status: "pending_input",
      submitPendingInput,
      pendingUiState: {
        kind: "plan_review",
        title: "Plan Review",
        question: "Review this plan",
        plan: "# Plan\n\nShip it.",
        actions: ["approve", "reject", "edit"],
      },
    });

    stdin.write("a");

    expect(submitPendingInput).toHaveBeenCalledWith({ kind: "approve" });
    expect(appendSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "user",
        content: "approve",
        provider: "langchain",
        model: "gpt-4",
      }),
    );
  });

  it("logs the initial prompt with provider and model", () => {
    render(
      <TuiApp prompt="Hello" provider="langchain" model="gpt-4" maxIter={10} sandbox="workspace" />,
    );

    expect(appendSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "user",
        content: "Hello",
        provider: "langchain",
        model: "gpt-4",
      }),
    );
  });

  it("resolves the Claude CLI provider once at startup", () => {
    render(<TuiApp provider="claude" model="sonnet" maxIter={10} sandbox="workspace" />);

    expect(createClaudeCliProviderMock).toHaveBeenCalledWith({
      model: "sonnet",
      permissionMode: "bypassPermissions",
      disableBuiltInTools: true,
    });
    expect(useAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "claude",
        model: mockClaudeCliProvider,
        modelLabel: "sonnet",
      }),
    );
  });

  it("maps approve mode to Claude acceptEdits permission mode", () => {
    render(
      <TuiApp provider="claude" model="sonnet" maxIter={10} sandbox="workspace" mode="approve" />,
    );

    expect(createClaudeCliProviderMock).toHaveBeenCalledWith({
      model: "sonnet",
      permissionMode: "acceptEdits",
      disableBuiltInTools: true,
    });
  });

  it("maps plan mode to Claude plan permission mode", () => {
    render(
      <TuiApp provider="claude" model="sonnet" maxIter={10} sandbox="workspace" mode="plan" />,
    );

    expect(createClaudeCliProviderMock).toHaveBeenCalledWith({
      model: "sonnet",
      permissionMode: "plan",
      disableBuiltInTools: true,
    });
  });
});
