import { describe, it, expect, vi } from "vitest";
import {
  maxIterations,
  maxTokens,
  maxInputTokens,
  maxOutputTokens,
  maxCost,
  calculateCost,
  MODEL_PRICING,
  evaluateStopConditions,
} from "../src/stop-conditions.js";
import type { StopConditionContext, TokenUsage, AgentThread } from "../src/types.js";

function makeThread(): AgentThread {
  return {
    id: "test-thread",
    events: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeUsage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<StopConditionContext> = {}): StopConditionContext {
  return {
    iteration: 1,
    usage: makeUsage(),
    model: "claude-sonnet-4-5",
    thread: makeThread(),
    ...overrides,
  };
}

describe("maxIterations", () => {
  it("does not stop before reaching the limit", () => {
    const condition = maxIterations(3);
    expect(condition(makeCtx({ iteration: 1 }))).toEqual({ stop: false });
    expect(condition(makeCtx({ iteration: 2 }))).toEqual({ stop: false });
  });

  it("stops on reaching the limit", () => {
    const condition = maxIterations(3);
    const result = condition(makeCtx({ iteration: 3 }));
    expect(result.stop).toBe(true);
    expect(result.reason).toContain("3");
  });

  it("stops when exceeding the limit", () => {
    const condition = maxIterations(3);
    const result = condition(makeCtx({ iteration: 5 }));
    expect(result.stop).toBe(true);
  });
});

describe("maxTokens", () => {
  it("does not stop below the limit", () => {
    const condition = maxTokens(1000);
    const result = condition(makeCtx({ usage: makeUsage({ totalTokens: 999 }) }));
    expect(result.stop).toBe(false);
  });

  it("stops when total tokens reach the limit", () => {
    const condition = maxTokens(1000);
    const result = condition(makeCtx({ usage: makeUsage({ totalTokens: 1000 }) }));
    expect(result.stop).toBe(true);
    expect(result.reason).toContain("1000");
  });

  it("stops when exceeding the limit", () => {
    const condition = maxTokens(1000);
    const result = condition(makeCtx({ usage: makeUsage({ totalTokens: 1500 }) }));
    expect(result.stop).toBe(true);
  });
});

describe("maxInputTokens", () => {
  it("does not stop below the limit", () => {
    const condition = maxInputTokens(500);
    const result = condition(makeCtx({ usage: makeUsage({ inputTokens: 499 }) }));
    expect(result.stop).toBe(false);
  });

  it("stops when input tokens reach the limit", () => {
    const condition = maxInputTokens(500);
    const result = condition(makeCtx({ usage: makeUsage({ inputTokens: 500 }) }));
    expect(result.stop).toBe(true);
    expect(result.reason).toContain("500");
  });
});

describe("maxOutputTokens", () => {
  it("does not stop below the limit", () => {
    const condition = maxOutputTokens(500);
    const result = condition(makeCtx({ usage: makeUsage({ outputTokens: 499 }) }));
    expect(result.stop).toBe(false);
  });

  it("stops when output tokens reach the limit", () => {
    const condition = maxOutputTokens(500);
    const result = condition(makeCtx({ usage: makeUsage({ outputTokens: 500 }) }));
    expect(result.stop).toBe(true);
    expect(result.reason).toContain("500");
  });
});

describe("calculateCost", () => {
  it("computes cost for a known model", () => {
    const usage = makeUsage({ inputTokens: 1000, outputTokens: 500 });
    const cost = calculateCost(usage, "claude-sonnet-4-5");
    // input: 1000 * 0.000003 = 0.003
    // output: 500 * 0.000015 = 0.0075
    expect(cost).toBeCloseTo(0.0105, 6);
  });

  it("handles cache tokens when present", () => {
    const usage: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      cacheReadTokens: 200,
      cacheWriteTokens: 100,
    };
    const cost = calculateCost(usage, "claude-sonnet-4-5");
    // input: 1000 * 0.000003 = 0.003
    // output: 500 * 0.000015 = 0.0075
    // cacheRead: 200 * 0.0000003 = 0.00006
    // cacheWrite: 100 * 0.00000375 = 0.000375
    const expected = 0.003 + 0.0075 + 0.00006 + 0.000375;
    expect(cost).toBeCloseTo(expected, 6);
  });

  it("returns 0 for unknown models", () => {
    const usage = makeUsage({ inputTokens: 1000, outputTokens: 500 });
    expect(calculateCost(usage, "unknown-model")).toBe(0);
  });

  it("warns once per unknown model (not on every call)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const usage = makeUsage({ inputTokens: 100, outputTokens: 50 });

    // Use a unique model name to avoid interference from other tests
    calculateCost(usage, "test-warn-model-abc");
    calculateCost(usage, "test-warn-model-abc");
    calculateCost(usage, "test-warn-model-abc");

    const relevantCalls = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("test-warn-model-abc"),
    );
    expect(relevantCalls).toHaveLength(1);
    expect(relevantCalls[0][0]).toContain("Unknown model");
    expect(relevantCalls[0][0]).toContain("maxCost");

    warnSpy.mockRestore();
  });

  it("computes cost for gpt-4o", () => {
    const usage = makeUsage({
      inputTokens: 1000000,
      outputTokens: 1000000,
      totalTokens: 2000000,
    });
    const cost = calculateCost(usage, "gpt-4o");
    // input: 1M * 0.0000025 = 2.50
    // output: 1M * 0.00001 = 10.00
    expect(cost).toBeCloseTo(12.5, 2);
  });
});

