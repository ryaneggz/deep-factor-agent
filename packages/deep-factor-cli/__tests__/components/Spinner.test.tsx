import React from "react";
import { render } from "ink-testing-library";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Spinner } from "../../src/components/Spinner.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Spinner", () => {
  test("renders 'Thinking' text", () => {
    const { lastFrame } = render(<Spinner />);
    expect(lastFrame()).toContain("Thinking");
  });

  test("starts with 1 dot", () => {
    const { lastFrame } = render(<Spinner />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Thinking.");
    expect(frame).not.toContain("Thinking..");
  });

  test("shows 2 dots after first interval", async () => {
    const { lastFrame } = render(<Spinner />);
    // Advance past first interval and give React time to flush
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(50);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Thinking..");
    expect(frame).not.toContain("Thinking...");
  });

  test("shows 3 dots after 600ms", async () => {
    const { lastFrame } = render(<Spinner />);
    await vi.advanceTimersByTimeAsync(600);
    expect(lastFrame()).toContain("Thinking...");
  });

  test("cycles back to 1 dot after 900ms", async () => {
    const { lastFrame } = render(<Spinner />);
    await vi.advanceTimersByTimeAsync(900);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Thinking.");
    expect(frame).not.toContain("Thinking..");
  });

  test("cleans up interval on unmount", async () => {
    const { unmount } = render(<Spinner />);
    unmount();
    await vi.advanceTimersByTimeAsync(3000);
    // If interval leaked, this would cause React state update on unmounted component
  });

  test("cycles correctly over 2700ms (9 intervals back to 1 dot)", async () => {
    const { lastFrame } = render(<Spinner />);
    // 9 intervals = 2700ms, cycles: 1→2→3→1→2→3→1→2→3 → wraps to 1
    await vi.advanceTimersByTimeAsync(2750);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Thinking.");
    expect(frame).not.toContain("Thinking..");
  });
});
