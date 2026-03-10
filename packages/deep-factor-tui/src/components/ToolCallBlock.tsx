import React from "react";
import { Text } from "ink";
import type { ToolDisplayMetadata } from "deep-factor-agent";
import { formatToolLabel } from "../transcript.js";

interface ToolCallBlockProps {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  toolDisplay?: ToolDisplayMetadata;
}

export function ToolCallBlock({ toolName, toolArgs, toolDisplay }: ToolCallBlockProps) {
  return (
    <Text>
      <Text bold>{formatToolLabel(toolName, toolArgs, toolDisplay)}</Text>
    </Text>
  );
}
