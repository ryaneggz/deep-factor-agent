import React from "react";
import { Box, Text } from "ink";
import { useTextInput } from "../hooks/useTextInput.js";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
}

export function PromptInput({ onSubmit }: PromptInputProps) {
  const { input } = useTextInput({ onSubmit });

  return (
    <Box>
      <Text color="blue">{"> "}</Text>
      <Text>
        {input}
        <Text dimColor>_</Text>
      </Text>
    </Box>
  );
}
