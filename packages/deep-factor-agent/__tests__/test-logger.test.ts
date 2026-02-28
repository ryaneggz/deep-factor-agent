import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { buildTestSuiteLog, writeTestLog } from "../src/test-logger.js";
import type { TestResult, TestSuiteLog } from "../src/test-logger.js";

const TEST_LOG_DIR = "./logs/test-logger-tests";

beforeEach(() => {
  // Clean up test log directory before each test
  if (existsSync(TEST_LOG_DIR)) {
    rmSync(TEST_LOG_DIR, { recursive: true });
  }
});

afterEach(() => {
  // Clean up after tests
  if (existsSync(TEST_LOG_DIR)) {
    rmSync(TEST_LOG_DIR, { recursive: true });
  }
});

describe("buildTestSuiteLog", () => {
  it("counts passed/failed/skipped tests correctly", () => {
    const tests: TestResult[] = [
      { name: "test1", status: "passed", duration: 10 },
      { name: "test2", status: "passed", duration: 20 },
      { name: "test3", status: "failed", duration: 15, error: "assertion error" },
      { name: "test4", status: "skipped", duration: 0 },
      { name: "test5", status: "passed", duration: 5 },
    ];

    const log = buildTestSuiteLog("my-suite", tests, 50);

    expect(log.suite).toBe("my-suite");
    expect(log.passed).toBe(3);
    expect(log.failed).toBe(1);
    expect(log.skipped).toBe(1);
    expect(log.duration).toBe(50);
    expect(log.tests).toHaveLength(5);
    expect(log.timestamp).toBeDefined();
  });

  it("handles empty test array", () => {
    const log = buildTestSuiteLog("empty-suite", [], 0);

    expect(log.passed).toBe(0);
    expect(log.failed).toBe(0);
    expect(log.skipped).toBe(0);
    expect(log.tests).toHaveLength(0);
  });

  it("includes ISO timestamp", () => {
    const log = buildTestSuiteLog("ts-suite", [], 0);

    // Verify it's a valid ISO string
    const date = new Date(log.timestamp);
    expect(date.getTime()).not.toBeNaN();
  });
});

describe("writeTestLog", () => {
  it("creates the log directory if it does not exist", () => {
    const log = buildTestSuiteLog("dir-test", [], 0);

    expect(existsSync(TEST_LOG_DIR)).toBe(false);
    writeTestLog(log, { logDir: TEST_LOG_DIR });
    expect(existsSync(TEST_LOG_DIR)).toBe(true);
  });

  it("writes a JSON file with correct structure", () => {
    const tests: TestResult[] = [{ name: "test1", status: "passed", duration: 42 }];
    const log = buildTestSuiteLog("json-test", tests, 42);

    const filePath = writeTestLog(log, { logDir: TEST_LOG_DIR });

    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content) as TestSuiteLog;

    expect(parsed.suite).toBe("json-test");
    expect(parsed.passed).toBe(1);
    expect(parsed.failed).toBe(0);
    expect(parsed.tests).toHaveLength(1);
    expect(parsed.tests[0].name).toBe("test1");
  });

  it("sanitizes suite name in filename", () => {
    const log = buildTestSuiteLog("My Suite/With Specials!", [], 0);
    const filePath = writeTestLog(log, { logDir: TEST_LOG_DIR });

    const fileName = filePath.split("/").pop()!;
    expect(fileName).toMatch(/^agent-.*-my-suite-with-specials-\.json$/);
    // No slashes, spaces, or exclamation marks in filename
    expect(fileName).not.toMatch(/[/\s!]/);
  });

  it("file name matches pattern: agent-<timestamp>-<suite>.json", () => {
    const log = buildTestSuiteLog("pattern-test", [], 0);
    const filePath = writeTestLog(log, { logDir: TEST_LOG_DIR });

    const fileName = filePath.split("/").pop()!;
    // Pattern: agent-YYYY-MM-DD_HH-MM-SS-pattern-test.json
    expect(fileName).toMatch(/^agent-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-pattern-test\.json$/);
  });

  it("JSON file is parseable with standard tools", () => {
    const tests: TestResult[] = [
      { name: "a", status: "passed", duration: 1 },
      { name: "b", status: "failed", duration: 2, error: "boom" },
    ];
    const log = buildTestSuiteLog("parseable", tests, 3);
    const filePath = writeTestLog(log, { logDir: TEST_LOG_DIR });

    const content = readFileSync(filePath, "utf8");
    expect(() => JSON.parse(content)).not.toThrow();

    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty("suite");
    expect(parsed).toHaveProperty("timestamp");
    expect(parsed).toHaveProperty("passed");
    expect(parsed).toHaveProperty("failed");
    expect(parsed).toHaveProperty("skipped");
    expect(parsed).toHaveProperty("duration");
    expect(parsed).toHaveProperty("tests");
  });
});
