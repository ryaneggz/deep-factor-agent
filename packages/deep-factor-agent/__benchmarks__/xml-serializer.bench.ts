import { bench, describe } from "vitest";
import { escapeXml, serializeThreadToXml } from "../src/xml-serializer.js";
import type { AgentEvent } from "../src/types.js";

// --- Test inputs for escapeXml ---

const smallInput = `Hello <world> & "goodbye" it's ok`; // 36 chars, has all 5 special chars
const mediumInput = smallInput.repeat(30); // ~1KB
const largeInput = smallInput.repeat(300); // ~10KB
const hugeInput = smallInput.repeat(3000); // ~100KB
const plainInput = "a".repeat(1000); // no special chars

// --- Helper to generate events ---

function makeEvents(count: number): AgentEvent[] {
  const events: AgentEvent[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const iteration = Math.floor(i / 3);
    const mod = i % 3;
    if (mod === 0) {
      events.push({
        type: "message",
        role: "user",
        content: `User message ${i} with <special> & "chars"`,
        timestamp: now + i,
        iteration,
      });
    } else if (mod === 1) {
      events.push({
        type: "tool_call",
        toolName: `tool_${i}`,
        toolCallId: `tc_${i}`,
        args: { query: `search for <item> #${i}` },
        timestamp: now + i,
        iteration,
      });
    } else {
      events.push({
        type: "tool_result",
        toolCallId: `tc_${i - 1}`,
        result: `Result for item ${i} with & ampersand`,
        durationMs: 100 + i,
        timestamp: now + i,
        iteration,
      });
    }
  }
  return events;
}

// --- escapeXml benchmarks ---

describe("escapeXml", () => {
  bench("small (36 chars, has specials)", () => {
    escapeXml(smallInput);
  });

  bench("medium (~1KB, has specials)", () => {
    escapeXml(mediumInput);
  });

  bench("large (~10KB, has specials)", () => {
    escapeXml(largeInput);
  });

  bench("huge (~100KB, has specials)", () => {
    escapeXml(hugeInput);
  });

  bench("plain (~1KB, no specials)", () => {
    escapeXml(plainInput);
  });
});

// --- serializeThreadToXml benchmarks ---

const events10 = makeEvents(10);
const events50 = makeEvents(50);
const events200 = makeEvents(200);

describe("serializeThreadToXml", () => {
  bench("10 events", () => {
    serializeThreadToXml(events10);
  });

  bench("50 events", () => {
    serializeThreadToXml(events50);
  });

  bench("200 events", () => {
    serializeThreadToXml(events200);
  });
});
