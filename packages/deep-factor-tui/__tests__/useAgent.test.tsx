import React from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentExecutionUpdate,
  AgentEvent,
  AgentResult,
  AgentThread,
  PendingResult,
  TokenUsage,
} from "deep-factor-agent";
import type { UseAgentOptions, UseAgentReturn } from "../src/types.js";

const { createDeepFactorAgentMock, appendSessionMock } = vi.hoisted(() => ({
  createDeepFactorAgentMock: vi.fn(),
  appendSessionMock: vi.fn(),
}));

vi.mock("deep-factor-agent", () => ({
  createDeepFactorAgent: createDeepFactorAgentMock,
  requestHumanInput: {
    name: "request_human_input",
    description: "Request human input",
    invoke: vi.fn(),
  },
  TOOL_NAME_REQUEST_HUMAN_INPUT: "request_human_input",
  maxIterations: (count: number) => ({ type: "max_iterations", count }),
  isPendingResult: (result: AgentResult | PendingResult) =>
    result.stopReason === "human_input_needed",
  isPlanResult: (result: { mode?: string }) => result.mode === "plan",
  addUsage: (a: TokenUsage, b: TokenUsage): TokenUsage => ({
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0) || undefined,
    cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0) || undefined,
  }),
}));

vi.mock("../src/session-logger.js", () => ({
  appendSession: appendSessionMock,
}));

const { useAgent } = await import("../src/hooks/useAgent.js");

const zeroUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

const stateRef = { current: null as UseAgentReturn | null };

function HookHarness({ options }: { options: UseAgentOptions }) {
  const state = useAgent(options);
  // eslint-disable-next-line react-hooks/immutability -- test harness needs synchronous state capture
  stateRef.current = state;
  return <Text>{state.status}</Text>;
}

function makeThread(events: AgentEvent[]): AgentThread {
  return {
    id: "thread-1",
    events,
    metadata: {},
    createdAt: 1,
    updatedAt: events.at(-1)?.timestamp ?? 1,
  };
}

