import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("deep-factor-agent", () => ({
  createLangChainTool: vi.fn(
    (name: string, opts: { description: string; schema: unknown; execute: (args: Record<string, unknown>) => Promise<string> }) => ({
      name,
      description: opts.description,
      schema: opts.schema,
      invoke: async (args: Record<string, unknown>) => opts.execute(args),
    }),
  ),
}));

import { bashTool } from "../../src/tools/bash.js";
import { execSync } from "child_process";

const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

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
    it("calls execSync with the command", async () => {
      mockExecSync.mockReturnValueOnce("output");
      await bashTool.invoke({ command: "ls -la" });
      expect(mockExecSync).toHaveBeenCalledWith("ls -la", expect.any(Object));
    });

    it("passes encoding utf8", async () => {
      mockExecSync.mockReturnValueOnce("output");
      await bashTool.invoke({ command: "echo hi" });
      expect(mockExecSync).toHaveBeenCalledWith(
        "echo hi",
        expect.objectContaining({ encoding: "utf8" }),
      );
    });

    it("passes timeout 30000", async () => {
      mockExecSync.mockReturnValueOnce("output");
      await bashTool.invoke({ command: "echo hi" });
      expect(mockExecSync).toHaveBeenCalledWith(
        "echo hi",
        expect.objectContaining({ timeout: 30_000 }),
      );
    });

    it("passes maxBuffer 1048576", async () => {
      mockExecSync.mockReturnValueOnce("output");
      await bashTool.invoke({ command: "echo hi" });
      expect(mockExecSync).toHaveBeenCalledWith(
        "echo hi",
        expect.objectContaining({ maxBuffer: 1048576 }),
      );
    });

    it("returns stdout string", async () => {
      mockExecSync.mockReturnValueOnce("hello world\n");
      const result = await bashTool.invoke({ command: "echo hello world" });
      expect(result).toBe("hello world\n");
    });
  });

  describe("error handling", () => {
    it("throws on non-zero exit code", async () => {
      const err = new Error("Command failed");
      (err as Record<string, unknown>).status = 1;
      mockExecSync.mockImplementationOnce(() => {
        throw err;
      });
      await expect(bashTool.invoke({ command: "false" })).rejects.toThrow();
    });

    it("preserves error message", async () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("Permission denied");
      });
      await expect(
        bashTool.invoke({ command: "restricted" }),
      ).rejects.toThrow("Permission denied");
    });

    it("throws on timeout", async () => {
      const err = new Error("TIMEOUT");
      (err as Record<string, unknown>).killed = true;
      mockExecSync.mockImplementationOnce(() => {
        throw err;
      });
      await expect(
        bashTool.invoke({ command: "sleep 100" }),
      ).rejects.toThrow();
    });

    it("throws on maxBuffer exceeded", async () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("maxBuffer length exceeded");
      });
      await expect(bashTool.invoke({ command: "huge" })).rejects.toThrow(
        "maxBuffer",
      );
    });

    it("throws on command not found", async () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("Command not found: nonexistent");
      });
      await expect(
        bashTool.invoke({ command: "nonexistent" }),
      ).rejects.toThrow();
    });

    it("invokes execSync even with empty command", async () => {
      mockExecSync.mockReturnValueOnce("");
      await bashTool.invoke({ command: "" });
      expect(mockExecSync).toHaveBeenCalledWith("", expect.any(Object));
    });
  });
});
