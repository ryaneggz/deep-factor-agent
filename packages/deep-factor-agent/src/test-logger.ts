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
 *
 * Creates the log directory if it doesn't exist. File name format:
 * `agent-<timestamp>-<suite>.json` where the suite name is sanitized
 * for filesystem safety (special chars replaced with dashes).
 */
export function writeTestLog(suiteLog: TestSuiteLog, options?: TestLoggerOptions): string {
  const logDir = options?.logDir ?? "./logs";
  mkdirSync(logDir, { recursive: true });

  const sanitizedSuite = suiteLog.suite
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);

  const fileName = `agent-${timestamp}-${sanitizedSuite}.json`;
  const filePath = join(logDir, fileName);

  writeFileSync(filePath, JSON.stringify(suiteLog, null, 2) + "\n", "utf8");

  return filePath;
}

/**
 * Build a TestSuiteLog from individual test results.
 *
 * Counts passed/failed/skipped from the test array and assembles
 * the complete log structure with a current timestamp.
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
