import React, { useState, useRef } from "react";
import { Box, Text, useInput } from "ink";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
}

export function PromptInput({ onSubmit }: PromptInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef(input);

  useInput((inputChar, key) => {
    if (key.return) {
      const current = inputRef.current.trim();
      if (current.length > 0) {
        onSubmit(current);
        inputRef.current = "";
        setInput("");
      }
      return;
    }
    if (key.backspace || key.delete) {
      const next = inputRef.current.slice(0, -1);
      inputRef.current = next;
      setInput(next);
      return;
    }
    if (!key.ctrl && !key.meta && inputChar) {
      const next = inputRef.current + inputChar;
      inputRef.current = next;
      setInput(next);
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
