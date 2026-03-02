import React, { useEffect, useRef } from "react";
import { Box } from "ink";
import { useAgent } from "./hooks/useAgent.js";
import { Header } from "./components/Header.js";
import { Content } from "./components/Content.js";
import { Footer } from "./components/Footer.js";
import { bashTool } from "./tools/bash.js";
import type { TuiAppProps } from "./types.js";
import type { AgentTools } from "./types.js";

export function TuiApp({ prompt, model, maxIter, enableBash, parallelToolCalls }: TuiAppProps) {
  const hasRun = useRef(false);

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
  } = useAgent({ model, maxIter, tools, parallelToolCalls });

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
    } else {
      sendPrompt(value);
    }
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Header model={model} status={status} />
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
