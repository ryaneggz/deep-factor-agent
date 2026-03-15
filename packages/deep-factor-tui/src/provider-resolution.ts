import {
  createClaudeCliProvider,
  createCodexCliProvider,
  createRuskaApiProvider,
} from "deep-factor-agent";
import type { DeepFactorAgentSettings } from "deep-factor-agent";
import type { AgentMode } from "deep-factor-agent";
import type { ProviderType, RuskaCliOptions } from "./types.js";

type ClaudePermissionMode =
  | "acceptEdits"
  | "bypassPermissions"
  | "default"
  | "dontAsk"
  | "plan"
  | "auto";

export function resolveClaudePermissionMode(mode: AgentMode | undefined): ClaudePermissionMode {
  switch (mode ?? "yolo") {
    case "plan":
      return "plan";
    case "approve":
      return "acceptEdits";
    case "yolo":
      return "bypassPermissions";
  }
}

export function resolveProviderModel(args: {
  provider: ProviderType;
  model: string;
  mode?: AgentMode;
  liveUpdates?: boolean;
  ruska?: RuskaCliOptions;
}): DeepFactorAgentSettings["model"] {
  const { provider, model, mode, liveUpdates = false, ruska } = args;
  if (provider === "claude") {
    return createClaudeCliProvider({
      model,
      permissionMode: resolveClaudePermissionMode(mode),
      disableBuiltInTools: true,
      ...(liveUpdates
        ? {
            outputFormat: "stream-json" as const,
            verbose: true,
            includePartialMessages: true,
          }
        : {}),
    });
  }

  if (provider === "codex") {
    return createCodexCliProvider({
      model,
      outputFormat: liveUpdates ? "jsonl" : "text",
      sandbox: "read-only",
      skipGitRepoCheck: true,
    });
  }

  if (provider === "ruska" && ruska) {
    return createRuskaApiProvider({
      baseUrl: ruska.ruskaUrl,
      model,
      apiKey: ruska.ruskaKey,
      bearerToken: ruska.ruskaToken,
      graphId: ruska.ruskaGraph,
    });
  }

  return model;
}
