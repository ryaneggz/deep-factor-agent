import React from "react";
import { Box, Text } from "ink";
import type { TokenUsage } from "deep-factor-agent";
import type { AgentStatus } from "../types.js";

interface StatusBarProps {
  usage: TokenUsage;
  iterations: number;
  status: AgentStatus;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "gray",
  running: "yellow",
  done: "green",
  error: "red",
  pending_input: "cyan",
};

export function StatusBar({ usage, iterations, status }: StatusBarProps) {
  const color = STATUS_COLORS[status];

  return (
    <Box flexDirection="column">
      <Text dimColor>{"─".repeat(50)}</Text>
      <Text>
        {"Tokens: "}
        {fmt(usage.inputTokens)} in / {fmt(usage.outputTokens)} out (
        {fmt(usage.totalTokens)} total) | Iterations: {iterations} | Status:{" "}
        <Text color={color}>{status}</Text>
      </Text>
    </Box>
  );
}
