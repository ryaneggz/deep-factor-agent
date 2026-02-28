import { describe, it, expect, vi, beforeEach } from "vitest";

// --- hoisted mocks (must be defined before vi.mock factory references them) ---
const {
  mockLoop,
  mockResume,
  mockContinueLoop,
  mockCreateAgent,
  mockIsPendingResult,
  mockAddUsage,
} = vi.hoisted(() => {
  const mockResume = vi.fn();
  const mockLoop = vi.fn();
  const mockContinueLoop = vi.fn();
  const mockCreateAgent = vi.fn(() => ({
    loop: mockLoop,
    continueLoop: mockContinueLoop,
  }));
  const mockIsPendingResult = vi.fn(() => false);
  const mockAddUsage = vi.fn((a: Record<string, number>, b: Record<string, number>) => ({
    inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
  }));
  return {
    mockLoop,
    mockResume,
    mockContinueLoop,
    mockCreateAgent,
    mockIsPendingResult,
    mockAddUsage,
  };
});

vi.mock("deep-factor-agent", () => ({
  createDeepFactorAgent: mockCreateAgent,
  isPendingResult: mockIsPendingResult,
  addUsage: mockAddUsage,
  requestHumanInput: { name: "requestHumanInput" },
  TOOL_NAME_REQUEST_HUMAN_INPUT: "requestHumanInput",
  maxIterations: vi.fn(() => () => ({ stop: false })),
}));

// Import the pure function directly (exported for testing)
import { eventsToChatMessages } from "../../src/hooks/useAgent.js";

// --- Test data factories ---

function makeAgentResult(overrides: Record<string, unknown> = {}) {
  return {
    response: "test response",
    thread: {
      id: "thread-1",
      events: [
        {
          type: "message",
          role: "user",
          content: "hello",
          timestamp: 0,
          iteration: 1,
        },
        {
          type: "message",
          role: "assistant",
          content: "test response",
          timestamp: 1,
          iteration: 1,
        },
      ],
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
    },
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    iterations: 1,
    stopReason: "completed",
    ...overrides,
  };
}

function makePendingResult(resume = mockResume) {
  return {
    response: "waiting",
    thread: {
      id: "thread-2",
      events: [
        {
          type: "message",
          role: "user",
          content: "hello",
          timestamp: 0,
          iteration: 1,
        },
        {
          type: "human_input_requested",
          question: "Which option?",
          choices: ["A", "B"],
          timestamp: 1,
          iteration: 1,
        },
      ],
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
    },
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    iterations: 1,
    stopReason: "human_input_needed",
    stopDetail: "Human input requested",
    resume,
  };
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mockIsPendingResult.mockReturnValue(false);
});

describe("eventsToChatMessages", () => {
  it("converts user_message events", () => {
    const events = [
      {
        type: "message" as const,
        role: "user" as const,
        content: "hello",
        timestamp: 0,
        iteration: 1,
      },
    ];
    const result = eventsToChatMessages(events);
    expect(result).toEqual([{ role: "user", content: "hello" }]);
  });

  it("converts assistant_message events", () => {
    const events = [
      {
        type: "message" as const,
        role: "assistant" as const,
        content: "world",
        timestamp: 0,
        iteration: 1,
      },
    ];
    const result = eventsToChatMessages(events);
    expect(result).toEqual([{ role: "assistant", content: "world" }]);
  });

  it("converts tool_call events", () => {
    const events = [
      {
        type: "tool_call" as const,
        toolName: "search",
        toolCallId: "tc_1",
        args: { query: "test" },
        timestamp: 0,
        iteration: 1,
      },
    ];
    const result = eventsToChatMessages(events);
    expect(result).toEqual([
      {
        role: "tool_call",
        content: "search",
        toolName: "search",
        toolArgs: { query: "test" },
      },
    ]);
  });

  it("converts tool_result events", () => {
    const events = [
      {
        type: "tool_result" as const,
        toolCallId: "tc_1",
        result: "found items",
        timestamp: 0,
        iteration: 1,
      },
    ];
    const result = eventsToChatMessages(events);
    expect(result).toEqual([{ role: "tool_result", content: "found items" }]);
  });

  it("skips system messages", () => {
    const events = [
      {
        type: "message" as const,
        role: "system" as const,
        content: "system prompt",
        timestamp: 0,
        iteration: 0,
      },
    ];
    const result = eventsToChatMessages(events);
    expect(result).toEqual([]);
  });

  it("skips error events", () => {
    const events = [
      {
        type: "error" as const,
        error: "something broke",
        recoverable: true,
        timestamp: 0,
        iteration: 1,
      },
    ];
    const result = eventsToChatMessages(events);
    expect(result).toEqual([]);
  });

  it("skips summary events", () => {
    const events = [
      {
        type: "summary" as const,
        summary: "conversation summary",
        summarizedIterations: [0, 1],
        timestamp: 0,
        iteration: 2,
      },
    ];
    const result = eventsToChatMessages(events);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    const result = eventsToChatMessages([]);
    expect(result).toEqual([]);
  });
});

