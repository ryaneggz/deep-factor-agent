import React, { useEffect, useRef, useState, useMemo } from "react";
import { Box } from "ink";
import { createClaudeAgentSdkProvider } from "deep-factor-agent";
import type { ModelAdapter } from "deep-factor-agent";
import { useAgent } from "./hooks/useAgent.js";
import { Header } from "./components/Header.js";
import { Content } from "./components/Content.js";
import { Footer } from "./components/Footer.js";
import { bashTool } from "./tools/bash.js";
import type { TuiAppProps, ProviderType } from "./types.js";
import type { AgentTools } from "./types.js";
import { DEFAULT_MODELS } from "./types.js";

function resolveModel(provider: ProviderType, modelId: string): string | ModelAdapter {
  if (provider === "claude-sdk") {
    return createClaudeAgentSdkProvider({ model: modelId });
  }
  return modelId;
}

export function TuiApp({
  prompt,
  model,
  maxIter,
  enableBash,
  parallelToolCalls,
  provider,
}: TuiAppProps) {
  const hasRun = useRef(false);

  const [activeProvider, setActiveProvider] = useState<ProviderType>(provider);
  const [activeModel, setActiveModel] = useState<string>(model);

  const resolvedModel = useMemo(
    () => resolveModel(activeProvider, activeModel),
    [activeProvider, activeModel],
  );

  const tools: AgentTools = enableBash ? [bashTool] : [];

  const {
    messages,
    status,
    usage,
    iterations,
    error,
    sendPrompt,
    submitHumanInput,
    humanInputRequest,
    resetThread,
  } = useAgent({ model: resolvedModel, maxIter, tools, parallelToolCalls });

  // Send initial prompt on mount if provided
  useEffect(() => {
    if (prompt && !hasRun.current) {
      hasRun.current = true;
      sendPrompt(prompt);
    }
  }, [prompt, sendPrompt]);

  const handleSubmit = (value: string) => {
    if (status === "pending_input") {
      submitHumanInput(value);
      return;
    }

    // Parse /provider slash command
    const providerMatch = value.match(/^\/provider\s+(\S+)(?:\s+--model\s+(\S+))?$/);
    if (providerMatch) {
      const newProvider = providerMatch[1] as string;
      if (newProvider !== "langchain" && newProvider !== "claude-sdk") {
        // Invalid provider — ignore silently
        return;
      }
      const newModel = providerMatch[2] ?? DEFAULT_MODELS[newProvider];
      setActiveProvider(newProvider);
      setActiveModel(newModel);
      resetThread();
      return;
    }

    sendPrompt(value);
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Header provider={activeProvider} model={activeModel} status={status} />
      <Content
        messages={messages}
        status={status}
        error={error}
        humanInputRequest={humanInputRequest}
      />
      <Footer usage={usage} iterations={iterations} status={status} onSubmit={handleSubmit} />
    </Box>
  );
}
