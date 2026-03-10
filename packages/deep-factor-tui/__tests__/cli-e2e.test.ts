import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dirname, "..", "dist", "cli.js");

function run(
  args: string[],
  timeout = 5000,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = execFile("node", [CLI_PATH, ...args], { timeout }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        code: error ? ((error as any).code ?? child.exitCode ?? 1) : 0,
      });
    });
    // Close stdin so the child gets EOF immediately (prevents hanging on stdin read)
    child.stdin?.end();
  });
}

describe("TUI startup e2e", () => {
  it("starts without JS crash errors", async () => {
    // Spawn in default TUI mode (no -p), close stdin immediately, and let it time out.
    // We only check that there are no JS crash errors in stderr.
    const result = await run([], 3000);
    const stderr = result.stderr;
    expect(stderr).not.toContain("SyntaxError");
    expect(stderr).not.toContain("Cannot find module");
    expect(stderr).not.toContain("ReferenceError");
    expect(stderr).not.toContain("TypeError");
  });
});

describe("CLI e2e", () => {
  it("-p without a prompt exits with code 1 and prints error to stderr", async () => {
    const result = await run(["-p"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("requires a prompt");
  });

  it("--help outputs usage text with --print, --sandbox, and codex provider help", async () => {
    const result = await run(["--help"]);
    const output = result.stdout + result.stderr;
    expect(output).toContain("--print");
    expect(output).toContain("--sandbox");
    expect(output).toContain("langchain, claude, codex");
    expect(output).not.toContain("--parallel");
  });

  it("-p is recognized as --print (not --parallel)", async () => {
    // -p without prompt should give the print-mode error, confirming -p maps to --print
    const result = await run(["-p"]);
    expect(result.stderr).toContain("requires a prompt");
  });

  it("--provider codex is accepted by CLI validation", async () => {
    const result = await run(["--provider", "codex", "-p"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("requires a prompt");
    expect(result.stderr).not.toContain('Provider "codex" is not supported yet');
    expect(result.stderr).not.toContain('Invalid provider "codex"');
  });

  it("--provider claude-sdk remains accepted as a compatibility alias", async () => {
    const result = await run(["--provider", "claude-sdk", "-p"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("requires a prompt");
    expect(result.stderr).not.toContain('Invalid provider "claude-sdk"');
  });

  it("invalid provider errors include codex in the allowed list", async () => {
    const result = await run(["--provider", "nope", "-p"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Invalid provider "nope"');
    expect(result.stderr).toContain("langchain, claude, codex");
  });
});
