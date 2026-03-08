import { useState, useRef } from "react";
import { useInput } from "ink";

interface TextInputKey {
  return?: boolean;
  meta?: boolean;
  escape?: boolean;
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
}

interface UseTextInputOptions {
  onSubmit: (value: string) => void;
  onHotkeyMenu?: () => void;
  onEscape?: () => void;
  isActive?: boolean;
  onKeyPress?: (inputChar: string, key: TextInputKey, currentValue: string) => boolean | void;
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
export function useTextInput({
  onSubmit,
  onHotkeyMenu,
  onEscape,
  isActive = true,
  onKeyPress,
}: UseTextInputOptions): UseTextInputReturn {
  const [input, setInput] = useState("");
  const inputRef = useRef("");

  useInput((inputChar, key) => {
    if (!isActive) {
      return;
    }
    if (onKeyPress?.(inputChar, key, inputRef.current)) {
      return;
    }
    // Ctrl+/ sends \x1f (Unit Separator) in most terminals
    if (inputChar === "\x1f" && onHotkeyMenu) {
      onHotkeyMenu();
      return;
    }
    // Escape key
    if (key.escape && onEscape) {
      onEscape();
      return;
    }
    // Alt+Enter inserts a newline
    if (key.return && key.meta) {
      const next = inputRef.current + "\n";
      inputRef.current = next;
      setInput(next);
      return;
    }
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
