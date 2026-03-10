import type { ToolDisplayKind, ToolDisplayMetadata, ToolFileChangeSummary } from "./types.js";

const MAX_TOOL_LABEL_LENGTH = 96;
const MAX_GENERIC_PREVIEW_LINES = 2;
const MAX_GENERIC_PREVIEW_WIDTH = 88;
const MAX_FILE_CHANGES_SHOWN = 3;
const MAX_DIFF_PREVIEW_LINES = 3;
const MAX_DIFF_PREVIEW_WIDTH = 72;
const MAX_TOOL_ARG_PREVIEW = 48;

const FILE_READ_TOOL_NAMES = new Set(["Read", "View", "read_file"]);
const FILE_EDIT_TOOL_NAMES = new Set(["Edit", "MultiEdit", "apply_patch", "edit_file"]);
const FILE_WRITE_TOOL_NAMES = new Set(["Write", "write_file"]);
const COMMAND_TOOL_NAMES = new Set(["Bash", "bash"]);

function truncateInline(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, Math.max(0, maxLength - 3)) + "...";
}

function formatPreviewValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(truncateInline(value, MAX_TOOL_ARG_PREVIEW));
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const preview = value.slice(0, 2).map((item) => formatPreviewValue(item));
    return `[${preview.join(", ")}${value.length > 2 ? ", ..." : ""}]`;
  }
  if (typeof value === "object") {
    return "{...}";
  }
  return JSON.stringify(String(value));
}

function formatToolArgsPreview(toolArgs?: Record<string, unknown>): string | null {
  if (!toolArgs || Object.keys(toolArgs).length === 0) {
    return null;
  }

  const entries = Object.entries(toolArgs);
  const preview = entries
    .slice(0, 2)
    .map(([key, value]) => `${key}=${formatPreviewValue(value)}`)
    .join(", ");
  return `${preview}${entries.length > 2 ? ", ..." : ""}`;
}

function normalizeToolKind(toolName: string): ToolDisplayKind {
  if (FILE_READ_TOOL_NAMES.has(toolName)) return "file_read";
  if (FILE_EDIT_TOOL_NAMES.has(toolName)) return "file_edit";
  if (FILE_WRITE_TOOL_NAMES.has(toolName)) return "file_write";
  if (COMMAND_TOOL_NAMES.has(toolName)) return "command";
  return "generic";
}

function resolvePrimaryPath(args?: Record<string, unknown>): string | undefined {
  const filePath = args?.file_path;
  if (typeof filePath === "string" && filePath.length > 0) {
    return filePath;
  }

  const path = args?.path;
  if (typeof path === "string" && path.length > 0) {
    return path;
  }

  const paths = args?.paths;
  if (Array.isArray(paths) && typeof paths[0] === "string" && paths[0].length > 0) {
    return paths[0];
  }

  return undefined;
}

function toMeaningfulLines(
  input: string,
  maxLines: number,
  maxWidth: number,
): { lines: string[]; overflowLineCount: number } {
  const normalized = input.replace(/\r\n/g, "\n");
  const rawLines = normalized.split("\n").map((line) => line.trimEnd());
  const meaningfulLines = rawLines.filter((line) => line.trim().length > 0);
  const sourceLines = meaningfulLines.length > 0 ? meaningfulLines : rawLines.slice(0, 1);
  const lines = sourceLines.slice(0, maxLines).map((line) => truncateInline(line, maxWidth));
  return {
    lines,
    overflowLineCount: Math.max(0, sourceLines.length - lines.length),
  };
}