// --- Hook tests via React rendering ---
// These use ink-testing-library to render a thin wrapper component

import React, { useEffect } from "react";
import { render } from "ink-testing-library";
import { Box, Text } from "ink";
import { useAgent } from "../../src/hooks/useAgent.js";
import type { UseAgentOptions } from "../../src/types.js";

const defaultOptions: UseAgentOptions = {
  model: "test-model",
  maxIter: 10,
};

// Thin wrapper that renders hook state and optionally triggers sendPrompt
let hookRef: ReturnType<typeof useAgent> | null = null;

function TestHarness({ options, autoPrompt }: { options: UseAgentOptions; autoPrompt?: string }) {
  const agent = useAgent(options);
  hookRef = agent; // eslint-disable-line react-hooks/globals

  useEffect(() => {
    if (autoPrompt) {
      agent.sendPrompt(autoPrompt);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box flexDirection="column">
      <Text>{`STATUS:${agent.status}`}</Text>
      <Text>{`MESSAGES:${agent.messages.length}`}</Text>
      <Text>{`ERROR:${agent.error?.message ?? "null"}`}</Text>
      <Text>{`USAGE_TOTAL:${agent.usage.totalTokens}`}</Text>
      <Text>{`HUMAN_INPUT:${agent.humanInputRequest ? agent.humanInputRequest.question : "null"}`}</Text>
    </Box>
  );
}

describe("useAgent hook", () => {
  describe("initial state", () => {
    it("status is idle", () => {
      const { lastFrame } = render(<TestHarness options={defaultOptions} />);
      expect(lastFrame()).toContain("STATUS:idle");
    });

    it("messages is empty", () => {
      const { lastFrame } = render(<TestHarness options={defaultOptions} />);
      expect(lastFrame()).toContain("MESSAGES:0");
    });

    it("usage is zero, error null, humanInputRequest null", () => {
      const { lastFrame } = render(<TestHarness options={defaultOptions} />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("USAGE_TOTAL:0");
      expect(frame).toContain("ERROR:null");
      expect(frame).toContain("HUMAN_INPUT:null");
    });
  });

  describe("sendPrompt()", () => {
    it("sets status to running", async () => {
      // Never-resolving promise keeps status at "running"
      mockLoop.mockReturnValueOnce(new Promise(() => {}));

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:running");
      });
    });

    it("calls createDeepFactorAgent with correct params", async () => {
      mockLoop.mockResolvedValueOnce(makeAgentResult());

      render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(mockCreateAgent).toHaveBeenCalledWith(
          expect.objectContaining({
            model: "test-model",
          }),
        );
      });
    });

    it("includes requestHumanInput in tools", async () => {
      mockLoop.mockResolvedValueOnce(makeAgentResult());

      render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        const callArgs = mockCreateAgent.mock.calls[0][0];
        expect(callArgs.tools).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: "requestHumanInput" })]),
        );
      });
    });

    it("AgentResult sets status to done", async () => {
      mockLoop.mockResolvedValueOnce(makeAgentResult());
      mockIsPendingResult.mockReturnValue(false);

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:done");
      });
    });

    it("PendingResult sets status to pending_input", async () => {
      mockLoop.mockResolvedValueOnce(makePendingResult());
      mockIsPendingResult.mockReturnValue(true);

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:pending_input");
      });
    });

    it("extracts humanInputRequest from PendingResult", async () => {
      mockLoop.mockResolvedValueOnce(makePendingResult());
      mockIsPendingResult.mockReturnValue(true);

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("HUMAN_INPUT:Which option?");
      });
    });

    it("Error instance sets error status", async () => {
      mockLoop.mockRejectedValueOnce(new Error("API failed"));

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:error");
        expect(lastFrame()).toContain("ERROR:API failed");
      });
    });

    it("non-Error value is wrapped in Error", async () => {
      mockLoop.mockRejectedValueOnce("string error");

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:error");
        expect(lastFrame()).toContain("ERROR:string error");
      });
    });
  });

  describe("submitHumanInput()", () => {
    it("is a no-op when no pending result", async () => {
      mockLoop.mockResolvedValueOnce(makeAgentResult());
      mockIsPendingResult.mockReturnValue(false);

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:done");
      });

      // Call submitHumanInput when there's no pending result
      hookRef!.submitHumanInput("answer");
      // Status should remain "done"
      expect(lastFrame()).toContain("STATUS:done");
      expect(mockResume).not.toHaveBeenCalled();
    });

    it("sets status to running when called with pending result", async () => {
      mockLoop.mockResolvedValueOnce(makePendingResult());
      mockIsPendingResult.mockReturnValue(true);

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:pending_input");
      });

      // Now submit human input; resume returns a never-resolving promise
      mockResume.mockReturnValueOnce(new Promise(() => {}));
      hookRef!.submitHumanInput("yes");

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:running");
      });
    });

    it("calls resume() with the response", async () => {
      mockLoop.mockResolvedValueOnce(makePendingResult());
      mockIsPendingResult.mockReturnValue(true);

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:pending_input");
      });

      mockResume.mockResolvedValueOnce(makeAgentResult());
      mockIsPendingResult.mockReturnValue(false);
      hookRef!.submitHumanInput("yes");

      await vi.waitFor(() => {
        expect(mockResume).toHaveBeenCalledWith("yes");
      });
    });

    it("resume AgentResult sets status to done", async () => {
      mockLoop.mockResolvedValueOnce(makePendingResult());
      mockIsPendingResult.mockReturnValue(true);

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:pending_input");
      });

      mockResume.mockResolvedValueOnce(makeAgentResult());
      mockIsPendingResult.mockReturnValue(false);
      hookRef!.submitHumanInput("answer");

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:done");
      });
    });

    it("resume PendingResult re-enters pending_input", async () => {
      mockLoop.mockResolvedValueOnce(makePendingResult());
      mockIsPendingResult.mockReturnValue(true);

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:pending_input");
      });

      // Resume returns another PendingResult
      mockResume.mockResolvedValueOnce(makePendingResult());
      mockIsPendingResult.mockReturnValue(true);
      hookRef!.submitHumanInput("more info");

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:pending_input");
      });
    });

    it("resume error sets error status", async () => {
      mockLoop.mockResolvedValueOnce(makePendingResult());
      mockIsPendingResult.mockReturnValue(true);

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:pending_input");
      });

      mockResume.mockRejectedValueOnce(new Error("Resume failed"));
      hookRef!.submitHumanInput("answer");

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:error");
        expect(lastFrame()).toContain("ERROR:Resume failed");
      });
    });
  });

  describe("multi-turn memory (P3.4)", () => {
    it("first sendPrompt uses loop(), second uses continueLoop()", async () => {
      const firstResult = makeAgentResult();
      mockLoop.mockResolvedValueOnce(firstResult);
      mockIsPendingResult.mockReturnValue(false);

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      // Wait for first prompt to complete
      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:done");
      });

      // First call used loop()
      expect(mockLoop).toHaveBeenCalledWith("hello");
      expect(mockContinueLoop).not.toHaveBeenCalled();

      // Second sendPrompt should use continueLoop with the existing thread
      const secondResult = makeAgentResult({
        response: "follow up response",
        thread: firstResult.thread, // Same thread object
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        iterations: 2,
      });
      mockContinueLoop.mockResolvedValueOnce(secondResult);
      mockIsPendingResult.mockReturnValue(false);

      hookRef!.sendPrompt("follow up");

      await vi.waitFor(() => {
        expect(mockContinueLoop).toHaveBeenCalledWith(firstResult.thread, "follow up");
      });
    });

    it("accumulates usage across turns", async () => {
      const firstResult = makeAgentResult({
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      });
      mockLoop.mockResolvedValueOnce(firstResult);
      mockIsPendingResult.mockReturnValue(false);

      const { lastFrame } = render(<TestHarness options={defaultOptions} autoPrompt="hello" />);

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("STATUS:done");
      });

      // addUsage mock was called with (prev={0,0,0}, result.usage={10,5,15})
      expect(mockAddUsage).toHaveBeenCalledWith(
        { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      );
    });
  });
});
