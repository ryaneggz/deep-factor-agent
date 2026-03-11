import {
  createDeepFactorAgent,
  maxIterations,
  isPlanResult,
  isPendingResult,
  mapAgentEvent,
  serializeLogEntry,
  nextSequence,
} from "deep-factor-agent";
import type {
  AgentResult,
  PendingResult,
  PlanResult,
  AgentMode,
  AgentExecutionUpdate,
  UnifiedLogEntry,
} from "deep-factor-agent";
import type { MapperContext } from "deep-factor-agent";
import type { SandboxMode } from "./tools/bash.js";
import { createDefaultTools } from "./tools/default-tools.js";
import { resolveProviderModel } from "./provider-resolution.js";
import type { ProviderType } from "./types.js";
import { DEFAULT_TUI_AGENT_INSTRUCTIONS } from "./default-agent-instructions.js";
import { randomUUID } from "node:crypto";

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

function writeUnifiedLine(entry: UnifiedLogEntry): void {
  process.stdout.write(serializeLogEntry(entry) + "\n");
}

export async function runPrintMode(options: PrintModeOptions): Promise<void> {
  const { prompt, provider, model, maxIter, sandbox, mode, outputFormat = "text" } = options;
  const isStreamJson = outputFormat === "stream-json";

  try {
    const tools = createDefaultTools(sandbox);
    const resolvedModel = resolveProviderModel({
      provider,
      model,
      mode,
      liveUpdates: isStreamJson,
    });

    const sessionId = randomUUID();

    const mapperCtx: MapperContext = {
      sessionId,
      sequence: 0,
      currentIteration: 0,
      provider: provider as "langchain" | "claude" | "codex",
      model,
      mode,
    };

    // All entries share the single MapperContext.sequence counter
    function buildEntry<T extends UnifiedLogEntry["type"]>(
      type: T,
      fields: Omit<
        Extract<UnifiedLogEntry, { type: T }>,
        "type" | "sessionId" | "timestamp" | "sequence"
      >,
    ): Extract<UnifiedLogEntry, { type: T }> {
      return {
        type,
        sessionId,
        timestamp: Date.now(),
        sequence: nextSequence(mapperCtx),
        ...fields,
      } as Extract<UnifiedLogEntry, { type: T }>;
    }

    let lastStatusKey: string | undefined;

    const onUpdate = isStreamJson
      ? (update: AgentExecutionUpdate) => {
          const { lastEvent, usage, iterations, status } = update;
          if (lastEvent) {
            for (const entry of mapAgentEvent(lastEvent, mapperCtx)) {
              writeUnifiedLine(entry);
            }
          } else {
            // Deduplicate consecutive identical status-only updates
            const key = `${status}|${iterations}|${usage.inputTokens}|${usage.outputTokens}`;
            if (key === lastStatusKey) return;
            lastStatusKey = key;
            writeUnifiedLine(
              buildEntry("status", {
                status: status as "running" | "pending_input" | "done" | "error",
                usage,
                iterations,
              }),
            );
          }
        }
      : undefined;

    if (isStreamJson) {
      writeUnifiedLine(
        buildEntry("init", {
          provider: provider as "langchain" | "claude" | "codex",
          model,
          mode,
          settings: { maxIter, sandbox },
        }),
      );
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
        writeUnifiedLine(
          buildEntry("error", {
            error: "Agent requested human input in non-interactive print mode.",
            recoverable: false,
          }),
        );
      }
      process.stderr.write("Error: Agent requested human input in non-interactive print mode.\n");
      process.exit(1);
    }

    if (finalResult.stopReason === "max_errors") {
      const detail = finalResult.stopDetail ?? "Agent stopped due to repeated errors";
      if (isStreamJson) {
        writeUnifiedLine(
          buildEntry("error", {
            error: detail,
            recoverable: false,
          }),
        );
      }
      process.stderr.write(`Error: ${detail}\n`);
      process.exit(1);
    }

    const finalText = isPlanResult(finalResult) ? finalResult.plan : finalResult.response;

    if (isStreamJson) {
      writeUnifiedLine(
        buildEntry("result", {
          content: finalText,
          stopReason: finalResult.stopReason,
          usage: finalResult.usage,
          iterations: finalResult.iterations,
        }),
      );
    } else {
      process.stdout.write(finalText);
    }

    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isStreamJson) {
      writeUnifiedLine({
        type: "error",
        sessionId: randomUUID(),
        timestamp: Date.now(),
        sequence: 0,
        error: message,
        recoverable: false,
      } as UnifiedLogEntry);
    }
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}
