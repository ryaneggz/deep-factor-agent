#!/usr/bin/env node
// Compute composite complexity ranking from collected metrics
// Fresh audit: 2026-03-23

const files = [
  // Agent package
  {
    file: "packages/deep-factor-agent/src/agent.ts",
    cc: 111,
    nesting: 10,
    imports: 17,
    churn: 19,
    loc: 1421,
    any: 1,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/providers/claude-cli.ts",
    cc: 33,
    nesting: 7,
    imports: 9,
    churn: 9,
    loc: 548,
    any: 1,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/providers/cli-shared.ts",
    cc: 32,
    nesting: 5,
    imports: 3,
    churn: 0,
    loc: 130,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/providers/claude-agent-sdk.ts",
    cc: 51,
    nesting: 8,
    imports: 5,
    churn: 1,
    loc: 359,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/tool-display.ts",
    cc: 40,
    nesting: 4,
    imports: 1,
    churn: 3,
    loc: 329,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/log-mappers/replay.ts",
    cc: 31,
    nesting: 5,
    imports: 2,
    churn: 2,
    loc: 283,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/providers/codex-cli.ts",
    cc: 7,
    nesting: 8,
    imports: 9,
    churn: 5,
    loc: 290,
    any: 1,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/providers/messages-to-xml.ts",
    cc: 22,
    nesting: 7,
    imports: 4,
    churn: 3,
    loc: 132,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/log-mappers/langchain-mapper.ts",
    cc: 21,
    nesting: 8,
    imports: 4,
    churn: 2,
    loc: 233,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/log-mappers/claude-mapper.ts",
    cc: 21,
    nesting: 9,
    imports: 3,
    churn: 1,
    loc: 167,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/xml-serializer.ts",
    cc: 16,
    nesting: 7,
    imports: 1,
    churn: 2,
    loc: 92,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/log-mappers/codex-mapper.ts",
    cc: 13,
    nesting: 7,
    imports: 3,
    churn: 1,
    loc: 123,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/context-manager.ts",
    cc: 12,
    nesting: 6,
    imports: 4,
    churn: 4,
    loc: 109,
    any: 1,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/stop-conditions.ts",
    cc: 11,
    nesting: 5,
    imports: 1,
    churn: 2,
    loc: 152,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/middleware.ts",
    cc: 0,
    nesting: 1,
    imports: 4,
    churn: 3,
    loc: 112,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/unified-log.ts",
    cc: 0,
    nesting: 2,
    imports: 1,
    churn: 2,
    loc: 187,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/tool-adapter.ts",
    cc: 4,
    nesting: 3,
    imports: 4,
    churn: 2,
    loc: 57,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/types.ts",
    cc: 0,
    nesting: 2,
    imports: 3,
    churn: 9,
    loc: 254,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/create-agent.ts",
    cc: 0,
    nesting: 3,
    imports: 5,
    churn: 6,
    loc: 24,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/human-in-the-loop.ts",
    cc: 0,
    nesting: 2,
    imports: 2,
    churn: 0,
    loc: 34,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/test-logger.ts",
    cc: 0,
    nesting: 3,
    imports: 2,
    churn: 0,
    loc: 46,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/index.ts",
    cc: 0,
    nesting: 1,
    imports: 0,
    churn: 11,
    loc: 149,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/providers/types.ts",
    cc: 0,
    nesting: 1,
    imports: 4,
    churn: 0,
    loc: 47,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/log-mappers/types.ts",
    cc: 0,
    nesting: 1,
    imports: 2,
    churn: 0,
    loc: 11,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-agent/src/log-mappers/index.ts",
    cc: 0,
    nesting: 1,
    imports: 0,
    churn: 0,
    loc: 7,
    any: 0,
    duplication: 0,
  },
  // TUI package
  {
    file: "packages/deep-factor-tui/src/hooks/useAgent.ts",
    cc: 31,
    nesting: 6,
    imports: 7,
    churn: 21,
    loc: 460,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/transcript.ts",
    cc: 23,
    nesting: 3,
    imports: 3,
    churn: 5,
    loc: 308,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/events-to-messages.ts",
    cc: 23,
    nesting: 7,
    imports: 2,
    churn: 1,
    loc: 208,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/PendingInputPanel.tsx",
    cc: 27,
    nesting: 7,
    imports: 5,
    churn: 2,
    loc: 263,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/hooks/useTextInput.ts",
    cc: 21,
    nesting: 5,
    imports: 5,
    churn: 7,
    loc: 160,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/cli.tsx",
    cc: 18,
    nesting: 5,
    imports: 7,
    churn: 14,
    loc: 232,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/session-logger.ts",
    cc: 17,
    nesting: 6,
    imports: 9,
    churn: 10,
    loc: 222,
    any: 2,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/TranscriptSegment.tsx",
    cc: 14,
    nesting: 5,
    imports: 8,
    churn: 9,
    loc: 189,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/print.ts",
    cc: 12,
    nesting: 5,
    imports: 9,
    churn: 9,
    loc: 165,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/MessageBubble.tsx",
    cc: 9,
    nesting: 6,
    imports: 10,
    churn: 10,
    loc: 80,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/StatusLine.tsx",
    cc: 9,
    nesting: 3,
    imports: 4,
    churn: 3,
    loc: 55,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/tools/file-utils.ts",
    cc: 7,
    nesting: 4,
    imports: 4,
    churn: 1,
    loc: 217,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/app.tsx",
    cc: 6,
    nesting: 4,
    imports: 12,
    churn: 15,
    loc: 134,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/provider-resolution.ts",
    cc: 5,
    nesting: 4,
    imports: 4,
    churn: 5,
    loc: 48,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/theme.ts",
    cc: 5,
    nesting: 2,
    imports: 0,
    churn: 0,
    loc: 19,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/tools/bash.ts",
    cc: 3,
    nesting: 4,
    imports: 3,
    churn: 0,
    loc: 38,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/types.ts",
    cc: 0,
    nesting: 2,
    imports: 1,
    churn: 14,
    loc: 171,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/LiveSection.tsx",
    cc: 0,
    nesting: 3,
    imports: 8,
    churn: 6,
    loc: 84,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/StatusIndicator.tsx",
    cc: 1,
    nesting: 4,
    imports: 2,
    churn: 0,
    loc: 32,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/InputBar.tsx",
    cc: 0,
    nesting: 4,
    imports: 3,
    churn: 7,
    loc: 74,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/ThinkingBlock.tsx",
    cc: 0,
    nesting: 3,
    imports: 2,
    churn: 0,
    loc: 32,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/HotkeyMenu.tsx",
    cc: 0,
    nesting: 3,
    imports: 2,
    churn: 0,
    loc: 34,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/TranscriptTurn.tsx",
    cc: 0,
    nesting: 4,
    imports: 6,
    churn: 0,
    loc: 35,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/ToolCallBlock.tsx",
    cc: 0,
    nesting: 2,
    imports: 4,
    churn: 0,
    loc: 14,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/SummaryBlock.tsx",
    cc: 0,
    nesting: 2,
    imports: 2,
    churn: 0,
    loc: 21,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/PlanBlock.tsx",
    cc: 0,
    nesting: 3,
    imports: 2,
    churn: 0,
    loc: 16,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/components/Header.tsx",
    cc: 0,
    nesting: 2,
    imports: 2,
    churn: 0,
    loc: 14,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/default-agent-instructions.ts",
    cc: 0,
    nesting: 0,
    imports: 0,
    churn: 0,
    loc: 7,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/tools/default-tools.ts",
    cc: 0,
    nesting: 1,
    imports: 5,
    churn: 0,
    loc: 8,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/tools/write-file.ts",
    cc: 0,
    nesting: 3,
    imports: 3,
    churn: 0,
    loc: 13,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/tools/read-file.ts",
    cc: 0,
    nesting: 4,
    imports: 3,
    churn: 0,
    loc: 17,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/tools/edit-file.ts",
    cc: 0,
    nesting: 3,
    imports: 3,
    churn: 0,
    loc: 16,
    any: 0,
    duplication: 0,
  },
  {
    file: "packages/deep-factor-tui/src/index.ts",
    cc: 0,
    nesting: 1,
    imports: 0,
    churn: 0,
    loc: 2,
    any: 0,
    duplication: 0,
  },
];

