import React from "react";
import { Box, Text } from "ink";
import { useTextInput } from "../hooks/useTextInput.js";

interface InputBarProps {
  onSubmit: (value: string) => void;
  onHotkeyMenu?: () => void;
  onEscape?: () => void;
  isActive?: boolean;
  placeholder?: string;
  hint?: string;
  borderColor?: string;
  onKeyPress?: (
    inputChar: string,
    key: {
      return?: boolean;
      meta?: boolean;
      escape?: boolean;
      backspace?: boolean;
      delete?: boolean;
      ctrl?: boolean;
    },
    currentValue: string,
  ) => boolean | void;
}

export function InputBar({
  onSubmit,
  onHotkeyMenu,
  onEscape,
  isActive = true,
  placeholder,
  hint = "Alt+Enter for newline | Ctrl+/ for shortcuts",
  borderColor = "blue",
  onKeyPress,
}: InputBarProps) {
  const { input } = useTextInput({
    onSubmit,
    onHotkeyMenu,
    onEscape,
    isActive,
    onKeyPress,
  });
  const lines = input.split("\n");

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={borderColor}
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
      >
        {lines.map((line, i) => (
          <Box key={i}>
            <Text color={borderColor} bold>
              {i === 0 ? "> " : "  "}
            </Text>
            <Text>
              {line.length > 0 ? (
                line
              ) : i === 0 && placeholder ? (
                <Text dimColor>{placeholder}</Text>
              ) : (
                ""
              )}
              {i === lines.length - 1 && <Text dimColor>_</Text>}
            </Text>
          </Box>
        ))}
      </Box>
      <Text dimColor> {hint}</Text>
    </Box>
  );
}
