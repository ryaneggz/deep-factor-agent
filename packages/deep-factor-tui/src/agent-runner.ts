import { createDeepFactorAgent, isPendingResult, maxIterations } from "deep-factor-agent";
import type { AgentMode, AgentResult, PendingResult, PlanResult } from "deep-factor-agent";
import { createBashTool, type SandboxMode } from "./tools/bash.js";
import { resolveProviderModel } from "./provider-resolution.js";
import type { ProviderType } from "./types.js";

export interface HeadlessAgentRunOptions {
  prompt: string;
  provider: ProviderType;
  model: string;
  maxIter: number;
  sandbox: SandboxMode;
  mode: AgentMode;
  cwd?: string;
}

type HeadlessAgentResult = AgentResult | PendingResult | PlanResult;

async function withWorkingDirectory<T>(cwd: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!cwd || cwd === process.cwd()) {
    return fn();
  }

  const originalCwd = process.cwd();
  process.chdir(cwd);

  try {
    return await fn();
  } finally {
    process.chdir(originalCwd);
  }
}

export async function runHeadlessAgent(
  options: HeadlessAgentRunOptions,
): Promise<HeadlessAgentResult> {
  const { prompt, provider, model, maxIter, sandbox, mode, cwd } = options;

  return withWorkingDirectory(cwd, async () => {
    const tools = [createBashTool(sandbox)];
    const resolvedModel = resolveProviderModel({ provider, model, mode });

    const agent = createDeepFactorAgent({
      model: resolvedModel,
      tools,
      stopWhen: [maxIterations(maxIter)],
      interruptOn: [],
      parallelToolCalls: true,
      mode,
    });

    return agent.loop(prompt);
  });
}

export async function runHeadlessAgentToCompletion(
  options: HeadlessAgentRunOptions,
): Promise<HeadlessAgentResult> {
  const result = await runHeadlessAgent(options);

  if (isPendingResult(result) && options.mode === "plan") {
    return result.resume({ decision: "approve" });
  }

  return result;
}
