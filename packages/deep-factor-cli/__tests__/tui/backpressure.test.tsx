import React from "react";
import { render } from "ink-testing-library";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { MockApp } from "../../src/testing/MockApp.js";

// Mock useApp to prevent actual exit calls
const mockExit = vi.fn();

vi.mock("ink", async () => {
  const actual = await vi.importActual("ink");
  return {
    ...(actual as Record<string, unknown>),
    useApp: () => ({ exit: mockExit }),
  };
});

// Mock bashTool to avoid deep-factor-agent runtime dependency
vi.mock("../../src/tools/bash.js", () => ({
  bashTool: { name: "bash", description: "mock bash" },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Write a prompt to stdin and press Enter */
function sendPrompt(stdin: { write: (data: string) => void }, text: string) {
  stdin.write(text);
  stdin.write("\r");
}

// ─── Slow Conversation ─────────────────────────────────────────────

describe("slow conversation scenario", () => {
  test("status transitions idle → running → done", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="slow" />);

    // Initially idle — prompt input visible
    expect(lastFrame()).toContain(">");

    // Send prompt → running
    sendPrompt(stdin, "hello");
    await vi.advanceTimersByTimeAsync(0);

    // Step 0 fires at cumulative 0ms — assistant message added, still running
    expect(lastFrame()).toContain("Thinking");

    // Advance past all steps (4600ms total)
    await vi.advanceTimersByTimeAsync(5000);

    // Done — spinner gone, prompt re-appears (interactive mode)
    expect(lastFrame()).not.toContain("Thinking");
    expect(lastFrame()).toContain(">");
  });

  test("messages appear in correct order", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="slow" />);

    sendPrompt(stdin, "hello");

    // Advance through all steps
    await vi.advanceTimersByTimeAsync(5000);

    const frame = lastFrame()!;
    // User message should appear
    expect(frame).toContain("hello");
    // Tool call name should appear (verbose=true)
    expect(frame).toContain("search");
    // Assistant response should appear
    expect(frame).toContain("Here are the results I found.");
  });

  test("spinner visible during running, hidden after done", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="slow" />);

    sendPrompt(stdin, "go");
    await vi.advanceTimersByTimeAsync(100);

    // Running — spinner visible
    expect(lastFrame()).toContain("Thinking");

    // Advance past all delays
    await vi.advanceTimersByTimeAsync(5000);

    // Done — spinner hidden
    expect(lastFrame()).not.toContain("Thinking");
  });
});

// ─── Rapid Burst ────────────────────────────────────────────────────

describe("rapid burst scenario", () => {
  test("all messages render without crash", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="burst" />);

    sendPrompt(stdin, "burst");

    // 50 pairs × 10ms each + 1 message + done = 102 steps × 10ms ≈ 1020ms
    // Total: (100 × 10) + 10 + 0 = 1010ms
    await vi.advanceTimersByTimeAsync(1500);

    // Should complete without crashing
    const frame = lastFrame()!;
    expect(frame).toBeTruthy();
    expect(frame).toContain("Completed 50 operations.");
  });

  test("final frame contains assistant response", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="burst" />);

    sendPrompt(stdin, "run");
    await vi.advanceTimersByTimeAsync(1500);

    expect(lastFrame()).toContain("Completed 50 operations.");
  });

  test("status bar updates token counts", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="burst" />);

    sendPrompt(stdin, "run");
    await vi.advanceTimersByTimeAsync(1500);

    const frame = lastFrame()!;
    // rapidBurst(50) sets usage: inputTokens=500, outputTokens=250, totalTokens=750
    expect(frame).toContain("500");
    expect(frame).toContain("250");
    expect(frame).toContain("750");
  });
});

// ─── Mixed Pressure ─────────────────────────────────────────────────

describe("mixed pressure scenario", () => {
  test("transitions between slow and fast phases", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="mixed" />);

    sendPrompt(stdin, "analyze");

    // Phase 1 slow: 3 steps at 2000ms each (cumulative: 2000, 4000, 6000)
    await vi.advanceTimersByTimeAsync(2100);
    expect(lastFrame()).toContain("analyze");

    await vi.advanceTimersByTimeAsync(4000);
    // After slow phase + fast phase, messages should be accumulating
    expect(lastFrame()).toContain("Analysis phase done");

    // Advance through remaining (total ~14100ms to be safe)
    await vi.advanceTimersByTimeAsync(8000);

    // Done
    expect(lastFrame()).toContain("All checks passed. Done.");
    expect(lastFrame()).toContain(">");
  });

  test("tool calls visible in verbose mode", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="mixed" />);

    sendPrompt(stdin, "go");

    // Advance through everything
    await vi.advanceTimersByTimeAsync(15000);

    const frame = lastFrame()!;
    // Tool call indicators visible in verbose mode
    expect(frame).toContain("analyze");
    expect(frame).toContain("check_0");
  });
});

