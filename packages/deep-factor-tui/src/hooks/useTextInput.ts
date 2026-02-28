import { useState, useRef } from "react";
import { useInput } from "ink";

interface UseTextInputOptions {
  onSubmit: (value: string) => void;
}

interface UseTextInputReturn {
  input: string;
}

/**
 * Shared text-input hook used by InputBar and human input prompts.
 *
 * Uses a ref mirror of state to avoid the stale-closure problem
 * inherent in Ink's `useInput` callback (which captures the initial
 * render's state values and never re-subscribes).
 */
export function useTextInput({ onSubmit }: UseTextInputOptions): UseTextInputReturn {
  const [input, setInput] = useState("");
  const inputRef = useRef("");

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

  return { input };
}
