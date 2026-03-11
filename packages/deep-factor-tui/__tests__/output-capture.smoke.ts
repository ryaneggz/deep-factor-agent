import { describe, expect, it } from "vitest";
import { execFileSync, execFile } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const CLI_PATH = join(import.meta.dirname, "..", "dist", "cli.js");
const OUTPUT_DIR = join(import.meta.dirname, "output");

function hasOpenAIKey(): boolean {
  return typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.length > 0;
}

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
  timeout = 60_000,
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

function runWithStdin(
  stdin: string,
  args: string[],
  timeout = 60_000,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = execFile("node", [CLI_PATH, ...args], { timeout }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        code: error ? ((error as { code?: number }).code ?? child.exitCode ?? 1) : 0,
      });
    });
    child.stdin?.write(stdin);
    child.stdin?.end();
  });
}

function logResult(
  label: string,
  result: { stdout: string; stderr: string; code: number | null },
): void {
  console.log(`\n┌─── ${label} (exit ${result.code}) ───`);
  console.log(`│ stdout: ${result.stdout.trim() || "(empty)"}`);
  if (result.stderr) console.log(`│ stderr: ${result.stderr.trim()}`);
  console.log(`└${"─".repeat(40)}`);
}

async function runAndCapture(
  name: string,
  args: string[],
  timeout = 60_000,
): Promise<{ stdout: string; stderr: string; code: number | null; outputPath: string }> {
  const result = await run(args, timeout);
  logResult(name, result);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = join(OUTPUT_DIR, `${name}.txt`);
  writeFileSync(outputPath, result.stdout, "utf8");
  return { ...result, outputPath };
}

describe.skipIf(!hasOpenAIKey())("langchain provider output capture", () => {
  it("math prompt → file contains answer", async () => {
    const result = await runAndCapture("langchain-math", [
      "-p",
      "-i",
      "1",
      "What is 2+2? Reply with just the number.",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("4");
    expect(result.stderr).toBe("");
  }, 60_000);

  it("greeting prompt → file contains greeting", async () => {
    const result = await runAndCapture("langchain-greeting", [
      "-p",
      "-i",
      "1",
      "Say hello in one word.",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("hello");
  }, 60_000);

  it("stdin pipe mode works", async () => {
    const result = await runWithStdin("What is 2+2? Reply with just the number.", [
      "-p",
      "-i",
      "1",
    ]);
    logResult("langchain-stdin", result);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("4");
  }, 60_000);

  it("output contains no error patterns", async () => {
    const result = await runAndCapture("langchain-no-errors", ["-p", "-i", "1", "Say hi."]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
    expect(result.stdout).not.toMatch(/Error:|SyntaxError|TypeError/);
    expect(result.stderr).toBe("");
  }, 60_000);
});

describe.skipIf(!hasClaudeAuth())("claude provider output capture", () => {
  it("math prompt → file contains answer", async () => {
    const result = await runAndCapture("claude-math", [
      "--provider",
      "claude",
      "-p",
      "-i",
      "1",
      "What is 2+2? Reply with just the number.",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("4");
  }, 60_000);
});