function makeUpdate(
  thread: AgentThread,
  usage: TokenUsage,
  status: AgentExecutionUpdate["status"],
  lastEvent?: AgentEvent,
): AgentExecutionUpdate {
  return {
    thread,
    usage,
    iterations: 1,
    status,
    lastEvent,
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("useAgent", () => {
  beforeEach(() => {
    stateRef.current = null;
    createDeepFactorAgentMock.mockReset();
    appendSessionMock.mockReset();
  });

  it("streams langchain updates into UI state and logs final messages once", async () => {
    let resolveLoop: ((result: AgentResult) => void) | undefined;

    const userEvent: AgentEvent = {
      type: "message",
      role: "user",
      content: "Inspect the repo",
      timestamp: 1,
      iteration: 0,
    };
    const toolCallEvent: AgentEvent = {
      type: "tool_call",
      toolName: "bash",
      toolCallId: "tool-1",
      args: { cmd: "pwd" },
      timestamp: 2,
      iteration: 1,
    };
    const toolResultEvent: AgentEvent = {
      type: "tool_result",
      toolCallId: "tool-1",
      result: "/workspace",
      timestamp: 3,
      iteration: 1,
    };
    const assistantEvent: AgentEvent = {
      type: "message",
      role: "assistant",
      content: "Workspace inspected.",
      timestamp: 4,
      iteration: 1,
    };
    const completionEvent: AgentEvent = {
      type: "completion",
      result: "Workspace inspected.",
      verified: false,
      timestamp: 5,
      iteration: 1,
    };

    const finalThread = makeThread([
      userEvent,
      toolCallEvent,
      toolResultEvent,
      assistantEvent,
      completionEvent,
    ]);
    const runUsage: TokenUsage = { inputTokens: 12, outputTokens: 4, totalTokens: 16 };

    createDeepFactorAgentMock.mockImplementation(
      (settings: { onUpdate?: (update: AgentExecutionUpdate) => void }) => ({
        loop: vi.fn(() => {
          settings.onUpdate?.(makeUpdate(makeThread([userEvent]), zeroUsage, "running", userEvent));
          settings.onUpdate?.(
            makeUpdate(makeThread([userEvent, toolCallEvent]), zeroUsage, "running", toolCallEvent),
          );
          settings.onUpdate?.(
            makeUpdate(
              makeThread([userEvent, toolCallEvent, toolResultEvent]),
              zeroUsage,
              "running",
              toolResultEvent,
            ),
          );
          settings.onUpdate?.(
            makeUpdate(
              makeThread([userEvent, toolCallEvent, toolResultEvent, assistantEvent]),
              zeroUsage,
              "running",
              assistantEvent,
            ),
          );
          settings.onUpdate?.(makeUpdate(finalThread, runUsage, "done", completionEvent));

          return new Promise<AgentResult>((resolve) => {
            resolveLoop = resolve;
          });
        }),
        continueLoop: vi.fn(),
      }),
    );

    render(
      <HookHarness
        options={{
          model: "gpt-4.1-mini",
          modelLabel: "gpt-4.1-mini",
          maxIter: 10,
          provider: "langchain",
        }}
      />,
    );

    stateRef.current?.sendPrompt("Inspect the repo");
    await flush();

    expect(createDeepFactorAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        streamMode: "updates",
        onUpdate: expect.any(Function),
      }),
    );
    expect(stateRef.current?.status).toBe("done");
    expect(stateRef.current?.messages.map((message) => message.role)).toEqual([
      "user",
      "tool_call",
      "tool_result",
      "assistant",
    ]);
    expect(stateRef.current?.usage).toEqual(runUsage);

    resolveLoop?.({
      response: "Workspace inspected.",
      thread: finalThread,
      usage: runUsage,
      iterations: 1,
      stopReason: "completed",
    });
    await flush();

    expect(appendSessionMock).toHaveBeenCalledTimes(3);
    expect(appendSessionMock.mock.calls.map(([entry]) => entry.role)).toEqual([
      "tool_call",
      "tool_result",
      "assistant",
    ]);
  });

  it("shows plan review state as soon as a pending update arrives", async () => {
    let resolveLoop: ((result: PendingResult) => void) | undefined;

    const userEvent: AgentEvent = {
      type: "message",
      role: "user",
      content: "Draft a plan",
      timestamp: 1,
      iteration: 0,
    };
    const planEvent: AgentEvent = {
      type: "plan",
      content: "# Plan\n\n1. Inspect\n2. Implement",
      timestamp: 2,
      iteration: 1,
    };
    const requestEvent: AgentEvent = {
      type: "human_input_requested",
      kind: "plan_review",
      question: "Review the proposed plan.",
      format: "multiple_choice",
      choices: ["approve", "reject", "edit"],
      timestamp: 3,
      iteration: 1,
    };
    const pendingThread = makeThread([userEvent, planEvent, requestEvent]);

    createDeepFactorAgentMock.mockImplementation(
      (settings: { onUpdate?: (update: AgentExecutionUpdate) => void }) => ({
        loop: vi.fn(() => {
          settings.onUpdate?.(
            makeUpdate(makeThread([userEvent, planEvent]), zeroUsage, "running", planEvent),
          );
          settings.onUpdate?.(makeUpdate(pendingThread, zeroUsage, "pending_input", requestEvent));

          return new Promise<PendingResult>((resolve) => {
            resolveLoop = resolve;
          });
        }),
        continueLoop: vi.fn(),
      }),
    );

    render(
      <HookHarness
        options={{
          model: "gpt-4.1-mini",
          modelLabel: "gpt-4.1-mini",
          maxIter: 10,
          mode: "plan",
          provider: "langchain",
        }}
      />,
    );

    stateRef.current?.sendPrompt("Draft a plan");
    await flush();

    expect(stateRef.current?.status).toBe("pending_input");
    expect(stateRef.current?.plan).toBe("# Plan\n\n1. Inspect\n2. Implement");
    expect(stateRef.current?.pendingUiState).toMatchObject({
      kind: "plan_review",
      title: "Plan Review",
      question: "Review the proposed plan.",
      plan: "# Plan\n\n1. Inspect\n2. Implement",
    });

    resolveLoop?.({
      response: "# Plan\n\n1. Inspect\n2. Implement",
      thread: pendingThread,
      usage: zeroUsage,
      iterations: 1,
      stopReason: "human_input_needed",
      stopDetail: "Plan proposed — awaiting review",
      resume: vi.fn(),
    });
    await flush();

    expect(stateRef.current?.status).toBe("pending_input");
  });

  it("streams Claude inline runs through the same update path as LangChain", async () => {
    let resolveLoop: ((result: AgentResult) => void) | undefined;
    const userEvent: AgentEvent = {
      type: "message",
      role: "user",
      content: "Hello",
      timestamp: 1,
      iteration: 0,
    };
    const toolCallEvent: AgentEvent = {
      type: "tool_call",
      toolName: "bash",
      toolCallId: "tool-1",
      args: { cmd: "pwd" },
      timestamp: 2,
      iteration: 1,
    };
    const toolResultEvent: AgentEvent = {
      type: "tool_result",
      toolCallId: "tool-1",
      result: "/workspace",
      timestamp: 3,
      iteration: 1,
    };
    const assistantEvent: AgentEvent = {
      type: "message",
      role: "assistant",
      content: "Done",
      timestamp: 4,
      iteration: 1,
    };
    const completionEvent: AgentEvent = {
      type: "completion",
      result: "Done",
      verified: false,
      timestamp: 5,
      iteration: 1,
    };
    const finalThread = makeThread([
      userEvent,
      toolCallEvent,
      toolResultEvent,
      assistantEvent,
      completionEvent,
    ]);

    createDeepFactorAgentMock.mockImplementation(
      (settings: { onUpdate?: (update: AgentExecutionUpdate) => void }) => ({
        loop: vi.fn(() => {
          settings.onUpdate?.(
            makeUpdate(makeThread([userEvent, toolCallEvent]), zeroUsage, "running", toolCallEvent),
          );
          settings.onUpdate?.(
            makeUpdate(
              makeThread([userEvent, toolCallEvent, toolResultEvent, assistantEvent]),
              { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
              "running",
              assistantEvent,
            ),
          );
          settings.onUpdate?.(
            makeUpdate(
              finalThread,
              { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
              "done",
              completionEvent,
            ),
          );

          return new Promise<AgentResult>((resolve) => {
            resolveLoop = resolve;
          });
        }),
        continueLoop: vi.fn(),
      }),
    );

    render(
      <HookHarness
        options={{
          model: "sonnet",
          modelLabel: "sonnet",
          maxIter: 10,
          provider: "claude",
        }}
      />,
    );

    stateRef.current?.sendPrompt("Hello");
    await flush();

    expect(createDeepFactorAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        streamMode: "updates",
        onUpdate: expect.any(Function),
      }),
    );
    expect(stateRef.current?.messages.map((message) => message.role)).toEqual([
      "user",
      "tool_call",
      "tool_result",
      "assistant",
    ]);
    expect(stateRef.current?.usage).toEqual({ inputTokens: 5, outputTokens: 2, totalTokens: 7 });

    resolveLoop?.({
      response: "Done",
      thread: finalThread,
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
      iterations: 1,
      stopReason: "completed",
    });
    await flush();
  });
});
