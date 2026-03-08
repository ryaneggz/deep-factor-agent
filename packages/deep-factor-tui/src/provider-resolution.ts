import { createClaudeCliProvider } from "deep-factor-agent";
import type { DeepFactorAgentSettings } from "deep-factor-agent";
import type { AgentMode } from "deep-factor-agent";
import type { ProviderType } from "./types.js";

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
}): DeepFactorAgentSettings["model"] {
  const { provider, model, mode, liveUpdates = false } = args;
  return provider === "claude"
    ? createClaudeCliProvider({
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
      })
    : model;
}
