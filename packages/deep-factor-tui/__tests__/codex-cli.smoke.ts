import { describe, expect, it } from "vitest";
import { spawnSync, execFile } from "node:child_process";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dirname, "..", "dist", "cli.js");

function hasCodexAuth(): boolean {
  const result = spawnSync("codex", ["login", "status"], {
    encoding: "utf8",
  });
  const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`.toLowerCase();
  return result.status === 0 && combinedOutput.includes("logged in");
}

function supportsDefaultCodexModel(): boolean {
  const result = spawnSync(
    "codex",
    [
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--model",
      "gpt-5.4",
      "Reply with exactly: ok",
    ],
    {
      encoding: "utf8",
      timeout: 20_000,
    },
  );
  const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`.toLowerCase();

  if (combinedOutput.includes("model is not supported")) {
    return false;
  }

  return result.status === 0;
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

describe.skipIf(!(hasCodexAuth() && supportsDefaultCodexModel()))("Codex CLI smoke", () => {
  it("runs print mode through the Codex CLI wrapper", async () => {
    const result = await run(["--provider", "codex", "-p", "Reply with exactly: hello"]);
    expect(result.code).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("hello");
  }, 30_000);

  it("passes an explicit Codex model through the wrapper", async () => {
    const result = await run([
      "--provider",
      "codex",
      "--model",
      "gpt-5.4",
      "-p",
      "Reply with exactly: world",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("world");
  }, 30_000);

  it("routes tool-using prompts through Deep Factor instead of Codex native execution", async () => {
    const result = await run(
      [
        "--provider",
        "codex",
        "-p",
        "Use the bash tool to run `printf codex-smoke` and then respond with exactly the command output.",
      ],
      45_000,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("codex-smoke");
    expect(result.stderr).toBe("");
  }, 45_000);
});
