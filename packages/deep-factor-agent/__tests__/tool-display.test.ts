import { describe, expect, it } from "vitest";
import { buildToolCallDisplay, buildToolResultDisplay } from "../src/tool-display.js";

describe("tool-display helpers", () => {
  it("builds semantic labels for common file tools", () => {
    expect(buildToolCallDisplay("read_file", { path: "a.txt" })).toMatchObject({
      kind: "file_read",
      label: "Read(a.txt)",
    });
    expect(buildToolCallDisplay("Edit", { file_path: "src/app.ts" })).toMatchObject({
      kind: "file_edit",
      label: "Edit(src/app.ts)",
    });
    expect(buildToolCallDisplay("MultiEdit", { file_path: "src/app.ts" })).toMatchObject({
      kind: "file_edit",
      label: "MultiEdit(src/app.ts)",
    });
    expect(buildToolCallDisplay("write_file", { path: "notes.txt" })).toMatchObject({
      kind: "file_write",
      label: "Write(notes.txt)",
    });
    expect(buildToolCallDisplay("bash", { command: "pwd" })).toMatchObject({
      kind: "command",
      label: "Bash(pwd)",
    });
  });

  it("parses unified diff text into file changes and diff previews", () => {
    const display = buildToolResultDisplay(
      "Edit",
      { path: "src/app.ts" },
      [
        "diff --git a/src/app.ts b/src/app.ts",
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1,2 +1,3 @@",
        "-const oldValue = 1;",
        "+const newValue = 2;",
        "+console.log(newValue);",
      ].join("\n"),
    );

    expect(display.kind).toBe("file_edit");
    expect(display.fileChanges).toEqual([{ path: "src/app.ts", change: "edited" }]);
    expect(display.diffPreviewLines).toEqual([
      "@@ -1,2 +1,3 @@",
      "-const oldValue = 1;",
      "+const newValue = 2;",
    ]);
    expect(display.diffOverflowLineCount).toBe(1);
  });

  it("parses structured JSON file change summaries", () => {
    const display = buildToolResultDisplay(
      "write_file",
      { path: "notes.txt" },
      JSON.stringify({
        fileChanges: [
          { path: "notes.txt", change: "created", additions: 3, deletions: 0 },
          { path: "src/app.ts", change: "edited", additions: 12, deletions: 4 },
          { path: "src/lib.ts", change: "deleted" },
          { path: "README.md", change: "edited" },
        ],
        preview: "+hello\n+world\n+!\n+extra",
      }),
    );

    expect(display.kind).toBe("file_write");
    expect(display.fileChanges).toEqual([
      { path: "notes.txt", change: "created", additions: 3, deletions: 0 },
      { path: "src/app.ts", change: "edited", additions: 12, deletions: 4 },
      { path: "src/lib.ts", change: "deleted" },
    ]);
    expect(display.overflowLineCount).toBe(1);
    expect(display.diffPreviewLines).toEqual(["+hello", "+world", "+!"]);
  });

  it("treats non-diff bash output as a generic preview", () => {
    const display = buildToolResultDisplay(
      "bash",
      { command: "git status --short" },
      "M src/app.ts\n?? tmp.txt\nA very long line that should still be truncated if needed",
    );

    expect(display.kind).toBe("command");
    expect(display.previewLines).toEqual(["M src/app.ts", "?? tmp.txt"]);
    expect(display.overflowLineCount).toBe(1);
    expect(display.fileChanges).toBeUndefined();
  });

  it("parses plain text write results into concise file summaries", () => {
    const display = buildToolResultDisplay(
      "write_file",
      { path: "notes.txt" },
      "Wrote 42 chars to notes.txt",
    );

    expect(display.kind).toBe("file_write");
    expect(display.fileChanges).toEqual([{ path: "notes.txt", change: "edited" }]);
    expect(display.previewLines).toBeUndefined();
  });
});
