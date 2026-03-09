import { isPlanResult } from "deep-factor-agent";
import type { AgentMode } from "deep-factor-agent";
import type { SandboxMode } from "./tools/bash.js";
import { runHeadlessAgentToCompletion } from "./agent-runner.js";
import type { ProviderType } from "./types.js";

export interface PrintModeOptions {
  prompt: string;
  provider: ProviderType;
  model: string;
  maxIter: number;
  sandbox: SandboxMode;
  mode: AgentMode;
}

export async function runPrintMode(options: PrintModeOptions): Promise<void> {
  const { prompt, provider, model, maxIter, sandbox, mode } = options;

  try {
    const finalResult = await runHeadlessAgentToCompletion({
      prompt,
      provider,
      model,
      maxIter,
      sandbox,
      mode,
    });

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
