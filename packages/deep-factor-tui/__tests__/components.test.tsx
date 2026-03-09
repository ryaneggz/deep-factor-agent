import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { Header } from "../src/components/Header.js";
import { HotkeyMenu } from "../src/components/HotkeyMenu.js";
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
    const { lastFrame } = render(<Header provider="langchain" model="gpt-4" />);
    expect(lastFrame()).toContain("Deep Factor TUI");
  });

  it("renders the provider and model", () => {
    const { lastFrame } = render(<Header provider="claude" model="sonnet" />);
    expect(lastFrame()).toContain("claude");
    expect(lastFrame()).toContain("sonnet");
  });
});

// ---------------------------------------------------------------------------
// StatusLine
// ---------------------------------------------------------------------------
describe("StatusLine", () => {
  it("renders the compact mode row", () => {
    const { lastFrame } = render(
      <StatusLine mode="plan" usage={zeroUsage} iterations={0} status="idle" canCycleMode={true} />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain("• plan mode");
    expect(frame).toContain("shift+tab to cycle");
    expect(frame).toContain("Ctrl+/ shortcuts");
    expect(frame).not.toContain("idle");
  });

  it("renders the compact secondary status row only when useful", () => {
    const usage: TokenUsage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };
    const { lastFrame } = render(
      <StatusLine mode="approve" usage={usage} iterations={3} status="done" canCycleMode={false} />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain("• approvals required");
    expect(frame).toContain("done · 150 tok · 3 iter");
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
    expect(frame).toContain("... +1 lines");
    expect(frame).toContain("Current system time is Sun Mar 8 09:28:54 MDT 2026.");
    expect(frame).toContain("• Bash(date)");
    expect(frame).toContain("└ Sun Mar 8 09:28:54 MDT 2026");
    expect(frame).toContain("• Current system time is Sun Mar 8 09:28:54 MDT 2026.");
    expect(frame).not.toContain("|");
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
        mode="plan"
        status="idle"
        error={null}
        plan={null}
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={() => {}}
        onPendingSubmit={() => {}}
        onCycleMode={() => {}}
      />,
    );
    const frame = lastFrame()!;
    // round border uses ╭ and ╮ characters
    expect(frame).toMatch(/[╭╮╰╯│─]/);
  });

  it("does not render the old always-on composer hint line", () => {
    const { lastFrame } = render(
      <LiveSection
        mode="plan"
        status="idle"
        error={null}
        plan={null}
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={() => {}}
        onPendingSubmit={() => {}}
        onCycleMode={() => {}}
      />,
    );
    expect(lastFrame()).not.toContain("Alt+Enter for newline");
  });

  it("shows the compact footer under the composer", () => {
    const { lastFrame } = render(
      <LiveSection
        mode="plan"
        status="idle"
        error={null}
        plan={null}
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={() => {}}
        onPendingSubmit={() => {}}
        onCycleMode={() => {}}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("• plan mode (shift+tab to cycle)");
    expect(frame).toContain("Ctrl+/ shortcuts");
  });
});

describe("HotkeyMenu", () => {
  it("lists Shift+Tab", () => {
    const { lastFrame } = render(<HotkeyMenu />);
    expect(lastFrame()).toContain("Shift+Tab");
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
        mode="plan"
        status="running"
        error={null}
        plan={null}
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
        onCycleMode={noop}
      />,
    );
    expect(lastFrame()).toContain("Thinking...");
  });

  it("shows error message", () => {
    const { lastFrame } = render(
      <LiveSection
        mode="approve"
        status="error"
        error={new Error("something broke")}
        plan={null}
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
        onCycleMode={noop}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("something broke");
    expect(frame).toContain("• approvals required");
  });

  it("shows pending panel actions for plan review", () => {
    const { lastFrame } = render(
      <LiveSection
        mode="plan"
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
        onCycleMode={noop}
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
        mode="plan"
        status="idle"
        error={null}
        plan={null}
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
        onCycleMode={noop}
      />,
    );
    expect(lastFrame()).toContain(">");
  });

  it("hides InputBar when running", () => {
    const { lastFrame } = render(
      <LiveSection
        mode="plan"
        status="running"
        error={null}
        plan={null}
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
        onCycleMode={noop}
      />,
    );
    const frame = lastFrame()!;
    const lines = frame.split("\n");
    const hasInputPrompt = lines.some((l) => l.includes(">") && l.includes("_"));
    expect(hasInputPrompt).toBe(false);
  });

  it("shows the compact secondary row when usage or iterations are present", () => {
    const usage: TokenUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    const { lastFrame } = render(
      <LiveSection
        mode="yolo"
        status="idle"
        error={null}
        plan={null}
        pendingUiState={null}
        usage={usage}
        iterations={2}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
        onCycleMode={noop}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("• bypass permissions");
    expect(frame).toContain("idle · 15 tok · 2 iter");
  });

  it("shows only the primary footer row in idle state with no usage or iterations", () => {
    const { lastFrame } = render(
      <LiveSection
        mode="plan"
        status="idle"
        error={null}
        plan={null}
        pendingUiState={null}
        usage={zeroUsage}
        iterations={0}
        onPromptSubmit={noop}
        onPendingSubmit={() => {}}
        onCycleMode={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain("• plan mode (shift+tab to cycle)");
    expect(frame).not.toContain("idle ·");
  });

  it("hides the global input while a decision panel is active", () => {
    const { lastFrame } = render(
      <LiveSection
        mode="plan"
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
        onCycleMode={noop}
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
