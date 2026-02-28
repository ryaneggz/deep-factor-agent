import React from "react";
import { Box, Text } from "ink";

interface ToolCallBlockProps {
  toolName: string;
  toolArgs?: Record<string, unknown>;
}

const MAX_ARGS_LENGTH = 120;

export function ToolCallBlock({ toolName, toolArgs }: ToolCallBlockProps) {
  let argsStr = "";
  if (toolArgs) {
    argsStr = JSON.stringify(toolArgs);
    if (argsStr.length > MAX_ARGS_LENGTH) {
      argsStr = argsStr.slice(0, MAX_ARGS_LENGTH) + "...";
    }
  }

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color="yellow">
          Tool: {toolName}
        </Text>
      </Text>
      {argsStr && <Text dimColor>{argsStr}</Text>}
    </Box>
  );
}
