import React from "react";
import { Text } from "ink";
import { formatToolLabel } from "../transcript.js";

interface ToolCallBlockProps {
  toolName: string;
  toolArgs?: Record<string, unknown>;
}

export function ToolCallBlock({ toolName, toolArgs }: ToolCallBlockProps) {
  return (
    <Text>
      <Text bold>{formatToolLabel(toolName, toolArgs)}</Text>
    </Text>
  );
}
