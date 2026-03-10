import { describe, expect, it } from "vitest";
import { buildThreadFromSession, resolveSessionSettings } from "../src/session-logger.js";

describe("resolveSessionSettings", () => {
  it("reuses stored provider and model when flags are absent", () => {
    expect(
      resolveSessionSettings({
        entries: [
          {
            timestamp: "2026-03-08T10:00:00.000Z",
            sessionId: "abc",
            role: "user",
            content: "Hello",
            provider: "claude-sdk",
            model: "sonnet",
          },
        ],
        hasProviderFlag: false,
        hasModelFlag: false,
      }),
    ).toEqual({
      provider: "claude",
      model: "sonnet",
    });
  });

  it("falls back to defaults for older sessions without provider metadata", () => {
    expect(
      resolveSessionSettings({
        entries: [
          {
            timestamp: "2026-03-08T10:00:00.000Z",
            sessionId: "abc",
            role: "user",
            content: "Hello",
            model: "some-old-model",
          },
        ],
        hasProviderFlag: false,
        hasModelFlag: false,
      }),
    ).toEqual({
      provider: "langchain",
      model: "gpt-4.1-mini",
    });
  });

  it("lets explicit flags win over stored session metadata", () => {
    expect(
      resolveSessionSettings({
        entries: [
          {
            timestamp: "2026-03-08T10:00:00.000Z",
            sessionId: "abc",
            role: "user",
            content: "Hello",
            provider: "claude-sdk",
            model: "sonnet",
          },
        ],
        hasProviderFlag: true,
        providerFlag: "langchain",
        hasModelFlag: false,
      }),
    ).toEqual({
      provider: "langchain",
      model: "gpt-4.1-mini",
    });
  });

  it("round-trips stored codex provider metadata", () => {
    expect(
      resolveSessionSettings({
        entries: [
          {
            timestamp: "2026-03-08T10:00:00.000Z",
            sessionId: "abc",
            role: "user",
            content: "Hello",
            provider: "codex",
            model: "gpt-5.4",
          },
        ],
        hasProviderFlag: false,
        hasModelFlag: false,
      }),
    ).toEqual({
      provider: "codex",
      model: "gpt-5.4",
    });
  });

  it("preserves stored tool display metadata when rebuilding a thread", () => {
    const thread = buildThreadFromSession([
      {
        timestamp: "2026-03-08T10:00:00.000Z",
        sessionId: "abc",
        role: "tool_call",
        content: "Edit",
        toolName: "Edit",
        toolArgs: { path: "src/app.ts" },
        toolCallId: "tool-1",
        toolDisplay: { kind: "file_edit", label: "Edit(src/app.ts)" },
      },
      {
        timestamp: "2026-03-08T10:00:01.000Z",
        sessionId: "abc",
        role: "tool_result",
        content: "diff --git a/src/app.ts b/src/app.ts",
        toolCallId: "tool-1",
        toolDisplay: {
          kind: "file_edit",
          label: "Edit(src/app.ts)",
          fileChanges: [{ path: "src/app.ts", change: "edited" }],
          diffPreviewLines: ["@@ -1 +1 @@"],
        },
      },
    ]);

    expect(thread.events[0]).toMatchObject({
      type: "tool_call",
      display: { label: "Edit(src/app.ts)" },
    });
    expect(thread.events[1]).toMatchObject({
      type: "tool_result",
      display: {
        fileChanges: [{ path: "src/app.ts", change: "edited" }],
        diffPreviewLines: ["@@ -1 +1 @@"],
      },
    });
  });

  it("round-trips stored file-read metadata when rebuilding a thread", () => {
    const thread = buildThreadFromSession([
      {
        timestamp: "2026-03-08T10:00:00.000Z",
        sessionId: "abc",
        role: "tool_call",
        content: "read_file",
        toolName: "read_file",
        toolArgs: { path: "src/app.ts" },
        toolCallId: "tool-2",
        toolDisplay: { kind: "file_read", label: "Read(src/app.ts)" },
      },
      {
        timestamp: "2026-03-08T10:00:01.000Z",
        sessionId: "abc",
        role: "tool_result",
        content: "Read src/app.ts\n\n1| export {}",
        toolCallId: "tool-2",
        toolDisplay: {
          kind: "file_read",
          label: "Read(src/app.ts)",
          fileReads: [
            {
              path: "src/app.ts",
              startLine: 1,
              endLine: 1,
              totalLines: 1,
              previewLines: ["1| export {}"],
              detailLines: ["1| export {}"],
            },
          ],
        },
      },
    ]);

    expect(thread.events[1]).toMatchObject({
      type: "tool_result",
      display: {
        fileReads: [
          {
            path: "src/app.ts",
            detailLines: ["1| export {}"],
          },
        ],
      },
    });
  });
});
