import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { config } from "dotenv";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createClaudeAgentSdkProvider } from "../src/providers/claude-agent-sdk.js";
import { createDeepFactorAgent } from "../src/create-agent.js";
import { maxIterations } from "../src/stop-conditions.js";

// Load .env from repo root (vitest doesn't auto-load it)
config({ path: "../../.env" });

// Guard: skip unless claude CLI is authenticated
let IS_AUTHED = false;
try {
  const status = JSON.parse(execSync("claude auth status", { encoding: "utf8", timeout: 5000 }));
  IS_AUTHED = status.loggedIn === true;
} catch {
  IS_AUTHED = false;
}

// Env vars set by Claude Code that block nested sessions or override auth
const CLAUDE_SESSION_VARS = [
  "CLAUDECODE",
  "CLAUDE_CODE_SSE_PORT",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_OAUTH_TOKEN",
] as const;

describe.runIf(IS_AUTHED)("Smoke: Claude Agent SDK (live)", () => {
  const TIMEOUT = 30_000;
  const MODEL = "claude-sonnet-4-20250514";

  // Strip env vars that prevent the SDK subprocess from starting cleanly
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of CLAUDE_SESSION_VARS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterAll(() => {
    for (const key of CLAUDE_SESSION_VARS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      }
    }
  });

  const addTool = tool(async (args: { a: number; b: number }) => String(args.a + args.b), {
    name: "add",
    description: "Add two numbers together",
    schema: z.object({ a: z.number(), b: z.number() }),
  });

  it(
    "text-only response",
    async () => {
      const provider = createClaudeAgentSdkProvider({ model: MODEL, timeout: TIMEOUT });
      const agent = createDeepFactorAgent({
        model: provider,
        stopWhen: [maxIterations(1)],
        middleware: [],
      });

      const result = await agent.loop("Reply with exactly: hello");

      expect(result.response).toBeTruthy();
      expect(typeof result.response).toBe("string");
      expect(result.response!.toLowerCase()).toContain("hello");
    },
    TIMEOUT,
  );

  it(
    "tool call round-trip",
    async () => {
      // The SDK subprocess recognizes tool_use intent from the system prompt
      // but args may arrive as strings (SDK serialization)
      const provider = createClaudeAgentSdkProvider({ model: MODEL, timeout: TIMEOUT });
      const boundProvider = provider.bindTools!([addTool]);

      const { HumanMessage } = await import("@langchain/core/messages");
      const response = await boundProvider.invoke([
        new HumanMessage("What is 2 + 3? Use the add tool."),
      ]);

      expect(response.tool_calls).toBeDefined();
      expect(response.tool_calls!.length).toBeGreaterThan(0);
      expect(response.tool_calls![0].name).toBe("add");
      // SDK may serialize numbers as strings in tool_use input
      const args = response.tool_calls![0].args;
      expect(Number(args.a)).toBe(2);
      expect(Number(args.b)).toBe(3);
    },
    TIMEOUT,
  );

  it(
    "full agent loop with tool",
    async () => {
      // The SDK subprocess executes custom tools internally but reports
      // "No such tool available" for tools only defined in systemPrompt.
      // The agent loop handles these as errors; verify it runs and produces events.
      const provider = createClaudeAgentSdkProvider({ model: MODEL, timeout: TIMEOUT });
      const agent = createDeepFactorAgent({
        model: provider,
        tools: [addTool],
        stopWhen: [maxIterations(3)],
        middleware: [],
      });

      const result = await agent.loop("What is 2 + 3? Use the add tool.");

      // The agent loop should produce tool_call events even if the SDK
      // can't execute the tool (our agent loop handles execution)
      const toolCalls = result.thread.events.filter((e) => e.type === "tool_call");
      expect(toolCalls.length).toBeGreaterThan(0);
      expect(toolCalls[0].toolName).toBe("add");
    },
    TIMEOUT,
  );
});
