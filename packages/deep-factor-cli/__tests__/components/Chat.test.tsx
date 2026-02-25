import React from "react";
import { render } from "ink-testing-library";
import { describe, test, expect } from "vitest";
import { Chat } from "../../src/components/Chat.js";

describe("Chat", () => {
  test("renders user message", () => {
    const { lastFrame } = render(
      <Chat
        messages={[{ role: "user", content: "hello" }]}
        verbose={false}
      />,
    );
    expect(lastFrame()).toContain("hello");
  });

  test("renders assistant message", () => {
    const { lastFrame } = render(
      <Chat
        messages={[{ role: "assistant", content: "world" }]}
        verbose={false}
      />,
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
    const { lastFrame } = render(
      <Chat messages={[]} verbose={false} />,
    );
    expect(lastFrame()).toBe("");
  });
});
