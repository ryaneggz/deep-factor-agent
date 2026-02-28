import React from "react";
import { render } from "ink-testing-library";
import { describe, test, expect, vi, afterEach } from "vitest";
import { StatusBar } from "../../src/components/StatusBar.js";

describe("StatusBar", () => {
  const originalColumns = process.stdout.columns;

  afterEach(() => {
    process.stdout.columns = originalColumns;
  });
  test("renders token counts and iterations", () => {
    const { lastFrame } = render(
      <StatusBar
        usage={{ inputTokens: 100, outputTokens: 50, totalTokens: 150 }}
        iterations={3}
        status="done"
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("100");
    expect(frame).toContain("50");
    expect(frame).toContain("150");
    expect(frame).toContain("3");
  });

  test("shows status text", () => {
    const { lastFrame } = render(
      <StatusBar
        usage={{ inputTokens: 0, outputTokens: 0, totalTokens: 0 }}
        iterations={0}
        status="running"
      />,
    );
    expect(lastFrame()).toContain("running");
  });

  test("displays formatted numbers with commas", () => {
    const { lastFrame } = render(
      <StatusBar
        usage={{ inputTokens: 1234, outputTokens: 567, totalTokens: 1801 }}
        iterations={5}
        status="done"
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("1,234");
    expect(frame).toContain("567");
    expect(frame).toContain("1,801");
  });

  test("separator uses terminal width when available", () => {
    process.stdout.columns = 80;
    const { lastFrame } = render(
      <StatusBar
        usage={{ inputTokens: 0, outputTokens: 0, totalTokens: 0 }}
        iterations={0}
        status="idle"
      />,
    );
    const frame = lastFrame()!;
    // The separator line should contain 80 "─" characters
    expect(frame).toContain("─".repeat(80));
  });

  test("separator falls back to 50 when terminal width unavailable", () => {
    // Simulate no terminal (e.g. piped output)
    (process.stdout as { columns?: number }).columns = undefined as unknown as number;
    const { lastFrame } = render(
      <StatusBar
        usage={{ inputTokens: 0, outputTokens: 0, totalTokens: 0 }}
        iterations={0}
        status="idle"
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("─".repeat(50));
  });
});
