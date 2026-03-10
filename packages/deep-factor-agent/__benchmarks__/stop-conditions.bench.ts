import { bench, describe } from "vitest";
import {
  calculateCost,
  evaluateStopConditions,
  maxIterations,
  maxTokens,
  maxCost,
} from "../src/stop-conditions.js";
import type { StopConditionContext, TokenUsage, AgentThread } from "../src/types.js";

// --- Shared fixtures ---

const baseUsage: TokenUsage = {
  inputTokens: 50_000,
  outputTokens: 10_000,
  totalTokens: 60_000,
};

const usageWithCache: TokenUsage = {
  ...baseUsage,
  cacheReadTokens: 20_000,
  cacheWriteTokens: 5_000,
};

const emptyThread: AgentThread = {
  id: "bench",
  events: [],
  metadata: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const ctx: StopConditionContext = {
  iteration: 5,
  usage: baseUsage,
  model: "claude-sonnet-4-6",
  thread: emptyThread,
};

// --- calculateCost benchmarks ---

describe("calculateCost", () => {
  bench("known model, no cache", () => {
    calculateCost(baseUsage, "claude-sonnet-4-6");
  });

  bench("known model, with cache", () => {
    calculateCost(usageWithCache, "claude-sonnet-4-6");
  });

  bench("unknown model", () => {
    calculateCost(baseUsage, "unknown-model");
  });
});

// --- evaluateStopConditions benchmarks ---

const threeConditionsNoneTrigger = [maxIterations(100), maxTokens(1_000_000), maxCost(10.0)];
const threeConditionsFirstTriggers = [maxIterations(1), maxTokens(1_000_000), maxCost(10.0)];

const tenConditionsNoneTrigger = [
  maxIterations(100),
  maxTokens(1_000_000),
  maxCost(10.0),
  maxIterations(200),
  maxTokens(2_000_000),
  maxCost(20.0),
  maxIterations(300),
  maxTokens(3_000_000),
  maxCost(30.0),
  maxIterations(400),
];

const tenConditionsFirstTriggers = [
  maxIterations(1),
  maxTokens(1_000_000),
  maxCost(10.0),
  maxIterations(200),
  maxTokens(2_000_000),
  maxCost(20.0),
  maxIterations(300),
  maxTokens(3_000_000),
  maxCost(30.0),
  maxIterations(400),
];

describe("evaluateStopConditions", () => {
  bench("3 conditions, none trigger", () => {
    evaluateStopConditions(threeConditionsNoneTrigger, ctx);
  });

  bench("3 conditions, first triggers", () => {
    evaluateStopConditions(threeConditionsFirstTriggers, ctx);
  });

  bench("10 conditions, none trigger", () => {
    evaluateStopConditions(tenConditionsNoneTrigger, ctx);
  });

  bench("10 conditions, first triggers", () => {
    evaluateStopConditions(tenConditionsFirstTriggers, ctx);
  });
});
