# SPEC-03: Test Logging Infrastructure

## CONTEXT

### Problem Statement

The deep-factor-agent test suite runs via `vitest` but produces no persistent log output. After a test run, there is no JSON log file to inspect for pass/fail counts, test names, durations, or error details. We need a lightweight test logging infrastructure that writes structured JSON log files to `./logs/` after each test run.

### Derives From

| Source | What it provides |
|--------|-----------------|
| Plan: `abundant-snacking-sprout.md` | Test logging requirement — JSON logs in `./logs/`, format example |
| Smoke test step 9 | Expected log format: `{ suite, passed, failed }` per file |

### Relevant Files

| File | Purpose |
|------|---------|
| `packages/deep-factor-agent/package.json` | `"test": "vitest run"` — test runner config |
| `packages/deep-factor-agent/__tests__/*.test.ts` | Existing test files |
| `.gitignore` | Needs `logs/` entry |

---

## OVERVIEW

1. **Create `src/test-logger.ts`** — A simple JSON logger that writes test results to `./logs/`
2. **Create `__tests__/test-logger.test.ts`** — Unit tests for the logger
3. **Modify `.gitignore`** — Add `logs/` to prevent log files from being committed
4. **Create `vitest.setup.ts`** — Vitest globalSetup that hooks into the reporter to write logs after each run

---

## IMPLEMENTATION

### `src/test-logger.ts` — Test Logger

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface TestResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  error?: string;
}

export interface TestSuiteLog {
  suite: string;
  timestamp: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  tests: TestResult[];
}

export interface TestLoggerOptions {
  /** Directory to write log files. Default: "./logs" */
  logDir?: string;
}

/**
 * Write a test suite result as a JSON log file.
 * File name format: agent-<timestamp>-<suite>.json
 */
export function writeTestLog(
  suiteLog: TestSuiteLog,
  options?: TestLoggerOptions,
): string {
  const logDir = options?.logDir ?? "./logs";
  mkdirSync(logDir, { recursive: true });

  const sanitizedSuite = suiteLog.suite
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);

  const fileName = `agent-${timestamp}-${sanitizedSuite}.json`;
  const filePath = join(logDir, fileName);

  writeFileSync(filePath, JSON.stringify(suiteLog, null, 2) + "\n", "utf8");

  return filePath;
}

/**
 * Build a TestSuiteLog from individual test results.
 */
export function buildTestSuiteLog(
  suite: string,
  tests: TestResult[],
  totalDuration: number,
): TestSuiteLog {
  return {
    suite,
    timestamp: new Date().toISOString(),
    passed: tests.filter((t) => t.status === "passed").length,
    failed: tests.filter((t) => t.status === "failed").length,
    skipped: tests.filter((t) => t.status === "skipped").length,
    duration: totalDuration,
    tests,
  };
}
```

### `vitest.setup.ts` — Vitest Reporter Hook

Create a custom Vitest reporter that writes logs after the run completes:

```ts
import type { Reporter } from "vitest/reporters";
import type { File } from "vitest";
import { writeTestLog, buildTestSuiteLog } from "./src/test-logger.js";
import type { TestResult } from "./src/test-logger.js";

export default class TestLogReporter implements Reporter {
  onFinished(files?: File[]) {
    if (!files) return;

    for (const file of files) {
      const tests: TestResult[] = [];

      for (const task of file.tasks) {
        if (task.type === "test") {
          tests.push({
            name: task.name,
            status: task.result?.state === "pass"
              ? "passed"
              : task.result?.state === "fail"
                ? "failed"
                : "skipped",
            duration: task.result?.duration ?? 0,
            error: task.result?.errors?.[0]?.message,
          });
        }
      }

      const suiteName = file.name.replace(/\.test\.ts$/, "");
      const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0);
      const log = buildTestSuiteLog(suiteName, tests, totalDuration);
      writeTestLog(log);
    }
  }
}
```

Then update `vitest.config.ts` (or create it) to include the reporter:

```ts
// In vitest config (vitest.config.ts or package.json vitest section):
{
  reporters: ["default", "./vitest.setup.ts"]
}
```

### `.gitignore` — Add logs directory

Add `logs/` to the root `.gitignore`:

```
logs/
```

### `__tests__/test-logger.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { writeTestLog, buildTestSuiteLog } from "../src/test-logger.js";
import type { TestResult, TestSuiteLog } from "../src/test-logger.js";

const TEST_LOG_DIR = "./logs/__test_output__";

afterEach(() => {
  // Clean up test log directory
  if (existsSync(TEST_LOG_DIR)) {
    rmSync(TEST_LOG_DIR, { recursive: true, force: true });
  }
});

