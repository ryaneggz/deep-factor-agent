import { describe, expect, it } from "vitest";
import type { UnifiedLogEntry } from "deep-factor-agent";
import { buildThreadFromUnifiedSession, resolveSessionSettings } from "../src/session-logger.js";

describe("resolveSessionSettings", () => {
  it("reuses stored provider and model from init entry when flags are absent", () => {
    const entries: UnifiedLogEntry[] = [
      {
        type: "init",
        sessionId: "abc",
        timestamp: new Date("2026-03-08T10:00:00.000Z").getTime(),
        sequence: 0,
        provider: "claude",
        model: "sonnet",
        mode: "agentic",
      },
    ];
    expect(
      resolveSessionSettings({
        entries,
        hasProviderFlag: false,
        hasModelFlag: false,
      }),
    ).toEqual({
      provider: "claude",
      model: "sonnet",
    });
  });

  it("falls back to defaults for sessions without provider metadata", () => {
    const entries: UnifiedLogEntry[] = [
      {
        type: "message",
        sessionId: "abc",
        timestamp: new Date("2026-03-08T10:00:00.000Z").getTime(),
        sequence: 0,
        role: "user",
        content: "Hello",
        iteration: 0,
      },
    ];
    expect(
      resolveSessionSettings({
        entries,
        hasProviderFlag: false,
        hasModelFlag: false,
      }),
    ).toEqual({
      provider: "langchain",
      model: "gpt-4.1-mini",
    });
  });

  it("lets explicit flags win over stored session metadata", () => {
    const entries: UnifiedLogEntry[] = [
      {
        type: "init",
        sessionId: "abc",
        timestamp: new Date("2026-03-08T10:00:00.000Z").getTime(),
        sequence: 0,
        provider: "claude",
        model: "sonnet",
        mode: "agentic",
      },
    ];
    expect(
      resolveSessionSettings({
        entries,
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
    const entries: UnifiedLogEntry[] = [
      {
        type: "init",
        sessionId: "abc",
        timestamp: new Date("2026-03-08T10:00:00.000Z").getTime(),
        sequence: 0,
        provider: "codex",
        model: "gpt-5.4",
        mode: "agentic",
      },
    ];
    expect(
      resolveSessionSettings({
        entries,
        hasProviderFlag: false,
        hasModelFlag: false,
      }),
    ).toEqual({
      provider: "codex",
      model: "gpt-5.4",
    });
  });

  it("preserves stored tool display metadata when rebuilding a thread from unified entries", () => {
    const ts1 = new Date("2026-03-08T10:00:00.000Z").getTime();
    const ts2 = new Date("2026-03-08T10:00:01.000Z").getTime();
    const thread = buildThreadFromUnifiedSession([
      {
        type: "tool_call",
        sessionId: "abc",
        timestamp: ts1,
        sequence: 0,
        toolCallId: "tool-1",
        toolName: "Edit",
        args: { path: "src/app.ts" },
        display: { kind: "file_edit", label: "Edit(src/app.ts)" },
        iteration: 1,
      },
      {
        type: "tool_result",
        sessionId: "abc",
        timestamp: ts2,
        sequence: 1,
        toolCallId: "tool-1",
        result: "diff --git a/src/app.ts b/src/app.ts",
        isError: false,
        display: {
          kind: "file_edit",
          label: "Edit(src/app.ts)",
          fileChanges: [{ path: "src/app.ts", change: "edited" }],
          diffPreviewLines: ["@@ -1 +1 @@"],
        },
        iteration: 1,
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

  it("preserves parallelGroup on tool_call and tool_result when rebuilding a thread from unified entries", () => {
    const ts1 = new Date("2026-03-08T10:00:00.000Z").getTime();
    const ts2 = new Date("2026-03-08T10:00:01.000Z").getTime();
    const thread = buildThreadFromUnifiedSession([
      {
        type: "tool_call",
        sessionId: "abc",
        timestamp: ts1,
        sequence: 0,
        toolCallId: "tc-1",
        toolName: "bash",
        args: { command: "ls" },
        parallelGroup: "pg_batch_1",
        iteration: 1,
      },
      {
        type: "tool_call",
        sessionId: "abc",
        timestamp: ts1,
        sequence: 1,
        toolCallId: "tc-2",
        toolName: "read_file",
        args: { path: "/tmp/a" },
        parallelGroup: "pg_batch_1",
        iteration: 1,
      },
      {
        type: "tool_result",
        sessionId: "abc",
        timestamp: ts2,
        sequence: 2,
        toolCallId: "tc-1",
        result: "file.txt",
        isError: false,
        parallelGroup: "pg_batch_1",
        iteration: 1,
      },
      {
        type: "tool_result",
        sessionId: "abc",
        timestamp: ts2,
        sequence: 3,
        toolCallId: "tc-2",
        result: "contents",
        isError: false,
        parallelGroup: "pg_batch_1",
        iteration: 1,
      },
    ]);

    const tcs = thread.events.filter((e) => e.type === "tool_call");
    const trs = thread.events.filter((e) => e.type === "tool_result");

    expect(tcs).toHaveLength(2);
    expect(trs).toHaveLength(2);
    for (const tc of tcs) {
      expect((tc as { parallelGroup?: string }).parallelGroup).toBe("pg_batch_1");
    }
    for (const tr of trs) {
      expect((tr as { parallelGroup?: string }).parallelGroup).toBe("pg_batch_1");
    }
  });

  it("round-trips stored file-read metadata when rebuilding a thread from unified entries", () => {
    const ts1 = new Date("2026-03-08T10:00:00.000Z").getTime();
    const ts2 = new Date("2026-03-08T10:00:01.000Z").getTime();
    const thread = buildThreadFromUnifiedSession([
      {
        type: "tool_call",
        sessionId: "abc",
        timestamp: ts1,
        sequence: 0,
        toolCallId: "tool-2",
        toolName: "read_file",
        args: { path: "src/app.ts" },
        display: { kind: "file_read", label: "Read(src/app.ts)" },
        iteration: 1,
      },
      {
        type: "tool_result",
        sessionId: "abc",
        timestamp: ts2,
        sequence: 1,
        toolCallId: "tool-2",
        result: "Read src/app.ts\n\n1| export {}",
        isError: false,
        display: {
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
        iteration: 1,
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
