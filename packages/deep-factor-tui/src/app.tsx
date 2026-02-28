import React, { useEffect, useRef } from "react";
import { Box } from "ink";
import { useScreenSize } from "fullscreen-ink";
import { useAgent } from "./hooks/useAgent.js";
import { Header } from "./components/Header.js";
import { Content } from "./components/Content.js";
import { Footer } from "./components/Footer.js";
import { bashTool } from "./tools/bash.js";
import type { TuiAppProps } from "./types.js";
import type { AgentTools } from "./types.js";

const HEADER_HEIGHT = 2;
const FOOTER_HEIGHT = 3;

export function TuiApp({ prompt, model, maxIter, enableBash, parallelToolCalls }: TuiAppProps) {
  const { height } = useScreenSize();
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

  const contentHeight = Math.max(1, height - HEADER_HEIGHT - FOOTER_HEIGHT);

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
    <Box flexDirection="column" height={height}>
      <Header model={model} status={status} />
      <Content
        messages={messages}
        status={status}
        error={error}
        humanInputRequest={humanInputRequest}
        height={contentHeight}
      />
      <Footer usage={usage} iterations={iterations} status={status} onSubmit={handleSubmit} />
    </Box>
  );
}
