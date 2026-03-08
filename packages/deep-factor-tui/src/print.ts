import {
  createDeepFactorAgent,
  maxIterations,
  isPlanResult,
  isPendingResult,
} from "deep-factor-agent";
import type { AgentResult, PendingResult, PlanResult, AgentMode } from "deep-factor-agent";
import { createBashTool, type SandboxMode } from "./tools/bash.js";

export interface PrintModeOptions {
  prompt: string;
  model: string;
  maxIter: number;
  sandbox: SandboxMode;
  mode: AgentMode;
}

export async function runPrintMode(options: PrintModeOptions): Promise<void> {
  const { prompt, model, maxIter, sandbox, mode } = options;

  try {
    const tools = [createBashTool(sandbox)];

    const agent = createDeepFactorAgent({
      model,
      tools,
      stopWhen: [maxIterations(maxIter)],
      interruptOn: [],
      parallelToolCalls: true,
      mode,
    });

    const result: AgentResult | PendingResult | PlanResult = await agent.loop(prompt);

    // Plan mode now returns PendingResult — auto-approve in non-interactive print mode
    let finalResult: AgentResult | PendingResult | PlanResult = result;
    if (isPendingResult(finalResult) && mode === "plan") {
      finalResult = await finalResult.resume({ decision: "approve" });
    }

    if (finalResult.stopReason === "human_input_needed") {
      process.stderr.write("Error: Agent requested human input in non-interactive print mode.\n");
      process.exit(1);
    }

    if (finalResult.stopReason === "max_errors") {
      const detail = finalResult.stopDetail ?? "Agent stopped due to repeated errors";
      process.stderr.write(`Error: ${detail}\n`);
      process.exit(1);
    }

    process.stdout.write(isPlanResult(finalResult) ? finalResult.plan : finalResult.response);
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}
