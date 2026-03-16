import { describe, expect, it } from "vitest";
import { execFileSync, execFile, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import type { UnifiedLogEntry, InitLog, ResultLog } from "deep-factor-agent";
import { parseLogLines } from "deep-factor-agent";

// Load env vars so OPENAI_API_KEY is available for langchain tests
config({ path: join(homedir(), ".env", "deep-factor-agent", ".env") });

const CLI_PATH = join(import.meta.dirname, "..", "dist", "cli.js");
const OUTPUT_DIR = join(import.meta.dirname, "..", "logs", "output");

// ── Auth detection helpers ──────────────────────────────────────────

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

function hasRuskaAuth(): boolean {
  try {
    const raw = readFileSync(join(homedir(), ".ruska", "auth.json"), "utf-8");
    const parsed = JSON.parse(raw) as { host?: string; apiKey?: string };
    return Boolean(parsed.host) && Boolean(parsed.apiKey);
  } catch {
    return false;
  }
}

// ── CLI helpers ─────────────────────────────────────────────────────

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
  const outputPath = join(OUTPUT_DIR, `${name}.jsonl`);
  writeFileSync(outputPath, result.stdout, "utf8");
  return { ...result, outputPath };
}

// ── Shared validation ───────────────────────────────────────────────

function validateStreamJson(entries: UnifiedLogEntry[], expectedProvider: string): void {
  // 1. At least 3 entries (init + intermediate + result)
  expect(entries.length).toBeGreaterThanOrEqual(3);

  // 2. First entry is type "init" with matching provider, non-empty model and mode
  const first = entries[0] as InitLog;
  expect(first.type).toBe("init");
  expect(first.provider).toBe(expectedProvider);
  expect(first.model).toBeTruthy();
  expect(first.mode).toBeTruthy();

  // 3. Last entry is type "result" with expected fields
  const last = entries[entries.length - 1] as ResultLog;
  expect(last.type).toBe("result");
  expect(last.content).toBeTruthy();
  expect(last.stopReason).toBeTruthy();
  expect(last.usage).toBeTruthy();
  expect(last.iterations).toBeGreaterThanOrEqual(1);

  // 4. All entries share the same sessionId
  const sessionId = first.sessionId;
  expect(sessionId).toBeTruthy();
  for (const entry of entries) {
    expect(entry.sessionId).toBe(sessionId);
  }

  // 5. All entries have valid timestamp > 0
  for (const entry of entries) {
    expect(entry.timestamp).toBeGreaterThan(0);
  }

  // 6. Sequence values are monotonically increasing
  for (let i = 1; i < entries.length; i++) {
    expect(entries[i].sequence).toBeGreaterThan(entries[i - 1].sequence);
  }

  // 7. If tool_call entries exist, validate their structure
  const toolCalls = entries.filter((e) => e.type === "tool_call");
  for (const tc of toolCalls) {
    const t = tc as { toolName?: string; toolCallId?: string };
    expect(t.toolName).toBeTruthy();
    expect(t.toolCallId).toBeTruthy();
  }

  // 8. User message contains the full XML context window
  const userMessages = entries.filter(
    (e) => e.type === "message" && (e as { role?: string }).role === "user",
  );
  expect(userMessages.length).toBeGreaterThanOrEqual(1);
  const userContent = (userMessages[0] as { content: string }).content;
  expect(userContent).toContain("<thread>");
  expect(userContent).toContain("</thread>");
}

// ── Test blocks ─────────────────────────────────────────────────────

describe.skipIf(!hasOpenAIKey())("stream-json: langchain provider", () => {
  it("produces valid JSONL matching UnifiedLogEntry schema", async () => {
    const result = await runAndCapture("stream-json-langchain", [
      "-p",
      "-i",
      "3",
      "-o",
      "stream-json",
      "Get the local dir with pwd, and fetch local system time",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).not.toMatch(/Error:|SyntaxError|TypeError/);

    // Every stdout line parses as valid JSON
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    const entries = parseLogLines(result.stdout);
    validateStreamJson(entries, "langchain");
  }, 60_000);
});

describe.skipIf(!hasClaudeAuth())("stream-json: claude provider", () => {
  it("produces valid JSONL matching UnifiedLogEntry schema", async () => {
    const result = await runAndCapture("stream-json-claude", [
      "--provider",
      "claude",
      "-p",
      "-i",
      "3",
      "-o",
      "stream-json",
      "Get the local dir with pwd, and fetch local system time",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).not.toMatch(/Error:|SyntaxError|TypeError/);

    const lines = result.stdout.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    const entries = parseLogLines(result.stdout);
    validateStreamJson(entries, "claude");
  }, 60_000);
});

describe.skipIf(!(hasCodexAuth() && supportsDefaultCodexModel()))(
  "stream-json: codex provider",
  () => {
    it("produces valid JSONL matching UnifiedLogEntry schema", async () => {
      const result = await runAndCapture("stream-json-codex", [
        "--provider",
        "codex",
        "-p",
        "-i",
        "3",
        "-o",
        "stream-json",
        "Get the local dir with pwd, and fetch local system time",
      ]);

      expect(result.code).toBe(0);
      expect(result.stderr).not.toMatch(/Error:|SyntaxError|TypeError/);

      const lines = result.stdout.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }

      const entries = parseLogLines(result.stdout);
      validateStreamJson(entries, "codex");
    }, 60_000);
  },
);

describe.skipIf(!hasRuskaAuth())("stream-json: ruska provider", () => {
  it("produces valid JSONL matching UnifiedLogEntry schema", async () => {
    const result = await runAndCapture(
      "stream-json-ruska",
      [
        "--provider",
        "ruska",
        "-p",
        "-i",
        "3",
        "-o",
        "stream-json",
        "Get the local dir with pwd, and fetch local system time",
      ],
      180_000,
    );

    expect(result.code).toBe(0);
    expect(result.stderr).not.toMatch(/Error:|SyntaxError|TypeError/);

    const lines = result.stdout.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    const entries = parseLogLines(result.stdout);
    validateStreamJson(entries, "ruska");
  }, 180_000);
});
