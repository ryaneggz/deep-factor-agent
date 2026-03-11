import {
  createDeepFactorAgent,
  maxIterations,
  isPlanResult,
  isPendingResult,
} from "deep-factor-agent";
import type {
  AgentResult,
  PendingResult,
  PlanResult,
  AgentMode,
  AgentExecutionUpdate,
} from "deep-factor-agent";
import type { SandboxMode } from "./tools/bash.js";
import { createDefaultTools } from "./tools/default-tools.js";
import { resolveProviderModel } from "./provider-resolution.js";
import type { ProviderType } from "./types.js";
import { DEFAULT_TUI_AGENT_INSTRUCTIONS } from "./default-agent-instructions.js";

export type OutputFormat = "text" | "stream-json";

export interface PrintModeOptions {
  prompt: string;
  provider: ProviderType;
  model: string;
  maxIter: number;
  sandbox: SandboxMode;
  mode: AgentMode;
  outputFormat?: OutputFormat;
}

function writeJsonLine(data: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(data) + "\n");
}

export async function runPrintMode(options: PrintModeOptions): Promise<void> {
  const { prompt, provider, model, maxIter, sandbox, mode, outputFormat = "text" } = options;
  const isStreamJson = outputFormat === "stream-json";

  try {
    const tools = createDefaultTools(sandbox);
    const resolvedModel = resolveProviderModel({ provider, model, mode });

    const onUpdate = isStreamJson
      ? (update: AgentExecutionUpdate) => {
          const { lastEvent, usage, iterations, status, stopReason } = update;
          if (lastEvent) {
            writeJsonLine({
              type: "event",
              event: lastEvent,
              usage,
              iterations,
              status,
              ...(stopReason ? { stopReason } : {}),
            });
          } else {
            writeJsonLine({ type: "status", usage, iterations, status });
          }
        }
      : undefined;

    if (isStreamJson) {
      writeJsonLine({
        type: "init",
        provider,
        model,
        mode,
        maxIter,
        sandbox,
        timestamp: Date.now(),
      });
    }

    const agent = createDeepFactorAgent({
      model: resolvedModel,
      tools,
      instructions: DEFAULT_TUI_AGENT_INSTRUCTIONS,
      stopWhen: [maxIterations(maxIter)],
      interruptOn: [],
      parallelToolCalls: true,
      mode,
      ...(isStreamJson ? { streamMode: "updates" as const, onUpdate } : {}),
    });

    const result: AgentResult | PendingResult | PlanResult = await agent.loop(prompt);

    // Plan mode now returns PendingResult — auto-approve in non-interactive print mode
    let finalResult: AgentResult | PendingResult | PlanResult = result;
    if (isPendingResult(finalResult) && mode === "plan") {
      finalResult = await finalResult.resume({ decision: "approve" });
    }

    if (finalResult.stopReason === "human_input_needed") {
      if (isStreamJson) {
        writeJsonLine({
          type: "error",
          error: "Agent requested human input in non-interactive print mode.",
        });
      }
      process.stderr.write("Error: Agent requested human input in non-interactive print mode.\n");
      process.exit(1);
    }

    if (finalResult.stopReason === "max_errors") {
      const detail = finalResult.stopDetail ?? "Agent stopped due to repeated errors";
      if (isStreamJson) {
        writeJsonLine({ type: "error", error: detail });
      }
      process.stderr.write(`Error: ${detail}\n`);
      process.exit(1);
    }

    const finalText = isPlanResult(finalResult) ? finalResult.plan : finalResult.response;

    if (isStreamJson) {
      writeJsonLine({
        type: "result",
        content: finalText,
        stopReason: finalResult.stopReason,
        usage: finalResult.usage,
        iterations: finalResult.iterations,
      });
    } else {
      process.stdout.write(finalText);
    }

    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isStreamJson) {
      writeJsonLine({ type: "error", error: message });
    }
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}
