import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
}

export function PromptInput({ onSubmit }: PromptInputProps) {
  const [input, setInput] = useState("");

  useInput((inputChar, key) => {
    if (key.return) {
      if (input.trim().length > 0) {
        onSubmit(input.trim());
        setInput("");
      }
      return;
    }
    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }
    if (!key.ctrl && !key.meta && inputChar) {
      setInput((prev) => prev + inputChar);
    }
  });

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
