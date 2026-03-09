import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "ink-testing-library";
import type { UseAgentReturn } from "../src/types.js";
import type { AgentThread } from "deep-factor-agent";
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
const mockCodexCliProvider = { invoke: vi.fn(), invokeWithUpdates: vi.fn(), bindTools: vi.fn() };
const createCodexCliProviderMock = vi.fn(() => mockCodexCliProvider);
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
  createCodexCliProvider: createCodexCliProviderMock,
}));

const appendSessionMock = vi.fn();
vi.mock("../src/session-logger.js", () => ({
  appendSession: appendSessionMock,
}));

// Import after mocks are set up
const { TuiApp } = await import("../src/app.js");

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const resumeThread: AgentThread = {
  id: "resume-thread",
  events: [],
  metadata: {},
  createdAt: 1,
  updatedAt: 1,
};

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
    createCodexCliProviderMock.mockClear();
  });

  it("renders live section in idle state", () => {
    const { lastFrame } = renderApp();
    const frame = lastFrame()!;
    expect(frame).toContain("• bypass permissions");
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

  it("does not resolve the Claude CLI provider for langchain runs", () => {
    render(<TuiApp provider="langchain" model="gpt-4" maxIter={10} sandbox="workspace" />);

    expect(createClaudeCliProviderMock).not.toHaveBeenCalled();
    expect(createCodexCliProviderMock).not.toHaveBeenCalled();
    expect(useAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "langchain",
        modelLabel: "gpt-4",
      }),
    );
  });

  it("resolves the Claude CLI provider once at startup", () => {
    render(<TuiApp provider="claude" model="sonnet" maxIter={10} sandbox="workspace" />);

    expect(createClaudeCliProviderMock).toHaveBeenCalledWith({
      model: "sonnet",
      permissionMode: "bypassPermissions",
      disableBuiltInTools: true,
      outputFormat: "stream-json",
      verbose: true,
      includePartialMessages: true,
    });
    expect(useAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "claude",
        model: mockClaudeCliProvider,
        modelLabel: "sonnet",
      }),
    );
  });

  it("resolves the Codex CLI provider once at startup in jsonl mode", () => {
    render(<TuiApp provider="codex" model="gpt-5.4" maxIter={10} sandbox="workspace" />);

    expect(createCodexCliProviderMock).toHaveBeenCalledWith({
      model: "gpt-5.4",
      outputFormat: "jsonl",
      sandbox: "read-only",
      skipGitRepoCheck: true,
    });
    expect(useAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "codex",
        model: mockCodexCliProvider,
        modelLabel: "gpt-5.4",
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
      outputFormat: "stream-json",
      verbose: true,
      includePartialMessages: true,
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
      outputFormat: "stream-json",
      verbose: true,
      includePartialMessages: true,
    });
  });

  it("cycles modes with Shift+Tab in the idle composer and re-resolves Claude permissions", async () => {
    const { stdin, lastFrame } = render(
      <TuiApp provider="claude" model="sonnet" maxIter={10} sandbox="workspace" mode="plan" />,
    );

    expect(lastFrame()).toContain("• plan mode (shift+tab to cycle)");

    stdin.write("\u001b[Z");
    await flush();
    expect(lastFrame()).toContain("• approvals required (shift+tab to cycle)");

    stdin.write("\u001b[Z");
    await flush();
    expect(lastFrame()).toContain("• bypass permissions (shift+tab to cycle)");

    stdin.write("\u001b[Z");
    await flush();
    expect(lastFrame()).toContain("• plan mode (shift+tab to cycle)");

    expect(createClaudeCliProviderMock.mock.calls.map(([args]) => args.permissionMode)).toEqual([
      "plan",
      "acceptEdits",
      "bypassPermissions",
      "plan",
    ]);
    expect(useAgentMock.mock.calls.map(([args]) => args.mode)).toEqual([
      "plan",
      "approve",
      "yolo",
      "plan",
    ]);
  });

  it("ignores Shift+Tab while running", async () => {
    mockUseAgent = { ...mockUseAgent, status: "running" };

    const { stdin, lastFrame } = render(
      <TuiApp provider="claude" model="sonnet" maxIter={10} sandbox="workspace" mode="plan" />,
    );

    stdin.write("\u001b[Z");
    await flush();

    expect(createClaudeCliProviderMock).toHaveBeenCalledTimes(1);
    expect(lastFrame()).toContain("• plan mode");
  });

  it("ignores Shift+Tab while pending input is active", async () => {
    mockUseAgent = {
      ...mockUseAgent,
      status: "pending_input",
      pendingUiState: {
        kind: "plan_review",
        title: "Plan Review",
        question: "Review this plan",
        plan: "# Plan\n\nShip it.",
        actions: ["approve", "reject", "edit"],
      },
    };

    const { stdin, lastFrame } = render(
      <TuiApp provider="claude" model="sonnet" maxIter={10} sandbox="workspace" mode="plan" />,
    );

    stdin.write("\u001b[Z");
    await flush();

    expect(createClaudeCliProviderMock).toHaveBeenCalledTimes(1);
    expect(lastFrame()).toContain("• plan mode");
  });

  it("ignores Shift+Tab while the hotkey menu is open", async () => {
    const { stdin, lastFrame } = render(
      <TuiApp provider="claude" model="sonnet" maxIter={10} sandbox="workspace" mode="plan" />,
    );

    stdin.write("\x1f");
    await flush();
    expect(lastFrame()).toContain("Keyboard Shortcuts");
    expect(lastFrame()).not.toContain("shift+tab to cycle");

    stdin.write("\u001b[Z");
    await flush();

    expect(lastFrame()).toContain("• plan mode");
    expect(lastFrame()).not.toContain("• approvals required");
  });

  it("does not restore a previously toggled mode on resume", async () => {
    const firstRender = render(
      <TuiApp
        provider="claude"
        model="sonnet"
        maxIter={10}
        sandbox="workspace"
        resumeMessages={[{ id: "resume-0", role: "assistant", content: "Earlier reply" }]}
        resumeThread={resumeThread}
      />,
    );

    firstRender.stdin.write("\u001b[Z");
    await flush();
    expect(firstRender.lastFrame()).toContain("• plan mode (shift+tab to cycle)");
    firstRender.unmount();

    createClaudeCliProviderMock.mockClear();
    useAgentMock.mockClear();

    const secondRender = render(
      <TuiApp
        provider="claude"
        model="sonnet"
        maxIter={10}
        sandbox="workspace"
        resumeMessages={[{ id: "resume-0", role: "assistant", content: "Earlier reply" }]}
        resumeThread={resumeThread}
      />,
    );

    expect(secondRender.lastFrame()).toContain("• bypass permissions (shift+tab to cycle)");
    expect(createClaudeCliProviderMock).toHaveBeenCalledWith({
      model: "sonnet",
      permissionMode: "bypassPermissions",
      disableBuiltInTools: true,
      outputFormat: "stream-json",
      verbose: true,
      includePartialMessages: true,
    });
  });
});