function extractDiffPreview(result: string): {
  fileChanges: ToolFileChangeSummary[];
  diffPreviewLines?: string[];
  diffOverflowLineCount?: number;
} | null {
  if (!/(^diff --git |^--- |^\+\+\+ |^@@ )/m.test(result)) {
    return null;
  }

  const lines = result.replace(/\r\n/g, "\n").split("\n");
  const changes: ToolFileChangeSummary[] = [];
  const previews: string[] = [];
  let currentPath: string | undefined;
  let inHunk = false;

  for (const line of lines) {
    const diffMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (diffMatch) {
      currentPath = diffMatch[2];
      changes.push({ path: currentPath, change: "edited" });
      continue;
    }

    const addFileMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (addFileMatch && currentPath == null) {
      currentPath = addFileMatch[1];
      changes.push({ path: currentPath, change: "edited" });
      continue;
    }

    if (line.startsWith("new file mode ")) {
      const last = changes.at(-1);
      if (last) last.change = "created";
      continue;
    }

    if (line.startsWith("deleted file mode ")) {
      const last = changes.at(-1);
      if (last) last.change = "deleted";
      continue;
    }

    if (line.startsWith("@@")) {
      inHunk = true;
    }

    if (
      inHunk &&
      (line.startsWith("@@") || line.startsWith("+") || line.startsWith("-")) &&
      previews.length < 32
    ) {
      previews.push(truncateInline(line, MAX_DIFF_PREVIEW_WIDTH));
    }
  }

  if (changes.length === 0) {
    return null;
  }

  const diffPreviewLines = previews.slice(0, MAX_DIFF_PREVIEW_LINES);
  return {
    fileChanges: changes,
    ...(diffPreviewLines.length > 0 ? { diffPreviewLines } : {}),
    ...(previews.length > diffPreviewLines.length
      ? { diffOverflowLineCount: previews.length - diffPreviewLines.length }
      : {}),
  };
}

function normalizeChange(value: unknown): ToolFileChangeSummary["change"] {
  if (value === "created" || value === "deleted" || value === "edited") {
    return value;
  }
  return "edited";
}

function toFileChangeSummary(value: unknown): ToolFileChangeSummary | null {
  if (typeof value !== "object" || value == null) {
    return null;
  }

  const item = value as Record<string, unknown>;
  const path =
    (typeof item.path === "string" && item.path) ||
    (typeof item.file_path === "string" && item.file_path) ||
    null;
  if (!path) {
    return null;
  }

  return {
    path,
    change: normalizeChange(item.change),
    ...(typeof item.additions === "number" ? { additions: item.additions } : {}),
    ...(typeof item.deletions === "number" ? { deletions: item.deletions } : {}),
  };
}

function extractStructuredFileChanges(parsed: unknown): {
  fileChanges: ToolFileChangeSummary[];
  diffPreviewLines?: string[];
} | null {
  let normalized = parsed;
  if (typeof parsed === "string") {
    try {
      normalized = JSON.parse(parsed) as unknown;
    } catch {
      normalized = parsed;
    }
  }

  const nestedFileChanges =
    typeof normalized === "object" &&
    normalized != null &&
    Array.isArray((normalized as { fileChanges?: unknown }).fileChanges)
      ? ((normalized as { fileChanges: unknown[] }).fileChanges ?? [])
      : [];
  const items = Array.isArray(normalized)
    ? normalized
    : typeof normalized === "object" && normalized != null
      ? [normalized, ...nestedFileChanges]
      : [];

  const fileChanges = items
    .map((item) => toFileChangeSummary(item))
    .filter((item): item is ToolFileChangeSummary => item != null);

  if (fileChanges.length === 0) {
    return null;
  }

  const previewCandidates =
    typeof normalized === "object" && normalized != null
      ? [(normalized as { diff?: unknown }).diff, (normalized as { preview?: unknown }).preview]
      : [];
  const previewText = previewCandidates.find((value): value is string => typeof value === "string");
  if (!previewText) {
    return { fileChanges };
  }

  const preview = toMeaningfulLines(previewText, MAX_DIFF_PREVIEW_LINES, MAX_DIFF_PREVIEW_WIDTH);
  return {
    fileChanges,
    ...(preview.lines.length > 0 ? { diffPreviewLines: preview.lines } : {}),
  };
}

function extractPlainTextFileChange(
  result: string,
  fallbackPath?: string,
): ToolFileChangeSummary[] | null {
  const patterns: Array<{ regex: RegExp; change: ToolFileChangeSummary["change"] }> = [
    { regex: /\bcreated\s+([^\s,]+)/i, change: "created" },
    { regex: /\bupdated\s+([^\s,]+)/i, change: "edited" },
    { regex: /\bedited\s+([^\s,]+)/i, change: "edited" },
    { regex: /\bdeleted\s+([^\s,]+)/i, change: "deleted" },
    { regex: /\bwrote\b(?:.+?\bto\b)?\s+([^\s,]+)/i, change: "edited" },
  ];

  for (const { regex, change } of patterns) {
    const match = regex.exec(result);
    if (match?.[1]) {
      return [{ path: match[1], change }];
    }
  }

  if (fallbackPath && /\b(created|updated|edited|deleted|wrote)\b/i.test(result)) {
    return [{ path: fallbackPath, change: /deleted/i.test(result) ? "deleted" : "edited" }];
  }

  return null;
}

