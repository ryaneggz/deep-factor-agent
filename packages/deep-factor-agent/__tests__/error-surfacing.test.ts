import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import { describe, it, expect } from "vitest";
import { DeepFactorAgent } from "../src/agent.js";
import type { ModelAdapter } from "../src/providers/types.js";

class FailingAdapter implements ModelAdapter {
  constructor(private readonly errorMessage: string) {}

  async invoke(_messages: BaseMessage[]): Promise<AIMessage> {
    throw new Error(this.errorMessage);
  }
}

describe("error message surfacing", () => {
  it("includes the last compacted error in stopDetail after consecutive failures", async () => {
    const agent = new DeepFactorAgent({
      model: new FailingAdapter("Authentication failed: invalid API key"),
    });

    const result = await agent.loop("Hello");

    expect(result.stopReason).toBe("max_errors");
    expect(result.stopDetail).toContain("3 consecutive errors:");
    expect(result.stopDetail).toContain("Authentication failed: invalid API key");
  });

  it("records error events with the real underlying message", async () => {
    const agent = new DeepFactorAgent({
      model: new FailingAdapter("Rate limit exceeded"),
    });

    const result = await agent.loop("Hello");
    const errorEvents = result.thread.events.filter((event) => event.type === "error");

    expect(errorEvents).toHaveLength(3);
    for (const event of errorEvents) {
      if (event.type === "error") {
        expect(event.error).toContain("Rate limit exceeded");
      }
    }
  });
});
