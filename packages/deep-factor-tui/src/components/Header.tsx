import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  provider: string;
  model: string;
}

export function Header({ provider, model }: HeaderProps) {
  return (
    <Box gap={2}>
      <Text bold>Deep Factor TUI</Text>
      <Text dimColor>
        Provider: {provider} | Model: {model}
      </Text>
    </Box>
  );
}
