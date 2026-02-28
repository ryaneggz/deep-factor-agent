import React from "react";
import { render } from "ink-testing-library";
import { describe, test, expect } from "vitest";
import { Chat } from "../../src/components/Chat.js";

describe("Chat", () => {
  test("renders user message", () => {
    const { lastFrame } = render(
      <Chat messages={[{ role: "user", content: "hello" }]} verbose={false} />,
    );
    expect(lastFrame()).toContain("hello");
  });

  test("renders assistant message", () => {
    const { lastFrame } = render(
      <Chat messages={[{ role: "assistant", content: "world" }]} verbose={false} />,
    );
    expect(lastFrame()).toContain("world");
  });

  test("hides tool messages when verbose=false", () => {
    const { lastFrame } = render(
      <Chat
        messages={[
          {
            role: "tool_call",
            content: "read",
            toolName: "read",
            toolArgs: { path: "/tmp" },
          },
          { role: "tool_result", content: "file content here" },
        ]}
        verbose={false}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("read");
    expect(frame).not.toContain("file content");
  });

  test("shows tool messages when verbose=true", () => {
    const { lastFrame } = render(
      <Chat
        messages={[
          {
            role: "tool_call",
            content: "read",
            toolName: "read",
            toolArgs: { path: "/tmp" },
          },
        ]}
        verbose={true}
      />,
    );
    expect(lastFrame()).toContain("read");
  });

  test("renders nothing for empty messages", () => {
    const { lastFrame } = render(<Chat messages={[]} verbose={false} />);
    expect(lastFrame()).toBe("");
  });

  test("renders tool_call with toolName and args via ToolCall component", () => {
    const { lastFrame } = render(
      <Chat
        messages={[
          {
            role: "tool_call",
            content: "search",
            toolName: "search",
            toolArgs: { query: "vitest" },
          },
        ]}
        verbose={true}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("search");
    expect(frame).toContain("query");
    expect(frame).toContain("vitest");
  });

  test("renders tool_result content when verbose=true", () => {
    const { lastFrame } = render(
      <Chat
        messages={[{ role: "tool_result", content: "result data from tool" }]}
        verbose={true}
      />,
    );
    expect(lastFrame()).toContain("result data from tool");
  });

  test("truncates tool_result content at 200 chars", () => {
    // Use distinct prefix and suffix to verify truncation boundary
    const longContent = "X".repeat(200) + "Y".repeat(50);
    const { lastFrame } = render(
      <Chat messages={[{ role: "tool_result", content: longContent }]} verbose={true} />,
    );
    const frame = lastFrame() ?? "";
    // Truncation adds "..." and removes content past 200 chars
    expect(frame).toContain("...");
    // Full 250-char string should NOT appear
    expect(frame).not.toContain(longContent);
    // The suffix "Y" chars should not appear (they're past 200)
    expect(frame).not.toContain("Y");
  });
});
