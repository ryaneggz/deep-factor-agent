import { execSync } from "node:child_process";
import { tool } from "@langchain/core/tools";
import { config } from "dotenv";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDeepFactorAgent } from "../../src/create-agent.js";
import { createClaudeAgentSdkProvider } from "../../src/providers/claude-agent-sdk.js";
import { maxIterations } from "../../src/stop-conditions.js";

config({ path: "../../.env" });

let isAuthed = false;
try {
  const status = JSON.parse(execSync("claude auth status", { encoding: "utf8", timeout: 5000 }));
  isAuthed = status.loggedIn === true;
} catch {
  isAuthed = false;
}

const CLAUDE_SESSION_VARS = [
  "CLAUDECODE",
  "CLAUDE_CODE_SSE_PORT",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_OAUTH_TOKEN",
] as const;

describe.runIf(isAuthed)("Smoke: Claude Agent SDK (live)", () => {
  const timeoutMs = 30_000;
  const model = "claude-sonnet-4-6";
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
    "handles a text-only response",
    async () => {
      const agent = createDeepFactorAgent({
        model: createClaudeAgentSdkProvider({ model, timeout: timeoutMs }),
        stopWhen: [maxIterations(1)],
        middleware: [],
      });

      const result = await agent.loop("Reply with exactly: hello");

      expect(result.response.toLowerCase()).toContain("hello");
    },
    timeoutMs,
  );

  it(
    "round-trips a tool request",
    async () => {
      const provider = createClaudeAgentSdkProvider({ model, timeout: timeoutMs }).bindTools?.([
        addTool,
      ]);
      const { HumanMessage } = await import("@langchain/core/messages");
      const response = await provider?.invoke([
        new HumanMessage("What is 2 + 3? Use the add tool."),
      ]);

      expect(response?.tool_calls?.length).toBeGreaterThan(0);
      expect(response?.tool_calls?.[0]?.name).toBe("add");
    },
    timeoutMs,
  );
});
