import React from "react";
import { render } from "ink-testing-library";
import { describe, test, expect, vi, beforeEach } from "vitest";

const { mockExit, mockUseAgent, mockSendPrompt, mockSubmitHumanInput } =
  vi.hoisted(() => ({
    mockExit: vi.fn(),
    mockUseAgent: vi.fn(),
    mockSendPrompt: vi.fn(),
    mockSubmitHumanInput: vi.fn(),
  }));

vi.mock("ink", async () => {
  const actual = await vi.importActual("ink");
  return {
    ...(actual as Record<string, unknown>),
    useApp: () => ({ exit: mockExit }),
  };
});

vi.mock("../src/hooks/useAgent.js", () => ({
  useAgent: (...args: unknown[]) => mockUseAgent(...args),
}));

vi.mock("../src/tools/bash.js", () => ({
  bashTool: { name: "bash", description: "mock bash" },
}));

import { App } from "../src/app.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function idle() {
  return {
    messages: [],
    status: "idle" as const,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    iterations: 0,
    error: null,
    sendPrompt: mockSendPrompt,
    submitHumanInput: mockSubmitHumanInput,
    humanInputRequest: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAgent.mockReturnValue(idle());
});

describe("App", () => {
  // --- Existing tests (rewritten with useAgent mock) ---

  test("shows assistant response when done", () => {
    mockUseAgent.mockReturnValue({
      ...idle(),
      status: "done",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "test response" },
      ],
    });
    const { lastFrame } = render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    expect(lastFrame()).toContain("test response");
  });

  test("shows status bar with usage after completion", () => {
    mockUseAgent.mockReturnValue({
      ...idle(),
      status: "done",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });
    const { lastFrame } = render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("10");
    expect(frame).toContain("5");
    expect(frame).toContain("15");
  });

  // --- Interactive Mode (4 tests) ---

  test("PromptInput visible when idle + interactive", () => {
    const { lastFrame } = render(
      <App
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={true}
      />,
    );
    expect(lastFrame()).toContain(">");
  });

  test("PromptInput hidden when not interactive", () => {
    const { lastFrame } = render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain(">");
  });

  test("PromptInput re-appears after completion in interactive mode", () => {
    mockUseAgent.mockReturnValue({
      ...idle(),
      status: "done",
      messages: [{ role: "assistant", content: "done" }],
    });
    const { lastFrame } = render(
      <App
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={true}
      />,
    );
    expect(lastFrame()).toContain(">");
  });

  test("no auto-exit in interactive mode when done", async () => {
    mockUseAgent.mockReturnValue({
      ...idle(),
      status: "done",
    });
    render(
      <App
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={true}
      />,
    );
    await delay(100);
    expect(mockExit).not.toHaveBeenCalled();
  });

  // --- Pending Input State (3 tests) ---

  test("HumanInput rendered when status=pending_input", () => {
    mockUseAgent.mockReturnValue({
      ...idle(),
      status: "pending_input",
      humanInputRequest: {
        type: "human_input_requested",
        question: "What is your name?",
        timestamp: 0,
        iteration: 1,
      },
    });
    const { lastFrame } = render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    expect(lastFrame()).toContain("What is your name?");
  });

  test("HumanInput shows choices when provided", () => {
    mockUseAgent.mockReturnValue({
      ...idle(),
      status: "pending_input",
      humanInputRequest: {
        type: "human_input_requested",
        question: "Pick one",
        choices: ["Option A", "Option B"],
        timestamp: 0,
        iteration: 1,
      },
    });
    const { lastFrame } = render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Option A");
    expect(frame).toContain("Option B");
  });

  test("submitHumanInput called on HumanInput submit", async () => {
    mockUseAgent.mockReturnValue({
      ...idle(),
      status: "pending_input",
      humanInputRequest: {
        type: "human_input_requested",
        question: "Enter value",
        timestamp: 0,
        iteration: 1,
      },
    });
    const { stdin } = render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    stdin.write("y");
    await delay(30);
    stdin.write("e");
    await delay(30);
    stdin.write("s");
    await delay(30);
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(mockSubmitHumanInput).toHaveBeenCalledWith("yes");
    });
  });

  // --- Error State (3 tests) ---

  test("error message displayed", () => {
    mockUseAgent.mockReturnValue({
      ...idle(),
      status: "error",
      error: new Error("Something went wrong"),
    });
    const { lastFrame } = render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    expect(lastFrame()).toContain("Something went wrong");
  });

  test("exits in single-prompt mode on error", async () => {
    mockUseAgent.mockReturnValue({
      ...idle(),
      status: "error",
      error: new Error("failed"),
    });
    render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    await vi.waitFor(() => {
      expect(mockExit).toHaveBeenCalled();
    });
  });

  test("does not exit in interactive mode on error", async () => {
    mockUseAgent.mockReturnValue({
      ...idle(),
      status: "error",
      error: new Error("failed"),
    });
    render(
      <App
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={true}
      />,
    );
    await delay(100);
    expect(mockExit).not.toHaveBeenCalled();
  });

  // --- enableBash Flag (2 tests) ---

  test("enableBash=true passes bashTool in tools", () => {
    render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={true}
        interactive={false}
      />,
    );
    const callArgs = mockUseAgent.mock.calls[0][0];
    expect(callArgs.tools).toHaveLength(1);
    expect(callArgs.tools[0].name).toBe("bash");
  });

  test("enableBash=false passes empty tools", () => {
    render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    const callArgs = mockUseAgent.mock.calls[0][0];
    expect(callArgs.tools).toHaveLength(0);
  });

  // --- Spinner (2 tests) ---

  test("Spinner visible when status=running", () => {
    mockUseAgent.mockReturnValue({
      ...idle(),
      status: "running",
    });
    const { lastFrame } = render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    expect(lastFrame()).toContain("Thinking");
  });

  test("Spinner hidden when status=idle", () => {
    const { lastFrame } = render(
      <App
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    expect(lastFrame()).not.toContain("Thinking");
  });

  // --- Single-prompt mode (2 tests) ---

  test("auto-sends prompt on mount", async () => {
    render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    await vi.waitFor(() => {
      expect(mockSendPrompt).toHaveBeenCalledWith("hello");
    });
  });

  test("exits after completion in single-prompt mode", async () => {
    mockUseAgent.mockReturnValue({
      ...idle(),
      status: "done",
    });
    render(
      <App
        prompt="hello"
        model="m"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );
    await vi.waitFor(() => {
      expect(mockExit).toHaveBeenCalled();
    });
  });
});
