import { describe, expect, it } from "vitest";
import { execFileSync, execFile } from "node:child_process";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dirname, "..", "dist", "cli.js");

function hasClaudeAuth(): boolean {
  try {
    const output = execFileSync("claude", ["auth", "status"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(output) as { loggedIn?: boolean };
    return parsed.loggedIn === true;
  } catch {
    return false;
  }
}

function run(
  args: string[],
  timeout = 30_000,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = execFile("node", [CLI_PATH, ...args], { timeout }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        code: error ? ((error as { code?: number }).code ?? child.exitCode ?? 1) : 0,
      });
    });
    child.stdin?.end();
  });
}

describe.skipIf(!hasClaudeAuth())("Claude CLI smoke", () => {
  it("runs print mode through the Claude CLI wrapper", async () => {
    const result = await run(["--provider", "claude", "-p", "Reply with exactly: hello"]);
    expect(result.code).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("hello");
  }, 30_000);

  it("passes an explicit Claude model alias through the wrapper", async () => {
    const result = await run([
      "--provider",
      "claude",
      "--model",
      "sonnet",
      "-p",
      "Reply with exactly: world",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("world");
  }, 30_000);

  it("keeps codex explicitly unsupported", async () => {
    const result = await run(["--provider", "codex", "-p", "test"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr.toLowerCase()).toContain("coming soon");
  });

  it("completes tool-requesting prompts without depending on Claude built-in tools", async () => {
    const result = await run(
      [
        "--provider",
        "claude",
        "-p",
        "Use the bash tool to run git status and summarize the result.",
      ],
      45_000,
    );

    expect(result.code).toBe(0);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
    expect(result.stderr).toBe("");
  }, 45_000);
});
