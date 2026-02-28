import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("deep-factor-agent", () => ({
  createLangChainTool: vi.fn(
    (
      name: string,
      opts: {
        description: string;
        schema: unknown;
        execute: (args: Record<string, unknown>) => Promise<string>;
      },
    ) => ({
      name,
      description: opts.description,
      schema: opts.schema,
      invoke: async (args: Record<string, unknown>) => opts.execute(args),
    }),
  ),
}));

import { bashTool } from "../../src/tools/bash.js";
import { exec } from "node:child_process";

const mockExec = exec as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

/** Helper: make mockExec call its callback with stdout */
function mockSuccess(stdout: string) {
  mockExec.mockImplementation(
    (
      _cmd: string,
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(null, stdout, "");
    },
  );
}

/** Helper: make mockExec call its callback with an error */
function mockError(error: Error) {
  mockExec.mockImplementation(
    (
      _cmd: string,
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(error, "", "");
    },
  );
}

describe("bashTool", () => {
  describe("metadata", () => {
    it("has name 'bash'", () => {
      expect(bashTool.name).toBe("bash");
    });

    it("has a description", () => {
      expect(bashTool.description).toBeDefined();
      expect(bashTool.description.length).toBeGreaterThan(0);
    });

    it("schema requires command string", () => {
      expect(bashTool.schema).toBeDefined();
    });
  });

  describe("success path", () => {
    it("calls exec with the command", async () => {
      mockSuccess("output");
      await bashTool.invoke({ command: "ls -la" });
      expect(mockExec).toHaveBeenCalledWith("ls -la", expect.any(Object), expect.any(Function));
    });

    it("passes encoding utf8", async () => {
      mockSuccess("output");
      await bashTool.invoke({ command: "echo hi" });
      expect(mockExec).toHaveBeenCalledWith(
        "echo hi",
        expect.objectContaining({ encoding: "utf8" }),
        expect.any(Function),
      );
    });

    it("passes timeout 30000", async () => {
      mockSuccess("output");
      await bashTool.invoke({ command: "echo hi" });
      expect(mockExec).toHaveBeenCalledWith(
        "echo hi",
        expect.objectContaining({ timeout: 30_000 }),
        expect.any(Function),
      );
    });

    it("passes maxBuffer 1048576", async () => {
      mockSuccess("output");
      await bashTool.invoke({ command: "echo hi" });
      expect(mockExec).toHaveBeenCalledWith(
        "echo hi",
        expect.objectContaining({ maxBuffer: 1048576 }),
        expect.any(Function),
      );
    });

    it("returns stdout string", async () => {
      mockSuccess("hello world\n");
      const result = await bashTool.invoke({ command: "echo hello world" });
      expect(result).toBe("hello world\n");
    });

    it("does not block the event loop (async execution)", async () => {
      // Verify exec is called (not execSync) — async means the event loop is free
      // while the child process runs
      let callbackCalled = false;
      mockExec.mockImplementation(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          // Simulate async: defer the callback
          Promise.resolve().then(() => {
            callbackCalled = true;
            cb(null, "async output", "");
          });
        },
      );
      const result = await bashTool.invoke({ command: "echo async" });
      expect(callbackCalled).toBe(true);
      expect(result).toBe("async output");
    });
  });

  describe("error handling", () => {
    it("throws on non-zero exit code", async () => {
      const err = new Error("Command failed");
      (err as Record<string, unknown>).status = 1;
      mockError(err);
      await expect(bashTool.invoke({ command: "false" })).rejects.toThrow();
    });

    it("preserves error message", async () => {
      mockError(new Error("Permission denied"));
      await expect(bashTool.invoke({ command: "restricted" })).rejects.toThrow("Permission denied");
    });

    it("throws on timeout", async () => {
      const err = new Error("TIMEOUT");
      (err as Record<string, unknown>).killed = true;
      mockError(err);
      await expect(bashTool.invoke({ command: "sleep 100" })).rejects.toThrow();
    });

    it("throws on maxBuffer exceeded", async () => {
      mockError(new Error("maxBuffer length exceeded"));
      await expect(bashTool.invoke({ command: "huge" })).rejects.toThrow("maxBuffer");
    });

    it("throws on command not found", async () => {
      mockError(new Error("Command not found: nonexistent"));
      await expect(bashTool.invoke({ command: "nonexistent" })).rejects.toThrow();
    });

    it("invokes exec even with empty command", async () => {
      mockSuccess("");
      await bashTool.invoke({ command: "" });
      expect(mockExec).toHaveBeenCalledWith("", expect.any(Object), expect.any(Function));
    });
  });
});
