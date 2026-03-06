import { describe, it, expect } from "vitest";
import { DeepFactorAgent } from "../src/agent.js";
import type { ModelAdapter } from "../src/providers/types.js";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";

/**
 * Real (non-mocked) ModelAdapter that always throws a specified error.
 * This validates that the agent loop surfaces the actual error message
 * in stopDetail rather than just "N consecutive errors".
 */
class FailingAdapter implements ModelAdapter {
  constructor(private errorMessage: string) {}

  async invoke(_messages: BaseMessage[]): Promise<AIMessage> {
    throw new Error(this.errorMessage);
  }
}

describe("error message surfacing (no mocks)", () => {
  it("stopDetail includes the actual error message after consecutive failures", async () => {
    const adapter = new FailingAdapter("Authentication failed: invalid API key");
    const agent = new DeepFactorAgent({ model: adapter });

    const result = await agent.loop("Hello");

    expect(result.stopReason).toBe("max_errors");
    expect(result.stopDetail).toContain("3 consecutive errors:");
    expect(result.stopDetail).toContain("Authentication failed: invalid API key");
  });

  it("error events in thread contain the real error message", async () => {
    const adapter = new FailingAdapter("Rate limit exceeded");
    const agent = new DeepFactorAgent({ model: adapter });

    const result = await agent.loop("Hello");

    const errorEvents = result.thread.events.filter((e) => e.type === "error");
    expect(errorEvents.length).toBe(3);
    for (const event of errorEvents) {
      if (event.type === "error") {
        expect(event.error).toContain("Rate limit exceeded");
      }
    }
  });
});
