import React from "react";
import { render } from "ink-testing-library";
import { describe, test, expect, vi } from "vitest";

vi.mock("deep-factor-agent", () => ({
  createDeepFactorAgent: vi.fn(() => ({
    loop: vi.fn(async () => ({
      response: "test response",
      thread: {
        id: "test-thread",
        events: [
          {
            type: "message",
            role: "user",
            content: "hello",
            timestamp: 0,
            iteration: 1,
          },
          {
            type: "message",
            role: "assistant",
            content: "test response",
            timestamp: 1,
            iteration: 1,
          },
        ],
        metadata: {},
        createdAt: 0,
        updatedAt: 0,
      },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
      stopReason: "completed",
    })),
  })),
  maxIterations: vi.fn(() => () => ({ stop: false })),
  isPendingResult: vi.fn(() => false),
  requestHumanInput: { name: "requestHumanInput" },
  TOOL_NAME_REQUEST_HUMAN_INPUT: "requestHumanInput",
  createLangChainTool: vi.fn(() => ({ name: "mock-tool" })),
}));

import { App } from "../src/app.js";

describe("App", () => {
  test("shows assistant response after agent completes", async () => {
    const { lastFrame } = render(
      <App
        prompt="hello"
        model="test-model"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("test response");
    });
  });

  test("shows status bar with usage after completion", async () => {
    const { lastFrame } = render(
      <App
        prompt="hello"
        model="test-model"
        maxIter={10}
        verbose={false}
        enableBash={false}
        interactive={false}
      />,
    );

    await vi.waitFor(() => {
      const frame = lastFrame()!;
      expect(frame).toContain("10");
      expect(frame).toContain("5");
      expect(frame).toContain("15");
    });
  });
});
