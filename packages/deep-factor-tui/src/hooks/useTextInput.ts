import { useState, useRef } from "react";
import { useInput } from "ink";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface TextInputKey {
  return?: boolean;
  meta?: boolean;
  escape?: boolean;
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
  tab?: boolean;
  shift?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
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

const MAX_HISTORY = 500;
const HISTORY_FILE = join(homedir(), ".deepfactor", "input_history.txt");

function loadHistory(): string[] {
  try {
    return readFileSync(HISTORY_FILE, "utf-8")
      .split("\n")
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function saveHistory(history: string[]): void {
  try {
    mkdirSync(join(homedir(), ".deepfactor"), { recursive: true });
    writeFileSync(HISTORY_FILE, history.join("\n") + "\n");
  } catch {
    // Best-effort — don't break input on fs errors
  }
}

// Module-level history persists across InputBar mount/unmount cycles
// (the component unmounts while the agent is processing a query).
// Loaded from disk at startup so history survives across sessions.
const globalHistory: string[] = loadHistory();

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
  const historyIndexRef = useRef(-1);
  const draftRef = useRef("");
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
    // Shift+Enter or Alt+Enter inserts a newline
    if (key.return && (key.shift || key.meta)) {
      const next = inputRef.current + "\n";
      inputRef.current = next;
      setInput(next);
      return;
    }
    if (key.return) {
      const current = inputRef.current.trim();
      if (current.length > 0) {
        globalHistory.push(current);
        if (globalHistory.length > MAX_HISTORY) {
          globalHistory.splice(0, globalHistory.length - MAX_HISTORY);
        }
        saveHistory(globalHistory);
        historyIndexRef.current = -1;
        onSubmitRef.current(current);
        inputRef.current = "";
        setInput("");
      }
      return;
    }
    if (key.upArrow) {
      const history = globalHistory;
      if (history.length === 0) return;
      if (historyIndexRef.current === -1) {
        draftRef.current = inputRef.current;
        historyIndexRef.current = history.length - 1;
      } else if (historyIndexRef.current > 0) {
        historyIndexRef.current--;
      }
      const entry = history[historyIndexRef.current]!;
      inputRef.current = entry;
      setInput(entry);
      return;
    }
    if (key.downArrow) {
      const history = globalHistory;
      if (historyIndexRef.current === -1) return;
      if (historyIndexRef.current < history.length - 1) {
        historyIndexRef.current++;
        const entry = history[historyIndexRef.current]!;
        inputRef.current = entry;
        setInput(entry);
      } else {
        historyIndexRef.current = -1;
        inputRef.current = draftRef.current;
        setInput(draftRef.current);
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
