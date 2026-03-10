import { useState, useRef } from "react";
import { useInput } from "ink";

interface TextInputKey {
  return?: boolean;
  meta?: boolean;
  escape?: boolean;
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
  tab?: boolean;
  shift?: boolean;
}

interface UseTextInputOptions {
  onSubmit: (value: string) => void;
  onHotkeyMenu?: () => void;
  onCtrlO?: () => void;
  onCycleMode?: () => void;
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
  onCtrlO,
  onCycleMode,
  onEscape,
  isActive = true,
  onKeyPress,
}: UseTextInputOptions): UseTextInputReturn {
  const [input, setInput] = useState("");
  const inputRef = useRef("");
  const onSubmitRef = useRef(onSubmit);
  const onHotkeyMenuRef = useRef(onHotkeyMenu);
  const onCtrlORef = useRef(onCtrlO);
  const onCycleModeRef = useRef(onCycleMode);
  const onEscapeRef = useRef(onEscape);
  const onKeyPressRef = useRef(onKeyPress);
  const isActiveRef = useRef(isActive);

  // Synchronous ref sync is intentional — useInput callbacks must read the
  // latest values on the same render tick (useEffect would introduce staleness).
  // eslint-disable-next-line react-hooks/refs
  onSubmitRef.current = onSubmit;
  // eslint-disable-next-line react-hooks/refs
  onHotkeyMenuRef.current = onHotkeyMenu;
  // eslint-disable-next-line react-hooks/refs
  onCtrlORef.current = onCtrlO;
  // eslint-disable-next-line react-hooks/refs
  onCycleModeRef.current = onCycleMode;
  // eslint-disable-next-line react-hooks/refs
  onEscapeRef.current = onEscape;
  // eslint-disable-next-line react-hooks/refs
  onKeyPressRef.current = onKeyPress;
  // eslint-disable-next-line react-hooks/refs
  isActiveRef.current = isActive;

  useInput((inputChar, key) => {
    if (!isActiveRef.current) {
      return;
    }
    if (key.tab && key.shift) {
      onCycleModeRef.current?.();
      return;
    }
    if (
      onCtrlORef.current &&
      (inputChar === "\x0f" || (key.ctrl && inputChar.toLowerCase() === "o"))
    ) {
      onCtrlORef.current();
      return;
    }
    if (onKeyPressRef.current?.(inputChar, key, inputRef.current)) {
      return;
    }
    // Ctrl+/ sends \x1f (Unit Separator) in most terminals
    if (inputChar === "\x1f" && onHotkeyMenuRef.current) {
      onHotkeyMenuRef.current();
      return;
    }
    // Escape key
    if (key.escape && onEscapeRef.current) {
      onEscapeRef.current();
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
        onSubmitRef.current(current);
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
