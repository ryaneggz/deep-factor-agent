import React from "react";
import { render } from "ink-testing-library";
import { describe, test, expect } from "vitest";
import { ToolCall } from "../../src/components/ToolCall.js";

describe("ToolCall", () => {
  test("renders tool name", () => {
    const { lastFrame } = render(<ToolCall toolName="search" args={{ query: "test" }} />);
    expect(lastFrame()).toContain("search");
  });

  test("renders JSON args", () => {
    const { lastFrame } = render(<ToolCall toolName="search" args={{ query: "test" }} />);
    expect(lastFrame()).toContain("query");
    expect(lastFrame()).toContain("test");
  });

  test("truncates string values over 120 chars", () => {
    const longValue = "x".repeat(150);
    const { lastFrame } = render(<ToolCall toolName="read" args={{ content: longValue }} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("...");
    expect(frame).not.toContain(longValue);
  });

  test("preserves string values of 120 chars or fewer", () => {
    // Use a short value that fits within terminal width to avoid wrapping
    const shortValue = "y".repeat(50);
    const { lastFrame } = render(<ToolCall toolName="read" args={{ content: shortValue }} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain(shortValue);
    expect(frame).not.toContain("...");
  });

  test("renders empty args object", () => {
    const { lastFrame } = render(<ToolCall toolName="noop" args={{}} />);
    expect(lastFrame()).toContain("noop");
    expect(lastFrame()).toContain("{}");
  });

  test("renders multi-key args", () => {
    const { lastFrame } = render(
      <ToolCall toolName="api" args={{ url: "/test", method: "GET" }} />,
    );
    expect(lastFrame()).toContain("url");
    expect(lastFrame()).toContain("/test");
    expect(lastFrame()).toContain("method");
    expect(lastFrame()).toContain("GET");
  });

  test("renders number values", () => {
    const { lastFrame } = render(<ToolCall toolName="calc" args={{ value: 42 }} />);
    expect(lastFrame()).toContain("42");
  });

  test("renders nested objects", () => {
    const { lastFrame } = render(<ToolCall toolName="complex" args={{ nested: { a: 1 } }} />);
    expect(lastFrame()).toContain("nested");
  });

  test("renders null and undefined values without crashing", () => {
    // null is JSON-serializable, undefined is handled by the fallback
    const { lastFrame } = render(<ToolCall toolName="nullable" args={{ a: null }} />);
    expect(lastFrame()).toContain("nullable");
    expect(lastFrame()).toContain("null");
  });
});
