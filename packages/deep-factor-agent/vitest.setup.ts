import { writeTestLog, buildTestSuiteLog } from "./src/test-logger.js";
import type { TestResult } from "./src/test-logger.js";

/**
 * Recursively collect test results from a Vitest 4 test module's children.
 * Test modules contain test suites and test cases in a tree structure.
 */
function collectTests(children: Iterable<any>): TestResult[] {
  const results: TestResult[] = [];

  for (const child of children) {
    if (child.type === "test") {
      const result = child.result();
      results.push({
        name: child.name,
        status:
          result?.state === "passed"
            ? "passed"
            : result?.state === "failed"
              ? "failed"
              : "skipped",
        duration: result?.duration ?? 0,
        error: result?.errors?.[0]?.message,
      });
    } else if (child.type === "suite" && child.children) {
      results.push(...collectTests(child.children));
    }
  }

  return results;
}

/**
 * Custom Vitest 4 reporter that writes structured JSON log files after each
 * test run. Each test module produces one log file in `./logs/` with pass/fail
 * counts, durations, and error details.
 *
 * Registered in vitest.config.ts alongside the default reporter so normal
 * terminal output is preserved.
 */
export default class TestLogReporter {
  onTestRunEnd(testModules: any[]) {
    if (!testModules) return;

    for (const mod of testModules) {
      const tests = collectTests(mod.children);

      // Extract file name from the module
      const fileName = (mod.moduleId ?? mod.id ?? "unknown")
        .replace(/.*[\\/]/, "")
        .replace(/\.test\.ts$/, "");

      const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0);
      const log = buildTestSuiteLog(fileName, tests, totalDuration);
      writeTestLog(log);
    }
  }
}