// Compute cognitive complexity: CC * (1 + nesting/3) — penalizes deep nesting
files.forEach((f) => {
  f.cognitive = Math.round(f.cc * (1 + f.nesting / 3));
});

// Compute coupling instability: Ce / (Ce + Ca_estimate)
// Ca (afferent) = how many other files import this file
// Ce = imports count; Ca approximated from churn as proxy for usage
files.forEach((f) => {
  const ce = f.imports;
  const ca = Math.max(1, Math.floor(f.churn / 3));
  f.coupling = +(ce / (ca + ce)).toFixed(2);
});

// Churn x CC
files.forEach((f) => {
  f.churnCC = f.churn * f.cc;
});

// Find maxes for normalization
const maxCC = Math.max(...files.map((f) => f.cc));
const maxCog = Math.max(...files.map((f) => f.cognitive));
const maxCoupling = Math.max(...files.map((f) => f.coupling));
const maxChurnCC = Math.max(...files.map((f) => f.churnCC));
const maxDup = Math.max(...files.map((f) => f.duplication));

// Normalize to 0-100 and compute composite
files.forEach((f) => {
  const ccN = maxCC > 0 ? (f.cc / maxCC) * 100 : 0;
  const cogN = maxCog > 0 ? (f.cognitive / maxCog) * 100 : 0;
  const coupN = maxCoupling > 0 ? (f.coupling / maxCoupling) * 100 : 0;
  const churnN = maxChurnCC > 0 ? (f.churnCC / maxChurnCC) * 100 : 0;
  const dupN = maxDup > 0 ? (f.duplication / maxDup) * 100 : 0;

  f.composite = +(ccN * 0.3 + cogN * 0.25 + coupN * 0.2 + churnN * 0.15 + dupN * 0.1).toFixed(1);
  f._ccN = +ccN.toFixed(1);
  f._cogN = +cogN.toFixed(1);
  f._coupN = +coupN.toFixed(1);
  f._churnN = +churnN.toFixed(1);
  f._dupN = +dupN.toFixed(1);
});

