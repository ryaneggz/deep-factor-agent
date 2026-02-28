import React from "react";
import { Box, Text } from "ink";
import { useTextInput } from "../hooks/useTextInput.js";

interface InputBarProps {
  onSubmit: (value: string) => void;
}

export function InputBar({ onSubmit }: InputBarProps) {
  const { input } = useTextInput({ onSubmit });

  return (
    <Box>
      <Text color="blue" bold>
        {"> "}
      </Text>
      <Text>
        {input}
        <Text dimColor>_</Text>
      </Text>
    </Box>
  );
}