// ─── Long Running ───────────────────────────────────────────────────

describe("long running scenario", () => {
  test("high iteration count renders without error", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="long" />);

    sendPrompt(stdin, "start");

    // 20 iterations × 3 steps × 500ms = 30000ms + done step at 30000ms
    await vi.advanceTimersByTimeAsync(31000);

    const frame = lastFrame()!;
    expect(frame).toBeTruthy();
    // Final iteration message
    expect(frame).toContain("Iteration 20 complete");
  });

  test("status bar iteration count matches expected", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="long" />);

    sendPrompt(stdin, "start");
    await vi.advanceTimersByTimeAsync(31000);

    const frame = lastFrame()!;
    // 20 assistant messages + 1 done = 21 iterations tracked
    // StatusBar shows: "Iterations: N"
    expect(frame).toContain("Iterations:");
    // At least 20 iterations (each assistant message increments + done increments)
    expect(frame).toMatch(/Iterations:\s*(2[0-9]|[3-9]\d)/);
  });
});

// ─── Error Recovery ─────────────────────────────────────────────────

describe("error recovery scenario", () => {
  test("error message appears", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="error" />);

    sendPrompt(stdin, "try");

    // Steps: tool_call@500, tool_result@1000, error@2000
    await vi.advanceTimersByTimeAsync(2500);

    const frame = lastFrame()!;
    expect(frame).toContain("API timeout");
  });

  test("status transitions: running → error", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="error" />);

    sendPrompt(stdin, "try");

    // Advance past first step — should be running
    await vi.advanceTimersByTimeAsync(100);
    expect(lastFrame()).toContain("Thinking");

    // Advance past error step
    await vi.advanceTimersByTimeAsync(2500);

    // Error state — spinner gone, error message shown
    expect(lastFrame()).not.toContain("Thinking");
    expect(lastFrame()).toContain("API timeout");
    expect(lastFrame()).toContain("error");
  });
});

// ─── Human Input ────────────────────────────────────────────────────

describe("human input scenario", () => {
  test("HumanInput component appears at pending_input", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="human" />);

    sendPrompt(stdin, "ask");

    // Steps: tool_call@500, tool_result@1000, human_input@1500
    await vi.advanceTimersByTimeAsync(1600);

    const frame = lastFrame()!;
    expect(frame).toContain("Pick one");
    expect(frame).toContain("Option A");
    expect(frame).toContain("Option B");
  });

  test("submitting input resumes scenario", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="human" />);

    sendPrompt(stdin, "ask");

    // Advance to human_input pause
    await vi.advanceTimersByTimeAsync(1600);
    expect(lastFrame()).toContain("Pick one");

    // Submit human input — type response + Enter
    stdin.write("1");
    stdin.write("\r");

    // Advance past remaining steps (message@500ms, done@600ms from resume)
    await vi.advanceTimersByTimeAsync(1000);

    const frame = lastFrame()!;
    expect(frame).toContain("You chose an option. Proceeding...");
    expect(frame).toContain(">");
  });
});

// ─── Large Payload ──────────────────────────────────────────────────

describe("large payload scenario", () => {
  test("long content renders without crash", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="large" />);

    sendPrompt(stdin, "big");

    // Step at 100ms + done at 100ms
    await vi.advanceTimersByTimeAsync(200);

    const frame = lastFrame()!;
    expect(frame).toBeTruthy();
    expect(frame.length).toBeGreaterThan(0);
  });

  test("content is present in frame", async () => {
    const { lastFrame, stdin } = render(<MockApp scenario="large" />);

    sendPrompt(stdin, "big");
    await vi.advanceTimersByTimeAsync(200);

    // largePayload generates 5000 'A' characters
    const frame = lastFrame()!;
    expect(frame).toContain("AAAAAAAAAA");
  });
});
