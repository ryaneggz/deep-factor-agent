import { createClaudeCliProvider } from "deep-factor-agent";
import type { DeepFactorAgentSettings } from "deep-factor-agent";
import type { ProviderType } from "./types.js";

export function resolveProviderModel(args: {
  provider: ProviderType;
  model: string;
}): DeepFactorAgentSettings["model"] {
  const { provider, model } = args;
  return provider === "claude" ? createClaudeCliProvider({ model }) : model;
}
