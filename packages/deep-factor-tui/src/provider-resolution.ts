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
    // Note: reasoning_effort is NOT passed by default because it's
    // incompatible with function tools on /v1/chat/completions for
    // reasoning models (gpt-5.4, o3, etc). The model still reasons
    // internally — the parameter just can't be combined with tools.
    return createOpenAIProvider({ model });
  }

  // "langchain" — return string model ID for lazy LangChain resolution
  return model;
}