function buildFileChangeDisplay(
  kind: ToolDisplayKind,
  label: string,
  fileChanges: ToolFileChangeSummary[],
  diffPreviewLines?: string[],
  diffOverflowLineCount?: number,
): ToolDisplayMetadata {
  return {
    kind,
    label,
    fileChanges: fileChanges.slice(0, MAX_FILE_CHANGES_SHOWN),
    ...(fileChanges.length > MAX_FILE_CHANGES_SHOWN
      ? { overflowLineCount: fileChanges.length - MAX_FILE_CHANGES_SHOWN }
      : {}),
    ...(diffPreviewLines && diffPreviewLines.length > 0 ? { diffPreviewLines } : {}),
    ...(diffOverflowLineCount && diffOverflowLineCount > 0 ? { diffOverflowLineCount } : {}),
  };
}

export function buildToolCallDisplay(
  toolName: string,
  toolArgs?: Record<string, unknown>,
): ToolDisplayMetadata {
  const kind = normalizeToolKind(toolName);
  const path = resolvePrimaryPath(toolArgs);

  if (kind === "command" && typeof toolArgs?.command === "string") {
    return {
      kind,
      label: `Bash(${truncateInline(toolArgs.command, MAX_TOOL_LABEL_LENGTH)})`,
    };
  }

  if (kind === "file_read") {
    return { kind, label: `Read(${truncateInline(path ?? "unknown", MAX_TOOL_LABEL_LENGTH)})` };
  }

  if (kind === "file_edit") {
    const action = toolName === "MultiEdit" ? "MultiEdit" : "Edit";
    return {
      kind,
      label: `${action}(${truncateInline(path ?? "unknown", MAX_TOOL_LABEL_LENGTH)})`,
    };
  }

  if (kind === "file_write") {
    return { kind, label: `Write(${truncateInline(path ?? "unknown", MAX_TOOL_LABEL_LENGTH)})` };
  }

  const preview = formatToolArgsPreview(toolArgs);
  return {
    kind,
    label:
      preview == null
        ? `Tool ${toolName}`
        : `Tool ${toolName}(${truncateInline(preview, MAX_TOOL_LABEL_LENGTH)})`,
  };
}

export function buildToolResultDisplay(
  toolName: string,
  toolArgs: Record<string, unknown> | undefined,
  result: unknown,
): ToolDisplayMetadata {
  const base = buildToolCallDisplay(toolName, toolArgs);
  const resultText = typeof result === "string" ? result : JSON.stringify(result);
  const path = resolvePrimaryPath(toolArgs);

  if (base.kind === "file_edit" || base.kind === "file_write" || base.kind === "command") {
    const structured = extractStructuredFileChanges(result);
    if (structured) {
      return buildFileChangeDisplay(
        base.kind === "command" ? "file_edit" : base.kind,
        base.label,
        structured.fileChanges,
        structured.diffPreviewLines,
      );
    }

    const diff = extractDiffPreview(resultText);
    if (diff) {
      return buildFileChangeDisplay(
        base.kind === "command" ? "file_edit" : base.kind,
        base.label,
        diff.fileChanges,
        diff.diffPreviewLines,
        diff.diffOverflowLineCount,
      );
    }

    if (base.kind !== "command") {
      const plainText = extractPlainTextFileChange(resultText, path);
      if (plainText) {
        return buildFileChangeDisplay(base.kind, base.label, plainText);
      }
    }
  }

  const preview = toMeaningfulLines(
    resultText,
    MAX_GENERIC_PREVIEW_LINES,
    MAX_GENERIC_PREVIEW_WIDTH,
  );
  return {
    ...base,
    ...(preview.lines.length > 0 ? { previewLines: preview.lines } : {}),
    ...(preview.overflowLineCount > 0 ? { overflowLineCount: preview.overflowLineCount } : {}),
  };
}
