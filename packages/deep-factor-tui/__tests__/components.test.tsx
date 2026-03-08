import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { Header } from "../src/components/Header.js";
import { StatusLine } from "../src/components/StatusLine.js";
import { LiveSection } from "../src/components/LiveSection.js";
import { PendingInputPanel } from "../src/components/PendingInputPanel.js";
import { TranscriptTurn } from "../src/components/TranscriptTurn.js";
import {
  formatToolLabel,
  formatToolArgsPreview,
  formatToolResultPreview,
  groupMessagesIntoTurns,
} from "../src/transcript.js";
import { eventsToChatMessages } from "../src/hooks/useAgent.js";
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
// Transcript formatting and grouping
// ---------------------------------------------------------------------------
describe("transcript helpers", () => {
  it("groups user, tool, and assistant messages into one turn", () => {
    const turns = groupMessagesIntoTurns([
      { id: "msg-0", role: "user", content: "Current system time?" },
      {
        id: "msg-1",
        role: "tool_call",
        content: "bash",
        toolName: "bash",
        toolArgs: { command: "date" },
        toolCallId: "tool-1",
      },
      {
        id: "msg-2",
        role: "tool_result",
        content: "Sun Mar 8 09:28:54 MDT 2026",
        toolCallId: "tool-1",
        durationMs: 11,
      },
      {
        id: "msg-3",
        role: "assistant",
        content: "Current system time is Sun Mar 8 09:28:54 MDT 2026.",
      },
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]?.userMessage?.content).toBe("Current system time?");
    expect(turns[0]?.segments).toHaveLength(2);
    expect(turns[0]?.segments[0]).toMatchObject({
      kind: "tool",
      toolName: "bash",
      result: "Sun Mar 8 09:28:54 MDT 2026",
      durationMs: 11,
    });
    expect(turns[0]?.segments[1]).toMatchObject({
      kind: "assistant",
      content: "Current system time is Sun Mar 8 09:28:54 MDT 2026.",
    });
  });

  it("preserves multiple tool calls in a single turn", () => {
    const turns = groupMessagesIntoTurns([
      { id: "msg-0", role: "user", content: "Need pwd and timezone" },
      {
        id: "msg-1",
        role: "tool_call",
        content: "bash",
        toolName: "bash",
        toolArgs: { command: "pwd" },
        toolCallId: "tool-1",
      },
      {
        id: "msg-2",
        role: "tool_result",
        content: "/repo",
        toolCallId: "tool-1",
      },
      {
        id: "msg-3",
        role: "tool_call",
        content: "bash",
        toolName: "bash",
        toolArgs: { command: "date +%Z" },
        toolCallId: "tool-2",
      },
      {
        id: "msg-4",
        role: "tool_result",
        content: "MDT",
        toolCallId: "tool-2",
      },
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]?.segments).toHaveLength(2);
    expect(turns[0]?.segments[0]).toMatchObject({
      kind: "tool",
      toolCallId: "tool-1",
      result: "/repo",
    });
    expect(turns[0]?.segments[1]).toMatchObject({
      kind: "tool",
      toolCallId: "tool-2",
      result: "MDT",
    });
  });

  it("creates a carryover turn when assistant activity comes first", () => {
    const turns = groupMessagesIntoTurns([
      { id: "msg-0", role: "assistant", content: "Resuming previous thread." },
      { id: "msg-1", role: "user", content: "Continue" },
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ isCarryover: true });
    expect(turns[0]?.segments[0]).toMatchObject({
      kind: "assistant",
      content: "Resuming previous thread.",
    });
    expect(turns[1]?.userMessage?.content).toBe("Continue");
  });

  it("formats bash tool calls as readable commands", () => {
    expect(formatToolLabel("bash", { command: "pwd" })).toBe("Bash(pwd)");
  });

  it("formats compact tool arg previews", () => {
    expect(formatToolArgsPreview({ path: "a.txt", recursive: true })).toBe(
      'path="a.txt", recursive=true',
    );
  });

  it("builds compact previews for multiline tool output", () => {
    const preview = formatToolResultPreview("line one\n\nline two\nline three\nline four");

    expect(preview.lines).toEqual(["line one", "line two"]);
    expect(preview.overflowLineCount).toBe(2);
  });

  it("surfaces human input responses and suppresses synthetic steering messages", () => {
    const messages = eventsToChatMessages([
      {
        type: "human_input_received",
        response: undefined,
        decision: "approve",
        timestamp: 1,
        iteration: 1,
      },
      {
        type: "message",
        role: "user",
        content: "Approved. Continue.",
        timestamp: 2,
        iteration: 1,
      },
      {
        type: "human_input_received",
        response: "Add rollout notes",
        decision: "edit",
        timestamp: 3,
        iteration: 2,
      },
      {
        type: "message",
        role: "user",
        content: "Please revise the plan based on this feedback:\nAdd rollout notes",
        timestamp: 4,
        iteration: 2,
      },
    ]);

    expect(messages).toEqual([
      { id: "msg-0", role: "user", content: "approve" },
      { id: "msg-1", role: "user", content: "Add rollout notes" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// TranscriptTurn
// ---------------------------------------------------------------------------
describe("TranscriptTurn", () => {
  it("renders grouped transcript content with readable structure", () => {
    const { lastFrame } = render(
      <TranscriptTurn
        turn={{
          id: "turn-0",
          userMessage: { id: "msg-0", role: "user", content: "Current system time?" },
          segments: [
            {
              id: "msg-1",
              kind: "tool",
              toolName: "bash",
              toolArgs: { command: "date" },
              result: "Sun Mar 8 09:28:54 MDT 2026\nAmerica/Denver\n/home/repo",
              durationMs: 11,
            },
            {
              id: "msg-2",
              kind: "assistant",
              content: "Current system time is Sun Mar 8 09:28:54 MDT 2026.",
            },
          ],
        }}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain("You");
    expect(frame).toContain("Current system time?");
    expect(frame).toContain("Bash(date)");
    expect(frame).toContain("11ms");
    expect(frame).toContain("Sun Mar 8 09:28:54 MDT 2026");
    expect(frame).toContain("... +1 more lines");
    expect(frame).toContain("Current system time is Sun Mar 8 09:28:54 MDT 2026.");
    expect(frame).toContain("|");
  });

  it("renders carryover activity without a user row", () => {
    const { lastFrame } = render(
      <TranscriptTurn
        turn={{
          id: "turn-0",
          isCarryover: true,
          segments: [{ id: "msg-0", kind: "assistant", content: "Earlier response" }],
        }}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain("Earlier activity");
    expect(frame).toContain("Earlier response");
  });
});

// ---------------------------------------------------------------------------
// InputBar
// ---------------------------------------------------------------------------
describe("InputBar", () => {
  it("renders with a border", () => {
    const { lastFrame } = render(
      <LiveSection
        status="idle"
        error={null}
        plan={null}
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={() => {}}
        onPendingSubmit={() => {}}
      />,
    );
    const frame = lastFrame()!;
    // round border uses ╭ and ╮ characters
    expect(frame).toMatch(/[╭╮╰╯│─]/);
  });

  it("shows Alt+Enter hint", () => {
    const { lastFrame } = render(
      <LiveSection
        status="idle"
        error={null}
        plan={null}
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={() => {}}
        onPendingSubmit={() => {}}
      />,
    );
    expect(lastFrame()).toContain("Alt+Enter for newline");
  });

  it("shows Ctrl+/ shortcut hint", () => {
    const { lastFrame } = render(
      <LiveSection
        status="idle"
        error={null}
        plan={null}
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={() => {}}
        onPendingSubmit={() => {}}
      />,
    );
    expect(lastFrame()).toContain("Ctrl+/ for shortcuts");
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
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
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
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
      />,
    );
    expect(lastFrame()).toContain("something broke");
  });

  it("shows pending panel actions for plan review", () => {
    const { lastFrame } = render(
      <LiveSection
        status="pending_input"
        error={null}
        plan={"# Plan\n\nShip it."}
        pendingUiState={{
          kind: "plan_review",
          title: "Plan Review",
          question: "Review this plan",
          plan: "# Plan\n\nShip it.",
          actions: ["approve", "reject", "edit"],
        }}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Plan Review");
    expect(frame).toContain("Proposed Plan");
    expect(frame).toContain("[A] Approve");
    expect(frame).toContain("[R] Reject");
    expect(frame).toContain("[E] Edit");
  });

  it("shows InputBar when idle", () => {
    const { lastFrame } = render(
      <LiveSection
        status="idle"
        error={null}
        plan={null}
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
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
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
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
        pendingUiState={null}
        usage={usage}
        iterations={2}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("15");
    expect(frame).toContain("2");
  });

  it("hides the global input while a decision panel is active", () => {
    const { lastFrame } = render(
      <LiveSection
        status="pending_input"
        error={null}
        plan={"# Plan\n\nShip it."}
        pendingUiState={{
          kind: "plan_review",
          title: "Plan Review",
          question: "Review this plan",
          plan: "# Plan\n\nShip it.",
          actions: ["approve", "reject", "edit"],
        }}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
      />,
    );

    const frame = lastFrame()!;
    const lines = frame.split("\n");
    const hasInputPrompt = lines.some((line) => line.includes(">") && line.includes("_"));
    expect(hasInputPrompt).toBe(false);
  });
});

describe("PendingInputPanel", () => {
  it("renders approval details", () => {
    const { lastFrame } = render(
      <PendingInputPanel
        pending={{
          kind: "approval",
          title: "Approval Required",
          question: 'Approve running "write_file"?',
          toolName: "write_file",
          toolArgs: { path: "a.txt", force: true },
          reason: "This tool mutates the workspace.",
          actions: ["approve", "reject", "edit"],
        }}
        onSubmit={() => {}}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain("Approval Required");
    expect(frame).toContain("write_file");
    expect(frame).toContain("This tool mutates the workspace.");
    expect(frame).toContain('path="a.txt", force=true');
  });

  it("renders question panels with embedded composer", () => {
    const { lastFrame } = render(
      <PendingInputPanel
        pending={{
          kind: "question",
          title: "Input Requested",
          question: "What color should we use?",
          context: "For the header accent",
          urgency: "medium",
          format: "free_text",
        }}
        onSubmit={() => {}}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain("What color should we use?");
    expect(frame).toContain("For the header accent");
    expect(frame).toContain("Type your response...");
  });

  it("submits approve with a single keypress", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <PendingInputPanel
        pending={{
          kind: "plan_review",
          title: "Plan Review",
          question: "Review this plan",
          plan: "# Plan\n\nShip it.",
          actions: ["approve", "reject", "edit"],
        }}
        onSubmit={onSubmit}
      />,
    );

    stdin.write("a");
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ kind: "approve" });
    });
  });

  it("enters and exits edit mode from the keyboard", async () => {
    const { stdin, lastFrame } = render(
      <PendingInputPanel
        pending={{
          kind: "approval",
          title: "Approval Required",
          question: "Approve this write?",
          toolName: "write_file",
          toolArgs: { path: "a.txt" },
          reason: "This tool mutates the workspace.",
          actions: ["approve", "reject", "edit"],
        }}
        onSubmit={() => {}}
      />,
    );

    stdin.write("e");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Revision Feedback");
    });

    stdin.write("\u001b");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("[A] Approve");
    });
  });
});
