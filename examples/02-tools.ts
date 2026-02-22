/**
 * 02-tools.ts — Agent with LangChain tools
 *
 * Defines two tools (calculator and weather lookup) and lets the
 * agent decide which to call based on the user prompt.
 */
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { createDeepFactorAgent } from "../dist/index.js";
import { MODEL_ID } from "./env.js";

// Tool 1: Calculator
const calculator = tool(
  async ({ expression }: { expression: string }) => {
    try {
      // Simple eval for demo purposes — use a real math parser in production
      const result = Function(`"use strict"; return (${expression})`)();
      return `Result: ${result}`;
    } catch {
      return `Error: Could not evaluate "${expression}"`;
    }
  },
  {
    name: "calculator",
    description: "Evaluate a mathematical expression. Example: '2 + 2', 'Math.sqrt(144)'",
    schema: z.object({
      expression: z.string().describe("The math expression to evaluate"),
    }),
  },
);

// Tool 2: Weather (mock)
const getWeather = tool(
  async ({ city }: { city: string }) => {
    // Simulated weather data
    const forecasts: Record<string, string> = {
      "new york": "72°F, Partly Cloudy",
      london: "58°F, Rainy",
      tokyo: "80°F, Sunny",
    };
    const weather = forecasts[city.toLowerCase()] ?? "65°F, Clear skies";
    return `Weather in ${city}: ${weather}`;
  },
  {
    name: "get_weather",
    description: "Get the current weather for a city",
    schema: z.object({
      city: z.string().describe("The city name"),
    }),
  },
);

async function main() {
  const agent = createDeepFactorAgent({
    model: MODEL_ID,
    tools: [calculator, getWeather],
    instructions:
      "You are a helpful assistant with access to a calculator and weather lookup. Use the tools when appropriate.",
    middleware: [],
  });

  console.log("--- Running agent with tools ---\n");

  const result = await agent.loop(
    "What is 47 * 89? Also, what's the weather like in Tokyo?",
  );

  console.log("Response:\n", result.response);
  console.log("\n--- Result Summary ---");
  console.log("Iterations:", result.iterations);
  console.log("Stop reason:", result.stopReason);
  console.log("Tokens used:", result.usage.totalTokens);

  // Show tool calls from the thread events
  const toolCalls = result.thread.events.filter((e) => e.type === "tool_call");
  console.log("Tool calls made:", toolCalls.length);
  for (const tc of toolCalls) {
    if (tc.type === "tool_call") {
      console.log(`  - ${tc.toolName}(${JSON.stringify(tc.args)})`);
    }
  }
}

main().catch(console.error);
