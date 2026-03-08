import React from "react";
import { Box, Text } from "ink";
import { useTextInput } from "../hooks/useTextInput.js";

interface InputBarProps {
  onSubmit: (value: string) => void;
  onHotkeyMenu?: () => void;
  onEscape?: () => void;
}

export function InputBar({ onSubmit, onHotkeyMenu, onEscape }: InputBarProps) {
  const { input } = useTextInput({ onSubmit, onHotkeyMenu, onEscape });
  const lines = input.split("\n");

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor="blue"
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
      >
        {lines.map((line, i) => (
          <Box key={i}>
            <Text color="blue" bold>
              {i === 0 ? "> " : "  "}
            </Text>
            <Text>
              {line}
              {i === lines.length - 1 && <Text dimColor>_</Text>}
            </Text>
          </Box>
        ))}
      </Box>
      <Text dimColor> Alt+Enter for newline | Ctrl+/ for shortcuts</Text>
    </Box>
  );
}
