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

const { createDeepFactorAgentMock, appendUnifiedSessionMock, getSessionIdMock } = vi.hoisted(
  () => ({
    createDeepFactorAgentMock: vi.fn(),
    appendUnifiedSessionMock: vi.fn(),
    getSessionIdMock: vi.fn(() => "test-session-id"),
  }),
);

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
  nextSequence: (ctx: { sequence: number }) => ctx.sequence++,
}));

vi.mock("../src/session-logger.js", () => ({
  appendUnifiedSession: appendUnifiedSessionMock,
  getSessionId: getSessionIdMock,
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
    appendUnifiedSessionMock.mockReset();
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
        instructions: expect.stringContaining(
          "prefer the native tools `read_file`, `write_file`, and `edit_file`",
        ),
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

    expect(appendUnifiedSessionMock).toHaveBeenCalledTimes(6);
    expect(appendUnifiedSessionMock.mock.calls.map(([entry]) => entry.type)).toEqual([
      "init",
      "message", // user message logged at submit time
      "tool_call",
      "tool_result",
      "message", // assistant message
      "result", // result entry at session end
    ]);
    // Verify iteration numbers are passed from MapperContext (synced via handleUpdate)
    const initEntry = appendUnifiedSessionMock.mock.calls[0][0];
    expect(initEntry.type).toBe("init");
    const userMsgEntry = appendUnifiedSessionMock.mock.calls[1][0];
    expect(userMsgEntry.iteration).toBe(0); // user message logged before any updates
    const toolCallEntry = appendUnifiedSessionMock.mock.calls[2][0];
    expect(toolCallEntry.iteration).toBe(1); // iteration synced from handleUpdate
    const toolResultEntry = appendUnifiedSessionMock.mock.calls[3][0];
    expect(toolResultEntry.iteration).toBe(1);
    const assistantMsgEntry = appendUnifiedSessionMock.mock.calls[4][0];
    expect(assistantMsgEntry.iteration).toBe(1);
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

  it("streams Codex inline runs through the same update path as Claude", async () => {
    let resolveLoop: ((result: AgentResult) => void) | undefined;
    const assistantEvent: AgentEvent = {
      type: "message",
      role: "assistant",
      content: "hello",
      timestamp: 2,
      iteration: 1,
    };
    const completionEvent: AgentEvent = {
      type: "completion",
      result: "hello",
      verified: false,
      timestamp: 3,
      iteration: 1,
    };
    const finalThread = makeThread([
      {
        type: "message",
        role: "user",
        content: "Hello",
        timestamp: 1,
        iteration: 0,
      },
      assistantEvent,
      completionEvent,
    ]);

    createDeepFactorAgentMock.mockImplementation(
      (settings: { onUpdate?: (update: AgentExecutionUpdate) => void }) => ({
        loop: vi.fn(() => {
          settings.onUpdate?.(
            makeUpdate(
              makeThread(finalThread.events.slice(0, 2)),
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
          model: { invoke: vi.fn(), invokeWithUpdates: vi.fn(), bindTools: vi.fn() } as any,
          modelLabel: "gpt-5.4",
          maxIter: 10,
          provider: "codex",
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
      "assistant",
    ]);
    expect(stateRef.current?.usage).toEqual({ inputTokens: 5, outputTokens: 2, totalTokens: 7 });

    resolveLoop?.({
      response: "hello",
      thread: finalThread,
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
      iterations: 1,
      stopReason: "completed",
    });
    await flush();
  });

  it("filters pure assistant JSON tool-call envelopes from display but still logs them", async () => {
    let resolveLoop: ((result: AgentResult) => void) | undefined;
    const jsonEnvelope = [
      "```json",
      '{"tool_calls":[{"id":"tool-1","name":"bash","args":{"command":"pwd"}}]}',
      "```",
    ].join("\n");
    const userEvent: AgentEvent = {
      type: "message",
      role: "user",
      content: "Inspect the repo",
      timestamp: 1,
      iteration: 0,
    };
    const envelopeEvent: AgentEvent = {
      type: "message",
      role: "assistant",
      content: jsonEnvelope,
      timestamp: 2,
      iteration: 1,
    };
    const toolCallEvent: AgentEvent = {
      type: "tool_call",
      toolName: "bash",
      toolCallId: "tool-1",
      args: { command: "pwd" },
      timestamp: 3,
      iteration: 1,
    };
    const toolResultEvent: AgentEvent = {
      type: "tool_result",
      toolCallId: "tool-1",
      result: "/workspace",
      timestamp: 4,
      iteration: 1,
    };
    const assistantEvent: AgentEvent = {
      type: "message",
      role: "assistant",
      content: "Workspace inspected.",
      timestamp: 5,
      iteration: 1,
    };
    const completionEvent: AgentEvent = {
      type: "completion",
      result: "Workspace inspected.",
      verified: false,
      timestamp: 6,
      iteration: 1,
    };
    const finalThread = makeThread([
      userEvent,
      envelopeEvent,
      toolCallEvent,
      toolResultEvent,
      assistantEvent,
      completionEvent,
    ]);

    createDeepFactorAgentMock.mockImplementation(
      (settings: { onUpdate?: (update: AgentExecutionUpdate) => void }) => ({
        loop: vi.fn(() => {
          settings.onUpdate?.(makeUpdate(finalThread, zeroUsage, "done", completionEvent));

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

    stateRef.current?.sendPrompt("Inspect the repo");
    await flush();

    expect(stateRef.current?.messages.map((message) => message.content)).toEqual([
      "Inspect the repo",
      "bash",
      "/workspace",
      "Workspace inspected.",
    ]);

    resolveLoop?.({
      response: "Workspace inspected.",
      thread: finalThread,
      usage: zeroUsage,
      iterations: 1,
      stopReason: "completed",
    });
    await flush();

    expect(appendUnifiedSessionMock.mock.calls.map(([entry]) => entry.type)).toEqual([
      "init",
      "message", // user message logged at submit time
      "message", // assistant envelope message
      "tool_call",
      "tool_result",
      "message", // assistant message
      "result", // result entry at session end
    ]);
  });
});
