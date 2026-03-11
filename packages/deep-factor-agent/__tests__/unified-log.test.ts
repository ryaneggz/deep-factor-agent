import { describe, expect, it, beforeEach } from "vitest";
import {
  createLogEntry,
  parseLogLine,
  parseLogLines,
  serializeLogEntry,
  resetSequence,
} from "../src/unified-log.js";

describe("unified-log", () => {
  beforeEach(() => {
    resetSequence(0);
  });

  describe("createLogEntry", () => {
    it("creates an init entry with auto-timestamp and sequence", () => {
      const entry = createLogEntry("session-1", "init", {
        provider: "langchain",
        model: "gpt-4.1-mini",
        mode: "yolo",
      });

      expect(entry.type).toBe("init");
      expect(entry.sessionId).toBe("session-1");
      expect(entry.sequence).toBe(0);
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.provider).toBe("langchain");
      expect(entry.model).toBe("gpt-4.1-mini");
      expect(entry.mode).toBe("yolo");
    });

    it("auto-increments sequence", () => {
      const e1 = createLogEntry("s1", "message", {
        role: "user",
        content: "hello",
        iteration: 1,
      });
      const e2 = createLogEntry("s1", "message", {
        role: "assistant",
        content: "hi",
        iteration: 1,
      });

      expect(e1.sequence).toBe(0);
      expect(e2.sequence).toBe(1);
    });

    it("creates a tool_call entry", () => {
      const entry = createLogEntry("s1", "tool_call", {
        toolCallId: "tc-1",
        toolName: "bash",
        args: { command: "ls" },
        iteration: 1,
      });

      expect(entry.type).toBe("tool_call");
      expect(entry.toolName).toBe("bash");
      expect(entry.args).toEqual({ command: "ls" });
    });

    it("creates a result entry with usage", () => {
      const entry = createLogEntry("s1", "result", {
        content: "Done",
        stopReason: "completed",
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        iterations: 3,
      });

      expect(entry.type).toBe("result");
      expect(entry.content).toBe("Done");
      expect(entry.usage.totalTokens).toBe(150);
    });
  });

  describe("parseLogLine / serializeLogEntry", () => {
    it("roundtrips a log entry", () => {
      const entry = createLogEntry("s1", "message", {
        role: "user",
        content: "test",
        iteration: 1,
      });

      const serialized = serializeLogEntry(entry);
      const parsed = parseLogLine(serialized);

      expect(parsed).toEqual(entry);
    });
  });

  describe("parseLogLines", () => {
    it("parses multiple JSONL lines", () => {
      const e1 = createLogEntry("s1", "init", {
        provider: "langchain",
        model: "test",
        mode: "yolo",
      });
      const e2 = createLogEntry("s1", "message", {
        role: "user",
        content: "hi",
        iteration: 1,
      });

      const text = serializeLogEntry(e1) + "\n" + serializeLogEntry(e2) + "\n";
      const entries = parseLogLines(text);

      expect(entries).toHaveLength(2);
      expect(entries[0].type).toBe("init");
      expect(entries[1].type).toBe("message");
    });

    it("skips empty lines", () => {
      const e1 = createLogEntry("s1", "init", {
        provider: "claude",
        model: "sonnet",
        mode: "approve",
      });

      const text = "\n" + serializeLogEntry(e1) + "\n\n";
      const entries = parseLogLines(text);

      expect(entries).toHaveLength(1);
    });
  });

  describe("resetSequence", () => {
    it("resets the sequence counter", () => {
      createLogEntry("s1", "message", { role: "user", content: "a", iteration: 0 });
      createLogEntry("s1", "message", { role: "user", content: "b", iteration: 0 });

      resetSequence(10);

      const entry = createLogEntry("s1", "message", { role: "user", content: "c", iteration: 0 });
      expect(entry.sequence).toBe(10);
    });
  });
});