describe("maxCost", () => {
  it("does not stop below the budget", () => {
    const condition = maxCost(0.5);
    const result = condition(
      makeCtx({
        usage: makeUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
        model: "claude-sonnet-4-5",
      }),
    );
    expect(result.stop).toBe(false);
  });

  it("stops when cost reaches the budget", () => {
    const condition = maxCost(0.01);
    // 1000 input * 0.000003 = 0.003, 500 output * 0.000015 = 0.0075 = 0.0105 total
    const result = condition(
      makeCtx({
        usage: makeUsage({
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        }),
        model: "claude-sonnet-4-5",
      }),
    );
    expect(result.stop).toBe(true);
    expect(result.reason).toContain("$0.01");
  });

  it("never triggers for unknown model because calculateCost returns 0", () => {
    const condition = maxCost(0.001);
    const result = condition(
      makeCtx({
        usage: makeUsage({
          inputTokens: 999999,
          outputTokens: 999999,
          totalTokens: 1999998,
        }),
        model: "unknown-model-xyz",
      }),
    );
    // calculateCost returns 0 for unknown models, so cost never exceeds budget
    expect(result.stop).toBe(false);
  });

  it("uses explicit model override instead of context model", () => {
    const condition = maxCost(0.01, "gpt-4o");
    // With gpt-4o: 1000 * 0.0000025 + 500 * 0.00001 = 0.0025 + 0.005 = 0.0075 < 0.01
    const result = condition(
      makeCtx({
        usage: makeUsage({
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        }),
        model: "claude-sonnet-4-5", // this should be overridden
      }),
    );
    expect(result.stop).toBe(false);
  });
});

describe("evaluateStopConditions", () => {
  it("returns null when no condition triggers", () => {
    const conditions = [maxIterations(10), maxTokens(10000)];
    const result = evaluateStopConditions(
      conditions,
      makeCtx({ iteration: 1, usage: makeUsage({ totalTokens: 100 }) }),
    );
    expect(result).toBeNull();
  });

  it("returns the first triggered result (OR semantics)", () => {
    const conditions = [maxIterations(3), maxTokens(1000)];
    const result = evaluateStopConditions(
      conditions,
      makeCtx({
        iteration: 3,
        usage: makeUsage({ totalTokens: 5000 }),
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.stop).toBe(true);
    // Should be maxIterations since it's first in the array
    expect(result!.reason).toContain("iterations");
  });

  it("returns triggered result when only the second condition fires", () => {
    const conditions = [maxIterations(10), maxTokens(1000)];
    const result = evaluateStopConditions(
      conditions,
      makeCtx({
        iteration: 2,
        usage: makeUsage({ totalTokens: 1500 }),
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.stop).toBe(true);
    expect(result!.reason).toContain("tokens");
  });

  it("handles empty conditions array", () => {
    const result = evaluateStopConditions([], makeCtx());
    expect(result).toBeNull();
  });

  it("supports composability with OR semantics", () => {
    const conditions = [maxIterations(5), maxTokens(2000), maxCost(1.0)];
    // None should trigger
    const result1 = evaluateStopConditions(
      conditions,
      makeCtx({
        iteration: 2,
        usage: makeUsage({ totalTokens: 500, inputTokens: 200, outputTokens: 300 }),
      }),
    );
    expect(result1).toBeNull();

    // maxIterations triggers
    const result2 = evaluateStopConditions(conditions, makeCtx({ iteration: 5 }));
    expect(result2).not.toBeNull();
    expect(result2!.reason).toContain("iterations");
  });
});

describe("MODEL_PRICING", () => {
  it("contains all required models", () => {
    const required = [
      "claude-sonnet-4-5",
      "claude-opus-4-5",
      "claude-haiku-4-5",
      "claude-sonnet-4-6",
      "claude-opus-4-6",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4.1-mini",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
    ];
    for (const model of required) {
      expect(MODEL_PRICING[model]).toBeDefined();
      expect(MODEL_PRICING[model].input).toBeGreaterThan(0);
      expect(MODEL_PRICING[model].output).toBeGreaterThan(0);
    }
  });

  it("claude-sonnet-4-6 has correct pricing", () => {
    const pricing = MODEL_PRICING["claude-sonnet-4-6"];
    expect(pricing).toBeDefined();
    expect(pricing.input).toBe(0.000003);
    expect(pricing.output).toBe(0.000015);
    expect(pricing.cacheRead).toBe(0.0000003);
    expect(pricing.cacheWrite).toBe(0.00000375);
  });

  it("claude-opus-4-6 has correct pricing", () => {
    const pricing = MODEL_PRICING["claude-opus-4-6"];
    expect(pricing).toBeDefined();
    expect(pricing.input).toBe(0.000015);
    expect(pricing.output).toBe(0.000075);
    expect(pricing.cacheRead).toBe(0.0000015);
    expect(pricing.cacheWrite).toBe(0.00001875);
  });

  it("computes cost correctly for claude-sonnet-4-6", () => {
    const usage = makeUsage({ inputTokens: 1000, outputTokens: 500 });
    const cost = calculateCost(usage, "claude-sonnet-4-6");
    // input: 1000 * 0.000003 = 0.003, output: 500 * 0.000015 = 0.0075
    expect(cost).toBeCloseTo(0.0105, 6);
  });

  it("computes cost correctly for claude-opus-4-6", () => {
    const usage = makeUsage({ inputTokens: 1000, outputTokens: 500 });
    const cost = calculateCost(usage, "claude-opus-4-6");
    // input: 1000 * 0.000015 = 0.015, output: 500 * 0.000075 = 0.0375
    expect(cost).toBeCloseTo(0.0525, 6);
  });
});
