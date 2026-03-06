import React from "react";
import { Box, Text } from "ink";
import type { AgentStatus, ProviderType } from "../types.js";

interface HeaderProps {
  provider: ProviderType;
  model: string;
  status: AgentStatus;
}

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "gray",
  running: "yellow",
  done: "green",
  error: "red",
  pending_input: "magenta",
};

export function Header({ provider, model, status }: HeaderProps) {
  return (
    <Box
      flexShrink={0}
      borderStyle="single"
      borderBottom={true}
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
      justifyContent="space-between"
    >
      <Text bold>Deep Factor TUI</Text>
      <Box gap={2}>
        <Text dimColor>
          Provider: {provider} | Model: {model}
        </Text>
        <Text color={STATUS_COLORS[status]}>● {status}</Text>
      </Box>
    </Box>
  );
}
