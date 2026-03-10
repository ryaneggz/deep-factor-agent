import React from "react";
import { Box, Text } from "ink";
import type { AgentMode, TokenUsage } from "deep-factor-agent";
import type { AgentStatus } from "../types.js";

interface StatusLineProps {
  mode: AgentMode;
  usage: TokenUsage;
  iterations: number;
  status: AgentStatus;
  canCycleMode: boolean;
}

function formatModeLabel(mode: AgentMode): string {
  switch (mode) {
    case "plan":
      return "plan mode";
    case "approve":
      return "approvals required";
    case "yolo":
      return "bypass permissions";
  }
}

function formatStatusLabel(status: AgentStatus): string {
  if (status === "pending_input") {
    return "pending input";
  }

  return status;
}

export function StatusLine({ mode, usage, iterations, status, canCycleMode }: StatusLineProps) {
  const showSecondary = status !== "idle" || usage.totalTokens > 0 || iterations > 0;
  const modeText = `• ${formatModeLabel(mode)}${canCycleMode ? " (shift+tab to cycle)" : ""}`;
  const statusParts = [formatStatusLabel(status)];
  if (usage.totalTokens > 0) {
    statusParts.push(`${usage.totalTokens} tok`);
  }
  if (iterations > 0) {
    statusParts.push(`${iterations} iter`);
  }

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text dimColor>{modeText}</Text>
        <Text dimColor>Ctrl+/ shortcuts</Text>
      </Box>
      {showSecondary && <Text dimColor>{statusParts.join(" · ")}</Text>}
    </Box>
  );
}
