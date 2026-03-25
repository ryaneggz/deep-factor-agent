import { createAnthropicProvider, createOpenAIProvider } from "deep-factor-agent";
import type { DeepFactorAgentSettings } from "deep-factor-agent";
import type { ProviderType } from "./types.js";

export function resolveProviderModel(args: {
  provider: ProviderType;
  model: string;
}): DeepFactorAgentSettings["model"] {
  const { provider, model } = args;

  if (provider === "anthropic") {
    return createAnthropicProvider({
      model,
      thinking: { type: "enabled", budget_tokens: 10000 },
    });
  }

  if (provider === "openai") {
    return createOpenAIProvider({ model, reasoningEffort: "high" });
  }

  // "langchain" — return string model ID for lazy LangChain resolution
  return model;
}
