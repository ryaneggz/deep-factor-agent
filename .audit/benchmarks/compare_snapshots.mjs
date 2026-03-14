#!/usr/bin/env node
// Compares baseline.json vs current.json and produces a report with gate checks.
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const snapshotsDir = resolve(__dirname, "snapshots");

const baseline = JSON.parse(readFileSync(resolve(snapshotsDir, "baseline.json"), "utf-8"));
const current = JSON.parse(readFileSync(resolve(snapshotsDir, "current.json"), "utf-8"));

// Gate definitions
const GATES = {
  total_cc:              { direction: "decrease", max_regression: 0.05, label: "Total CC" },
  avg_cc:                { direction: "decrease", max_regression: 0.05, label: "Average CC" },
  total_cognitive:       { direction: "decrease", max_regression: 0.05, label: "Total Cognitive" },
  total_duplication_pct: { direction: "decrease", max_regression: 0.02, label: "Duplication %" },
  test_pass_rate:        { direction: "increase", max_regression: 0.00, label: "Test Pass Rate" },
  test_count:            { direction: "increase", max_regression: 0.00, label: "Test Count" },
};

// Compute deltas
const results = [];
let allPass = true;

for (const [key, gate] of Object.entries(GATES)) {
  const bVal = baseline.totals[key] ?? 0;
  const cVal = current.totals[key] ?? 0;
  const delta = cVal - bVal;
  const pctChange = bVal !== 0 ? ((cVal - bVal) / bVal) : 0;

  let status = "PASS";
  if (gate.direction === "decrease") {
    // Value should decrease. Regression = increase beyond tolerance
    if (pctChange > gate.max_regression) {
      status = "FAIL";
      allPass = false;
    }
  } else {
    // Value should increase. Regression = decrease beyond tolerance
    if (-pctChange > gate.max_regression) {
      status = "FAIL";
      allPass = false;
    }
  }

  results.push({
    metric: gate.label,
    baseline: bVal,
    current: cVal,
    delta,
    pctChange: (pctChange * 100).toFixed(1) + "%",
    gate: `${gate.direction} (max regression: ${(gate.max_regression * 100).toFixed(0)}%)`,
    status,
  });
}

// Per-file changes (top movers by composite delta)
const fileChanges = [];
const allFiles = new Set([...Object.keys(baseline.files), ...Object.keys(current.files)]);
for (const file of allFiles) {
  const bFile = baseline.files[file];
  const cFile = current.files[file];
  if (!bFile && cFile) {
    fileChanges.push({ file, status: "NEW", ccDelta: cFile.cc, cogDelta: cFile.cognitive, compositeDelta: cFile.composite });
  } else if (bFile && !cFile) {
    fileChanges.push({ file, status: "REMOVED", ccDelta: -bFile.cc, cogDelta: -bFile.cognitive, compositeDelta: -bFile.composite });
  } else if (bFile && cFile) {
    const ccDelta = cFile.cc - bFile.cc;
    const cogDelta = cFile.cognitive - bFile.cognitive;
    const compositeDelta = (cFile.composite ?? 0) - (bFile.composite ?? 0);
    if (ccDelta !== 0 || cogDelta !== 0) {
      fileChanges.push({ file, status: "CHANGED", ccDelta, cogDelta, compositeDelta });
    }
  }
}
fileChanges.sort((a, b) => Math.abs(b.compositeDelta) - Math.abs(a.compositeDelta));

// Build report
const verdict = allPass ? "PASS" : "FAIL";
let report = `# Benchmark Report\n\n`;
report += `**Verdict: ${verdict}**\n\n`;
report += `| Baseline | Current |\n|---|---|\n`;
report += `| ${baseline.git_sha} | ${current.git_sha} |\n`;
report += `| ${baseline.timestamp} | ${current.timestamp} |\n\n`;

report += `## Aggregate Gates\n\n`;
report += `| Metric | Baseline | Current | Delta | % Change | Gate | Status |\n`;
report += `|--------|----------|---------|-------|----------|------|--------|\n`;
for (const r of results) {
  const emoji = r.status === "PASS" ? "PASS" : "FAIL";
  report += `| ${r.metric} | ${r.baseline} | ${r.current} | ${r.delta >= 0 ? "+" : ""}${r.delta} | ${r.pctChange} | ${r.gate} | ${emoji} |\n`;
}

if (fileChanges.length > 0) {
  report += `\n## Per-File Changes (Top Movers)\n\n`;
  report += `| File | Status | CC Delta | Cognitive Delta | Composite Delta |\n`;
  report += `|------|--------|----------|-----------------|------------------|\n`;
  for (const fc of fileChanges.slice(0, 20)) {
    report += `| ${fc.file} | ${fc.status} | ${fc.ccDelta >= 0 ? "+" : ""}${fc.ccDelta} | ${fc.cogDelta >= 0 ? "+" : ""}${fc.cogDelta} | ${fc.compositeDelta >= 0 ? "+" : ""}${fc.compositeDelta.toFixed(1)} |\n`;
  }
}

report += `\n## Summary\n\n`;
report += `- Files analyzed: baseline=${baseline.totals.files_analyzed}, current=${current.totals.files_analyzed}\n`;
report += `- Tests: baseline=${baseline.totals.test_count}, current=${current.totals.test_count}\n`;
report += `- Total CC: baseline=${baseline.totals.total_cc}, current=${current.totals.total_cc}\n`;
report += `- Verdict: **${verdict}**\n`;

writeFileSync(resolve(__dirname, "report.md"), report);
console.log(`Verdict: ${verdict}`);
console.log(`Report saved to .audit/benchmarks/report.md`);
process.exit(allPass ? 0 : 1);
