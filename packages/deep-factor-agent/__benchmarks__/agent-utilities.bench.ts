import { bench, describe } from "vitest";
import { addUsage } from "../src/agent.js";
import { toolArrayToMap } from "../src/tool-adapter.js";
import { composeMiddleware } from "../src/middleware.js";
import type { TokenUsage, AgentMiddleware } from "../src/types.js";
import type { StructuredToolInterface } from "@langchain/core/tools";

// --- addUsage fixtures ---

const usageA: TokenUsage = {
  inputTokens: 1000,
  outputTokens: 500,
  totalTokens: 1500,
};

const usageB: TokenUsage = {
  inputTokens: 2000,
  outputTokens: 1000,
  totalTokens: 3000,
};

const usageWithCache: TokenUsage = {
  inputTokens: 1000,
  outputTokens: 500,
  totalTokens: 1500,
  cacheReadTokens: 300,
  cacheWriteTokens: 100,
};

// --- addUsage benchmarks ---

describe("addUsage", () => {
  bench("basic (no cache)", () => {
    addUsage(usageA, usageB);
  });

  bench("with cache tokens", () => {
    addUsage(usageWithCache, usageWithCache);
  });
});

// --- toolArrayToMap fixtures ---

function makeMockTools(count: number): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = [];
  for (let i = 0; i < count; i++) {
    tools.push({
      name: `tool_${i}`,
      description: `Tool number ${i}`,
      invoke: async () => "result",
      schema: {} as never,
    } as unknown as StructuredToolInterface);
  }
  return tools;
}

const tools5 = makeMockTools(5);
const tools20 = makeMockTools(20);

describe("toolArrayToMap", () => {
  bench("5 tools", () => {
    toolArrayToMap(tools5);
  });

  bench("20 tools", () => {
    toolArrayToMap(tools20);
  });
});

// --- composeMiddleware fixtures ---

function makeMockMiddlewares(count: number): AgentMiddleware[] {
  const middlewares: AgentMiddleware[] = [];
  for (let i = 0; i < count; i++) {
    middlewares.push({
      name: `mw_${i}`,
      beforeIteration: async () => {},
      afterIteration: async () => {},
    });
  }
  return middlewares;
}

const middlewares5 = makeMockMiddlewares(5);

describe("composeMiddleware", () => {
  bench("5 middlewares", () => {
    composeMiddleware(middlewares5, { onConflict: () => {} });
  });
});
