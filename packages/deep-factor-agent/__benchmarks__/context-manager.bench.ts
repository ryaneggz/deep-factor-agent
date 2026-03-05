import { bench, describe } from "vitest";
import { ContextManager, estimateTokens } from "../src/context-manager.js";
import type { AgentThread, AgentEvent } from "../src/types.js";

// --- estimateTokens inputs ---

const shortText = "Hello, world!";
const mediumText = "The quick brown fox jumps over the lazy dog. ".repeat(50); // ~2.2KB
const largeText = "x".repeat(100_000); // 100KB

// --- Thread factory ---

function makeThread(eventCount: number): AgentThread {
  const events: AgentEvent[] = [];
  const now = Date.now();
  for (let i = 0; i < eventCount; i++) {
    events.push({
      type: "message",
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message number ${i}. `.repeat(10),
      timestamp: now + i,
      iteration: Math.floor(i / 2),
    });
  }
  return {
    id: "bench-thread",
    events,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

// --- estimateTokens benchmarks ---

describe("estimateTokens", () => {
  bench("short (13 chars)", () => {
    estimateTokens(shortText);
  });

  bench("medium (~2KB)", () => {
    estimateTokens(mediumText);
  });

  bench("large (100KB)", () => {
    estimateTokens(largeText);
  });
});

// --- ContextManager.estimateThreadTokens benchmarks ---

const thread10 = makeThread(10);
const thread100 = makeThread(100);
const thread500 = makeThread(500);

const cm = new ContextManager();

describe("ContextManager.estimateThreadTokens", () => {
  bench("10 events", () => {
    cm.estimateThreadTokens(thread10);
  });

  bench("100 events", () => {
    cm.estimateThreadTokens(thread100);
  });

  bench("500 events", () => {
    cm.estimateThreadTokens(thread500);
  });
});

// --- ContextManager.needsSummarization benchmarks ---

// Low threshold: will trigger early (measures early-exit benefit)
const cmLow = new ContextManager({ maxContextTokens: 500 });
// High threshold: won't trigger (must scan all events)
const cmHigh = new ContextManager({ maxContextTokens: 10_000_000 });

describe("ContextManager.needsSummarization", () => {
  bench("100 events, low threshold (early exit)", () => {
    cmLow.needsSummarization(thread100);
  });

  bench("100 events, high threshold (full scan)", () => {
    cmHigh.needsSummarization(thread100);
  });

  bench("500 events, low threshold (early exit)", () => {
    cmLow.needsSummarization(thread500);
  });

  bench("500 events, high threshold (full scan)", () => {
    cmHigh.needsSummarization(thread500);
  });
});
