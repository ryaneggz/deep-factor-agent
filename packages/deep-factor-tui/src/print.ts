import { createDeepFactorAgent, maxIterations } from "deep-factor-agent";
import type { AgentResult, PendingResult } from "deep-factor-agent";
import { createBashTool, type SandboxMode } from "./tools/bash.js";

export interface PrintModeOptions {
  prompt: string;
  model: string;
  maxIter: number;
  sandbox: SandboxMode;
}

export async function runPrintMode(options: PrintModeOptions): Promise<void> {
  const { prompt, model, maxIter, sandbox } = options;

  try {
    const tools = [createBashTool(sandbox)];

    const agent = createDeepFactorAgent({
      model,
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
