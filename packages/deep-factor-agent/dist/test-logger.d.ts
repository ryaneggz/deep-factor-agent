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
export declare function writeTestLog(suiteLog: TestSuiteLog, options?: TestLoggerOptions): string;
/**
 * Build a TestSuiteLog from individual test results.
 *
 * Counts passed/failed/skipped from the test array and assembles
 * the complete log structure with a current timestamp.
 */
export declare function buildTestSuiteLog(suite: string, tests: TestResult[], totalDuration: number): TestSuiteLog;
//# sourceMappingURL=test-logger.d.ts.map