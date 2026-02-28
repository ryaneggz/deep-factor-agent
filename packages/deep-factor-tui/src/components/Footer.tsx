import React from "react";
import { Box } from "ink";
import { StatusLine } from "./StatusLine.js";
import { InputBar } from "./InputBar.js";
import type { TokenUsage } from "deep-factor-agent";
import type { AgentStatus } from "../types.js";

interface FooterProps {
  usage: TokenUsage;
  iterations: number;
  status: AgentStatus;
  onSubmit: (value: string) => void;
}

export function Footer({ usage, iterations, status, onSubmit }: FooterProps) {
  const showInput = status === "idle" || status === "done" || status === "pending_input";

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderTop={true}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      <StatusLine usage={usage} iterations={iterations} status={status} />
      {showInput && <InputBar onSubmit={onSubmit} />}
    </Box>
  );
}
