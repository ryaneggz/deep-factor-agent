import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { createPatch } from "diff";
import type {
  ToolDisplayMetadata,
  ToolExecutionResult,
  ToolFileChangeSummary,
  ToolFileReadSummary,
} from "deep-factor-agent";

const MAX_READ_PREVIEW_LINES = 3;
const MAX_READ_DETAIL_LINES = 12;
const MAX_DIFF_PREVIEW_LINES = 8;

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function toDisplayPath(absolutePath: string): string {
  const rel = relative(process.cwd(), absolutePath);
  if (!rel || rel.startsWith("..")) {
    return absolutePath;
  }
  return rel;
}

export function resolveWorkspacePath(inputPath: string): {
  absolutePath: string;
  displayPath: string;
} {
  const absolutePath = isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath);
  return {
    absolutePath,
    displayPath: toDisplayPath(absolutePath),
  };
}

function formatLineNumber(lineNumber: number, width: number, line: string): string {
  return `${String(lineNumber).padStart(width, " ")}| ${line}`;
}

function sliceFileLines(
  content: string,
  startLine: number,
  lineCount: number,
): {
  selectedLines: string[];
  totalLines: number;
  startLine: number;
  endLine: number;
} {
  const normalized = normalizeLineEndings(content);
  const allLines = normalized.split("\n");
  const totalLines = allLines.length;
  const safeStartLine = Math.max(1, startLine);
  const startIndex = Math.min(totalLines, safeStartLine - 1);
  const selectedLines = allLines.slice(startIndex, startIndex + Math.max(1, lineCount));
  const endLine =
    selectedLines.length === 0 ? safeStartLine : safeStartLine + selectedLines.length - 1;

  return {
    selectedLines,
    totalLines,
    startLine: safeStartLine,
    endLine,
  };
}

export function buildReadFileResult(args: {
  path: string;
  content: string;
  startLine?: number;
  lineCount?: number;
}): ToolExecutionResult {
  const { displayPath } = resolveWorkspacePath(args.path);
  const { selectedLines, totalLines, startLine, endLine } = sliceFileLines(
    args.content,
    args.startLine ?? 1,
    args.lineCount ?? 200,
  );
  const lineNumberWidth = Math.max(String(endLine).length, 2);
  const numberedLines = selectedLines.map((line, index) =>
    formatLineNumber(startLine + index, lineNumberWidth, line),
  );
  const previewLines = numberedLines.slice(0, MAX_READ_PREVIEW_LINES);
  const detailLines = numberedLines.slice(0, MAX_READ_DETAIL_LINES);
  const detailOverflowLineCount = Math.max(0, numberedLines.length - detailLines.length);
  const fileRead: ToolFileReadSummary = {
    path: displayPath,
    startLine,
    endLine,
    totalLines,
    previewLines,
    ...(detailLines.length > 0 ? { detailLines } : {}),
    ...(detailOverflowLineCount > 0 ? { overflowLineCount: detailOverflowLineCount } : {}),
  };

  const header =
    startLine === 1 && endLine >= totalLines
      ? `Read ${displayPath} (${totalLines} line${totalLines === 1 ? "" : "s"})`
      : `Read ${displayPath} (lines ${startLine}-${endLine} of ${totalLines})`;

  return {
    content: [header, "", numberedLines.join("\n")].join("\n"),
    display: {
      kind: "file_read",
      label: `Read(${displayPath})`,
      fileReads: [fileRead],
      ...(detailLines.length > 0 ? { detailLines } : {}),
      ...(detailOverflowLineCount > 0 ? { detailOverflowLineCount } : {}),
    },
  };
}

function countDiffChanges(diffLines: string[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const line of diffLines) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      continue;
    }
    if (line.startsWith("+")) {
      additions += 1;
    } else if (line.startsWith("-")) {
      deletions += 1;
    }
  }

  return { additions, deletions };
}

function collectDiffPreview(diffText: string): {
  lines: string[];
  overflowLineCount: number;
} {
  const diffLines = normalizeLineEndings(diffText)
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("@@") ||
        line.startsWith("+") ||
        line.startsWith("-") ||
        line.startsWith(" "),
    );
  const previewLines = diffLines.slice(0, MAX_DIFF_PREVIEW_LINES);
  return {
    lines: previewLines,
    overflowLineCount: Math.max(0, diffLines.length - previewLines.length),
  };
}

function createUnifiedDiff(displayPath: string, before: string, after: string): string {
  return createPatch(displayPath, before, after, "before", "after", {
    context: 2,
  }).trimEnd();
}

function buildWriteLikeResult(args: {
  path: string;
  before: string;
  after: string;
  kind: "file_write" | "file_edit";
  change: ToolFileChangeSummary["change"];
  successMessage: string;
}): ToolExecutionResult {
  const diffText = createUnifiedDiff(args.path, args.before, args.after);
  const preview = collectDiffPreview(diffText);
  const { additions, deletions } = countDiffChanges(diffText.split("\n"));
  const display: ToolDisplayMetadata = {
    kind: args.kind,
    label: args.kind === "file_write" ? `Write(${args.path})` : `Edit(${args.path})`,
    fileChanges: [
      {
        path: args.path,
        change: args.change,
        additions,
        deletions,
      },
    ],
    ...(preview.lines.length > 0 ? { diffPreviewLines: preview.lines } : {}),
    ...(preview.overflowLineCount > 0 ? { diffOverflowLineCount: preview.overflowLineCount } : {}),
  };

  return {
    content: `${args.successMessage}\n\n${diffText}`,
    display,
  };
}

export function readExistingFile(path: string): { exists: boolean; content: string } {
  const { absolutePath } = resolveWorkspacePath(path);
  if (!existsSync(absolutePath)) {
    return { exists: false, content: "" };
  }
  return { exists: true, content: readFileSync(absolutePath, "utf8") };
}

export function writeWorkspaceFile(path: string, content: string): ToolExecutionResult {
  const { absolutePath, displayPath } = resolveWorkspacePath(path);
  const previous = readExistingFile(absolutePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");

  return buildWriteLikeResult({
    path: displayPath,
    before: previous.content,
    after: content,
    kind: "file_write",
    change: previous.exists ? "edited" : "created",
    successMessage: previous.exists ? `Updated ${displayPath}` : `Created ${displayPath}`,
  });
}

export function editWorkspaceFile(args: {
  path: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}): ToolExecutionResult {
  const { absolutePath, displayPath } = resolveWorkspacePath(args.path);
  const before = readFileSync(absolutePath, "utf8");

  if (!before.includes(args.oldString)) {
    throw new Error(`Could not find target text in ${displayPath}`);
  }

  const after = args.replaceAll
    ? before.split(args.oldString).join(args.newString)
    : before.replace(args.oldString, args.newString);

  writeFileSync(absolutePath, after, "utf8");

  return buildWriteLikeResult({
    path: displayPath,
    before,
    after,
    kind: "file_edit",
    change: "edited",
    successMessage: `Edited ${displayPath}`,
  });
}

export function readWorkspaceFile(path: string): string {
  const { absolutePath } = resolveWorkspacePath(path);
  return readFileSync(absolutePath, "utf8");
}