// Sort by composite descending
files.sort((a, b) => b.composite - a.composite);

// Print table
const shortPath = (p) =>
  p
    .replace("packages/deep-factor-agent/src/", "agent/")
    .replace("packages/deep-factor-tui/src/", "tui/");

console.log(
  "RANK | FILE / MODULE                                  | COMPOSITE |  CC  | COG  | COUPLING | CHURN×CC | DUP%  | LOC  | PRIMARY ISSUE",
);
console.log(
  "-----+--------------------------------------------------+-----------+------+------+----------+----------+-------+------+--------------------",
);
files.forEach((f, i) => {
  const rank = String(i + 1).padStart(3);
  const name = shortPath(f.file).padEnd(48);
  const comp = String(f.composite).padStart(7);
  const cc = String(f.cc).padStart(4);
  const cog = String(f.cognitive).padStart(4);
  const coup = String(f.coupling).padStart(6);
  const churn = String(f.churnCC).padStart(6);
  const dup = String(f.duplication + "%").padStart(5);
  const loc = String(f.loc).padStart(4);
  console.log(
    `${rank}  | ${name} | ${comp}   | ${cc} | ${cog} |  ${coup}  |  ${churn}  | ${dup} | ${loc} |`,
  );
});

// Also output as JSON for the snapshot
import { writeFileSync } from "fs";
const snapshot = {
  timestamp: new Date().toISOString(),
  git_sha: "HEAD",
  git_message: "fresh audit #3 — post refactoring",
  totals: {
    files_analyzed: files.length,
    total_cc: files.reduce((s, f) => s + f.cc, 0),
    avg_cc: +(files.reduce((s, f) => s + f.cc, 0) / files.length).toFixed(1),
    max_cc: maxCC,
    total_cognitive: files.reduce((s, f) => s + f.cognitive, 0),
    total_coupling: +files.reduce((s, f) => s + f.coupling, 0).toFixed(2),
    total_duplication_pct: +(files.reduce((s, f) => s + f.duplication, 0) / files.length).toFixed(
      2,
    ),
    total_loc: files.reduce((s, f) => s + f.loc, 0),
    total_any_types: files.reduce((s, f) => s + f.any, 0),
  },
  files: Object.fromEntries(
    files.map((f) => [
      f.file,
      {
        cc: f.cc,
        cognitive: f.cognitive,
        coupling_instability: f.coupling,
        loc: f.loc,
        duplication_pct: f.duplication,
        churn: f.churn,
        churnCC: f.churnCC,
        composite: f.composite,
        any_types: f.any,
      },
    ]),
  ),
  ranking: files.map((f, i) => ({
    rank: i + 1,
    file: f.file,
    composite: f.composite,
    cc: f.cc,
    cognitive: f.cognitive,
    coupling: f.coupling,
    churnCC: f.churnCC,
    duplication: f.duplication,
    loc: f.loc,
  })),
};
writeFileSync(".audit/metrics_raw.json", JSON.stringify(snapshot, null, 2));
console.log("\nMetrics saved to .audit/metrics_raw.json");
