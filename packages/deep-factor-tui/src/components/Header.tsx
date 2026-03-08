import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  model: string;
}

export function Header({ model }: HeaderProps) {
  return (
    <Box gap={2}>
      <Text bold>Deep Factor TUI</Text>
      <Text dimColor>Model: {model}</Text>
    </Box>
  );
}
