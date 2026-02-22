import { describe, it, expect, vi } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { ContextManager, estimateTokens } from "./context-manager.js";
import type { AgentThread, SummaryEvent, MessageEvent } from "./types.js";

function makeThread(events: AgentThread["events"] = []): AgentThread {
  return {
    id: "test-thread",
    events,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("estimateTokens", () => {
  it("returns Math.ceil(5 / 3.5) = 2 for 'hello'", () => {
    expect(estimateTokens("hello")).toBe(2);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns reasonable estimate for long text", () => {
    const text = "a".repeat(1000);
    const estimate = estimateTokens(text);
    expect(estimate).toBe(Math.ceil(1000 / 3.5));
    expect(estimate).toBeGreaterThan(0);
  });
});

describe("ContextManager", () => {
  describe("estimateThreadTokens", () => {
    it("sums token estimates across all events", () => {
      const events: MessageEvent[] = [
        {
          type: "message",
          role: "user",
          content: "Hello world",
          timestamp: Date.now(),
          iteration: 1,
        },
        {
          type: "message",
          role: "assistant",
          content: "Hi there",
          timestamp: Date.now(),
          iteration: 1,
        },
      ];

      const thread = makeThread(events);
      const cm = new ContextManager();
      const tokens = cm.estimateThreadTokens(thread);

      const expected = events.reduce(
        (sum, e) => sum + estimateTokens(JSON.stringify(e)),
        0,
      );
      expect(tokens).toBe(expected);
      expect(tokens).toBeGreaterThan(0);
    });

    it("returns 0 for empty thread", () => {
      const cm = new ContextManager();
      expect(cm.estimateThreadTokens(makeThread())).toBe(0);
    });
  });

  describe("needsSummarization", () => {
    it("returns false when below threshold", () => {
      const cm = new ContextManager({ maxContextTokens: 100000 });
      const thread = makeThread([
        {
          type: "message",
          role: "user",
          content: "short",
          timestamp: Date.now(),
          iteration: 1,
        },
      ]);
      expect(cm.needsSummarization(thread)).toBe(false);
    });

    it("returns true when exceeding threshold", () => {
      const cm = new ContextManager({ maxContextTokens: 10 });
      const events: MessageEvent[] = Array.from({ length: 20 }, (_, i) => ({
        type: "message" as const,
        role: "user" as const,
        content: "A".repeat(100),
        timestamp: Date.now(),
        iteration: i,
      }));
      const thread = makeThread(events);
      expect(cm.needsSummarization(thread)).toBe(true);
    });
  });

  describe("summarize", () => {
    it("replaces old iteration events with SummaryEvent entries", async () => {
      const mockModel = {
        invoke: vi.fn().mockResolvedValue(
          new AIMessage({ content: "Summary of iteration" }),
        ),
      };

      const events: MessageEvent[] = [];
      for (let i = 0; i < 5; i++) {
        events.push({
          type: "message",
          role: "user",
          content: `Iteration ${i} content`,
          timestamp: Date.now(),
          iteration: i,
        });
        events.push({
          type: "message",
          role: "assistant",
          content: `Response for iteration ${i}`,
          timestamp: Date.now(),
          iteration: i,
        });
      }

      const thread = makeThread(events);
      const cm = new ContextManager({ keepRecentIterations: 3 });

      const result = await cm.summarize(thread, mockModel as any);

      const summaryEvents = result.events.filter(
        (e) => e.type === "summary",
      ) as SummaryEvent[];
      expect(summaryEvents.length).toBeGreaterThan(0);

      const recentEvents = result.events.filter(
        (e) => e.type !== "summary" && e.iteration > 1,
      );
      expect(recentEvents.length).toBe(6);
    });

    it("preserves recent iterations unchanged", async () => {
      const events: MessageEvent[] = [
        {
          type: "message",
          role: "user",
          content: "Hello",
          timestamp: Date.now(),
          iteration: 1,
        },
        {
          type: "message",
          role: "assistant",
          content: "Hi",
          timestamp: Date.now(),
          iteration: 2,
        },
      ];

      const thread = makeThread(events);
      const cm = new ContextManager({ keepRecentIterations: 3 });

      const result = await cm.summarize(thread, {} as any);
      expect(result.events).toHaveLength(2);
    });
  });

  describe("buildContextInjection", () => {
    it("produces formatted string of iteration summaries", () => {
      const summaryEvent: SummaryEvent = {
        type: "summary",
        summarizedIterations: [1, 2],
        summary: "These iterations handled user authentication setup.",
        timestamp: Date.now(),
        iteration: 1,
      };

      const thread = makeThread([summaryEvent]);
      const cm = new ContextManager();
      const injection = cm.buildContextInjection(thread);

      expect(injection).toContain("Previous Iteration Summaries");
      expect(injection).toContain("1, 2");
      expect(injection).toContain(
        "These iterations handled user authentication setup.",
      );
    });

    it("returns empty string when no summaries exist", () => {
      const thread = makeThread([
        {
          type: "message",
          role: "user",
          content: "Hello",
          timestamp: Date.now(),
          iteration: 1,
        },
      ]);
      const cm = new ContextManager();
      expect(cm.buildContextInjection(thread)).toBe("");
    });

    it("includes multiple summaries", () => {
      const events: SummaryEvent[] = [
        {
          type: "summary",
          summarizedIterations: [1],
          summary: "First iteration summary.",
          timestamp: Date.now(),
          iteration: 1,
        },
        {
          type: "summary",
          summarizedIterations: [2, 3],
          summary: "Second and third iteration summary.",
          timestamp: Date.now(),
          iteration: 2,
        },
      ];

      const thread = makeThread(events);
      const cm = new ContextManager();
      const injection = cm.buildContextInjection(thread);

      expect(injection).toContain("Iteration(s) 1");
      expect(injection).toContain("Iteration(s) 2, 3");
      expect(injection).toContain("First iteration summary.");
      expect(injection).toContain("Second and third iteration summary.");
    });
  });
});
