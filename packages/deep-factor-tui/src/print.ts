import {
  createDeepFactorAgent,
  maxIterations,
  createClaudeAgentSdkProvider,
} from "deep-factor-agent";
import type { AgentResult, PendingResult } from "deep-factor-agent";
import { bashTool } from "./tools/bash.js";
import type { ProviderType } from "./types.js";

export interface PrintModeOptions {
  prompt: string;
  model: string;
  maxIter: number;
  sandbox: boolean;
  provider: ProviderType;
}

export async function runPrintMode(options: PrintModeOptions): Promise<void> {
  const { prompt, model, maxIter, sandbox, provider } = options;

  try {
    const tools = sandbox ? [bashTool] : [];

    const resolvedModel =
      provider === "claude-sdk" ? createClaudeAgentSdkProvider({ model }) : model;

    const agent = createDeepFactorAgent({
      model: resolvedModel,
      tools,
      stopWhen: [maxIterations(maxIter)],
      interruptOn: [],
      parallelToolCalls: true,
    });

    const result: AgentResult | PendingResult = await agent.loop(prompt);

    if (result.stopReason === "human_input_needed") {
      process.stderr.write("Error: Agent requested human input in non-interactive print mode.\n");
      process.exit(1);
    }

    if (result.stopReason === "max_errors") {
      const detail = result.stopDetail ?? "Agent stopped due to repeated errors";
      process.stderr.write(`Error: ${detail}\n`);
      process.exit(1);
    }

    process.stdout.write(result.response);
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}
