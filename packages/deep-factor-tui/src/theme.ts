/**
 * Detect whether the terminal is using a light or dark color scheme.
 * Falls back to "dark" when detection is inconclusive.
 */
function detectColorScheme(): "light" | "dark" {
  // macOS Terminal / iTerm2 / many terminals set COLORFGBG="fg;bg"
  const colorfgbg = process.env.COLORFGBG;
  if (colorfgbg) {
    const parts = colorfgbg.split(";");
    const bg = Number(parts[parts.length - 1]);
    // ANSI colors 0-6 are dark, 7+ (white/bright) means light background
    if (!Number.isNaN(bg) && bg >= 7) return "light";
    return "dark";
  }

  // Some terminals advertise explicitly
  const appearance = process.env.TERM_APPEARANCE;
  if (appearance === "light") return "light";
  if (appearance === "dark") return "dark";

  // VS Code tells us via VSCODE_THEME_KIND
  const vscodeTheme = process.env.VSCODE_THEME_KIND;
  if (vscodeTheme?.includes("light")) return "light";

  return "dark";
}

const scheme = detectColorScheme();

/** Semantic colors that adapt to light/dark terminals */
export const colors = {
  /** Subtle background for user message bars */
  userMessageBg: scheme === "dark" ? "#3a3a3a" : "#e0e0e0",
} as const;