describe("buildTestSuiteLog", () => {
  it("counts passed, failed, and skipped tests", () => {
    const tests: TestResult[] = [
      { name: "test-1", status: "passed", duration: 10 },
      { name: "test-2", status: "failed", duration: 20, error: "boom" },
      { name: "test-3", status: "skipped", duration: 0 },
      { name: "test-4", status: "passed", duration: 15 },
    ];

    const log = buildTestSuiteLog("my-suite", tests, 45);

    expect(log.suite).toBe("my-suite");
    expect(log.passed).toBe(2);
    expect(log.failed).toBe(1);
    expect(log.skipped).toBe(1);
    expect(log.duration).toBe(45);
    expect(log.tests).toHaveLength(4);
    expect(log.timestamp).toBeTruthy();
  });
});

describe("writeTestLog", () => {
  it("creates the log directory and writes a JSON file", () => {
    const log = buildTestSuiteLog(
      "claude-cli",
      [{ name: "invoke test", status: "passed", duration: 50 }],
      50,
    );

    const filePath = writeTestLog(log, { logDir: TEST_LOG_DIR });

    expect(existsSync(filePath)).toBe(true);
    expect(filePath).toContain("agent-");
    expect(filePath).toContain("claude-cli");
    expect(filePath).toEndWith(".json");

    const content = JSON.parse(readFileSync(filePath, "utf8"));
    expect(content.suite).toBe("claude-cli");
    expect(content.passed).toBe(1);
    expect(content.failed).toBe(0);
    expect(content.tests).toHaveLength(1);
  });

  it("sanitizes suite name for filename", () => {
    const log = buildTestSuiteLog(
      "__tests__/providers/claude-cli.test",
      [{ name: "test", status: "passed", duration: 10 }],
      10,
    );

    const filePath = writeTestLog(log, { logDir: TEST_LOG_DIR });

    // No slashes or special chars in filename
    const fileName = filePath.split("/").pop()!;
    expect(fileName).not.toContain("/");
    expect(fileName).not.toContain("__");
    expect(fileName).toMatch(/^agent-.*\.json$/);
  });
});
```

---

## FILE STRUCTURE

### New
- `packages/deep-factor-agent/src/test-logger.ts`
- `packages/deep-factor-agent/__tests__/test-logger.test.ts`
- `packages/deep-factor-agent/vitest.setup.ts` (custom reporter)

### Modified
- `.gitignore` — Add `logs/`
- `packages/deep-factor-agent/package.json` or `vitest.config.ts` — Add custom reporter

---

## DESIGN DECISIONS

1. **JSON log format**: Each test suite produces one JSON file with `{ suite, timestamp, passed, failed, skipped, duration, tests }`. This is simple to parse, grep, and aggregate. JSON was chosen over plain text for machine readability — downstream scripts (like the smoke test in the plan) can use `jq` or `JSON.parse` to extract metrics.

2. **Custom Vitest reporter over `afterAll` hooks**: Using a Vitest reporter (`onFinished`) centralizes logging in one place rather than requiring each test file to import and call the logger. The reporter runs automatically after `vitest run` completes.

3. **File naming: `agent-<timestamp>-<suite>.json`**: Matches the plan's expected pattern (`logs/agent-*-claude-cli.json`). Timestamp-prefixed for chronological sorting. Suite name is sanitized (special chars → dashes) for filesystem safety.

4. **`logs/` in `.gitignore`**: Log files are ephemeral build artifacts. They should not be committed. The `.ralph/logs/` entry already exists; this adds a root-level `logs/` entry for test output.

5. **Sync fs operations**: `mkdirSync` and `writeFileSync` are used because the reporter's `onFinished` hook runs during test teardown where async operations may not complete reliably. The overhead is negligible for writing small JSON files.

---

## ACCEPTANCE CRITERIA

- [ ] `writeTestLog()` creates `./logs/` directory if it doesn't exist
- [ ] `writeTestLog()` writes a JSON file with the correct format (`suite`, `passed`, `failed`, `skipped`, `duration`, `tests`)
- [ ] File name matches pattern: `agent-<timestamp>-<suite>.json`
- [ ] Suite names with special characters are sanitized in filenames
- [ ] `buildTestSuiteLog()` correctly counts passed/failed/skipped tests
- [ ] Vitest reporter hooks into `onFinished` and writes logs for each test file
- [ ] `pnpm -C packages/deep-factor-agent test` produces JSON files in `./logs/`
- [ ] `logs/` is listed in `.gitignore`
- [ ] JSON files can be parsed: `cat logs/agent-*.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['suite'],d['passed'],d['failed'])"`
- [ ] All unit tests pass: `pnpm -C packages/deep-factor-agent test`
- [ ] Build succeeds: `pnpm -C packages/deep-factor-agent build`
