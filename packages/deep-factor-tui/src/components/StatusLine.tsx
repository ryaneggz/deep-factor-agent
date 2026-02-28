import React from "react";
import { Box, Text } from "ink";
import type { TokenUsage } from "deep-factor-agent";
import type { AgentStatus } from "../types.js";

interface StatusLineProps {
  usage: TokenUsage;
  iterations: number;
  status: AgentStatus;
}

export function StatusLine({ usage, iterations, status }: StatusLineProps) {
  return (
    <Box gap={2}>
      <Text dimColor>
        Tokens: {usage.totalTokens} (in: {usage.inputTokens} / out: {usage.outputTokens})
      </Text>
      <Text dimColor>Iterations: {iterations}</Text>
      <Text dimColor>Status: {status}</Text>
    </Box>
  );
}
