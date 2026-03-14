#!/usr/bin/env node
// Compute composite complexity ranking from collected metrics

const files = [
  // Agent package
  { file: "packages/deep-factor-agent/src/agent.ts", cc: 105, nesting: 10, funcs: 120, imports: 17, churn: 18, loc: 1492, any: 1, duplication: 0 },
  { file: "packages/deep-factor-agent/src/providers/claude-cli.ts", cc: 57, nesting: 7, funcs: 116, imports: 8, churn: 9, loc: 708, any: 1, duplication: 0 },
  { file: "packages/deep-factor-agent/src/providers/codex-cli.ts", cc: 34, nesting: 7, funcs: 70, imports: 8, churn: 0, loc: 431, any: 1, duplication: 0 },
  { file: "packages/deep-factor-agent/src/tool-display.ts", cc: 43, nesting: 4, funcs: 57, imports: 1, churn: 0, loc: 330, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/providers/claude-agent-sdk.ts", cc: 52, nesting: 2, funcs: 64, imports: 5, churn: 0, loc: 378, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/log-mappers/replay.ts", cc: 33, nesting: 3, funcs: 11, imports: 2, churn: 0, loc: 296, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/log-mappers/langchain-mapper.ts", cc: 23, nesting: 3, funcs: 10, imports: 4, churn: 0, loc: 252, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/context-manager.ts", cc: 11, nesting: 6, funcs: 17, imports: 4, churn: 0, loc: 123, any: 1, duplication: 0 },
  { file: "packages/deep-factor-agent/src/middleware.ts", cc: 11, nesting: 5, funcs: 19, imports: 4, churn: 0, loc: 117, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/log-mappers/claude-mapper.ts", cc: 19, nesting: 3, funcs: 17, imports: 3, churn: 0, loc: 180, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/xml-serializer.ts", cc: 18, nesting: 5, funcs: 10, imports: 1, churn: 0, loc: 100, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/providers/messages-to-xml.ts", cc: 23, nesting: 3, funcs: 21, imports: 4, churn: 0, loc: 162, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/stop-conditions.ts", cc: 11, nesting: 2, funcs: 23, imports: 1, churn: 0, loc: 153, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/unified-log.ts", cc: 0, nesting: 1, funcs: 5, imports: 1, churn: 0, loc: 188, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/log-mappers/codex-mapper.ts", cc: 12, nesting: 3, funcs: 9, imports: 3, churn: 0, loc: 136, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/types.ts", cc: 0, nesting: 1, funcs: 2, imports: 3, churn: 9, loc: 264, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/tool-adapter.ts", cc: 4, nesting: 1, funcs: 13, imports: 4, churn: 0, loc: 61, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/create-agent.ts", cc: 0, nesting: 1, funcs: 1, imports: 5, churn: 6, loc: 29, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/human-in-the-loop.ts", cc: 0, nesting: 1, funcs: 1, imports: 2, churn: 0, loc: 36, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/test-logger.ts", cc: 0, nesting: 1, funcs: 5, imports: 2, churn: 0, loc: 62, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/index.ts", cc: 0, nesting: 1, funcs: 2, imports: 1, churn: 11, loc: 149, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/providers/types.ts", cc: 0, nesting: 1, funcs: 4, imports: 4, churn: 0, loc: 64, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/log-mappers/types.ts", cc: 0, nesting: 1, funcs: 1, imports: 2, churn: 0, loc: 13, any: 0, duplication: 0 },
  { file: "packages/deep-factor-agent/src/log-mappers/index.ts", cc: 0, nesting: 1, funcs: 0, imports: 0, churn: 0, loc: 7, any: 0, duplication: 0 },
  // TUI package
  { file: "packages/deep-factor-tui/src/hooks/useAgent.ts", cc: 31, nesting: 4, funcs: 10, imports: 15, churn: 20, loc: 468, any: 0, duplication: 2.6 },
  { file: "packages/deep-factor-tui/src/transcript.ts", cc: 18, nesting: 4, funcs: 8, imports: 6, churn: 5, loc: 413, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/cli.tsx", cc: 15, nesting: 5, funcs: 1, imports: 5, churn: 14, loc: 264, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/PendingInputPanel.tsx", cc: 16, nesting: 4, funcs: 5, imports: 5, churn: 0, loc: 241, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/session-logger.ts", cc: 13, nesting: 3, funcs: 8, imports: 9, churn: 10, loc: 288, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/hooks/useTextInput.ts", cc: 13, nesting: 3, funcs: 2, imports: 6, churn: 7, loc: 199, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/print.ts", cc: 11, nesting: 5, funcs: 2, imports: 8, churn: 9, loc: 196, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/tools/file-utils.ts", cc: 11, nesting: 4, funcs: 8, imports: 8, churn: 0, loc: 191, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/TranscriptSegment.tsx", cc: 7, nesting: 3, funcs: 4, imports: 6, churn: 9, loc: 219, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/app.tsx", cc: 4, nesting: 2, funcs: 1, imports: 6, churn: 15, loc: 142, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/MessageBubble.tsx", cc: 9, nesting: 1, funcs: 1, imports: 5, churn: 10, loc: 84, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/LiveSection.tsx", cc: 5, nesting: 2, funcs: 1, imports: 5, churn: 6, loc: 76, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/types.ts", cc: 3, nesting: 1, funcs: 2, imports: 7, churn: 14, loc: 197, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/provider-resolution.ts", cc: 5, nesting: 1, funcs: 2, imports: 3, churn: 5, loc: 47, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/StatusLine.tsx", cc: 5, nesting: 1, funcs: 3, imports: 4, churn: 0, loc: 52, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/InputBar.tsx", cc: 1, nesting: 2, funcs: 1, imports: 3, churn: 7, loc: 49, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/theme.ts", cc: 6, nesting: 1, funcs: 1, imports: 1, churn: 0, loc: 27, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/default-agent-instructions.ts", cc: 0, nesting: 1, funcs: 0, imports: 0, churn: 0, loc: 7, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/tools/bash.ts", cc: 2, nesting: 3, funcs: 2, imports: 3, churn: 0, loc: 32, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/tools/default-tools.ts", cc: 0, nesting: 1, funcs: 1, imports: 5, churn: 0, loc: 10, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/tools/write-file.ts", cc: 0, nesting: 2, funcs: 1, imports: 3, churn: 0, loc: 14, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/tools/read-file.ts", cc: 0, nesting: 2, funcs: 1, imports: 3, churn: 0, loc: 18, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/tools/edit-file.ts", cc: 0, nesting: 2, funcs: 1, imports: 3, churn: 0, loc: 17, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/index.ts", cc: 0, nesting: 1, funcs: 0, imports: 2, churn: 0, loc: 2, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/Header.tsx", cc: 0, nesting: 1, funcs: 1, imports: 2, churn: 0, loc: 10, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/ThinkingBlock.tsx", cc: 1, nesting: 2, funcs: 1, imports: 2, churn: 0, loc: 28, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/HotkeyMenu.tsx", cc: 0, nesting: 1, funcs: 1, imports: 2, churn: 0, loc: 26, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/StatusIndicator.tsx", cc: 1, nesting: 1, funcs: 1, imports: 2, churn: 0, loc: 27, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/ToolCallBlock.tsx", cc: 0, nesting: 1, funcs: 1, imports: 2, churn: 0, loc: 16, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/TranscriptTurn.tsx", cc: 1, nesting: 2, funcs: 1, imports: 4, churn: 0, loc: 36, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/SummaryBlock.tsx", cc: 1, nesting: 1, funcs: 1, imports: 2, churn: 0, loc: 17, any: 0, duplication: 0 },
  { file: "packages/deep-factor-tui/src/components/PlanBlock.tsx", cc: 1, nesting: 1, funcs: 1, imports: 2, churn: 0, loc: 17, any: 0, duplication: 0 },
];

// Compute cognitive complexity: CC * (1 + nesting/3) — penalizes deep nesting
files.forEach(f => {
  f.cognitive = Math.round(f.cc * (1 + f.nesting / 3));
});

// Compute coupling instability: Ce / (Ce + Ca_estimate)
// Ca (afferent) = how many other files import this file
// For simplicity, we compute Ce = imports count
// Ca = churn is a rough proxy for importance/usage
files.forEach(f => {
  const ce = f.imports;
  const ca = Math.max(1, Math.floor(f.churn / 3)); // rough estimate
  f.coupling = +(ce / (ca + ce)).toFixed(2);
});

// Churn x CC
files.forEach(f => {
  f.churnCC = f.churn * f.cc;
});

// Find maxes for normalization
const maxCC = Math.max(...files.map(f => f.cc));
const maxCog = Math.max(...files.map(f => f.cognitive));
const maxCoupling = Math.max(...files.map(f => f.coupling));
const maxChurnCC = Math.max(...files.map(f => f.churnCC));
const maxDup = Math.max(...files.map(f => f.duplication));

// Normalize to 0-100 and compute composite
files.forEach(f => {
  const ccN = maxCC > 0 ? (f.cc / maxCC) * 100 : 0;
  const cogN = maxCog > 0 ? (f.cognitive / maxCog) * 100 : 0;
  const coupN = maxCoupling > 0 ? (f.coupling / maxCoupling) * 100 : 0;
  const churnN = maxChurnCC > 0 ? (f.churnCC / maxChurnCC) * 100 : 0;
  const dupN = maxDup > 0 ? (f.duplication / maxDup) * 100 : 0;

  f.composite = +(ccN * 0.30 + cogN * 0.25 + coupN * 0.20 + churnN * 0.15 + dupN * 0.10).toFixed(1);
  f._ccN = +ccN.toFixed(1);
  f._cogN = +cogN.toFixed(1);
  f._coupN = +coupN.toFixed(1);
  f._churnN = +churnN.toFixed(1);
  f._dupN = +dupN.toFixed(1);
});

// Sort by composite descending
files.sort((a, b) => b.composite - a.composite);

// Print table
const shortPath = p => p.replace('packages/deep-factor-agent/src/', 'agent/').replace('packages/deep-factor-tui/src/', 'tui/');

console.log("RANK | FILE / MODULE                                  | COMPOSITE |  CC  | COG  | COUPLING | CHURN×CC | DUP%  | LOC  | PRIMARY ISSUE");
console.log("-----+--------------------------------------------------+-----------+------+------+----------+----------+-------+------+--------------------");
files.forEach((f, i) => {
  const rank = String(i + 1).padStart(3);
  const name = shortPath(f.file).padEnd(48);
  const comp = String(f.composite).padStart(7);
  const cc = String(f.cc).padStart(4);
  const cog = String(f.cognitive).padStart(4);
  const coup = String(f.coupling).padStart(6);
  const churn = String(f.churnCC).padStart(6);
  const dup = String(f.duplication + '%').padStart(5);
  const loc = String(f.loc).padStart(4);
  console.log(`${rank}  | ${name} | ${comp}   | ${cc} | ${cog} |  ${coup}  |  ${churn}  | ${dup} | ${loc} |`);
});

// Also output as JSON for the snapshot
import { writeFileSync } from 'fs';
const snapshot = {
  timestamp: new Date().toISOString(),
  git_sha: "HEAD",
  git_message: "baseline — before refactoring",
  totals: {
    files_analyzed: files.length,
    total_cc: files.reduce((s, f) => s + f.cc, 0),
    avg_cc: +(files.reduce((s, f) => s + f.cc, 0) / files.length).toFixed(1),
    max_cc: maxCC,
    total_cognitive: files.reduce((s, f) => s + f.cognitive, 0),
    total_coupling: +(files.reduce((s, f) => s + f.coupling, 0)).toFixed(2),
    total_duplication_pct: +(files.reduce((s, f) => s + f.duplication, 0) / files.length).toFixed(2),
    total_loc: files.reduce((s, f) => s + f.loc, 0),
    total_any_types: files.reduce((s, f) => s + f.any, 0),
  },
  files: Object.fromEntries(files.map(f => [f.file, {
    cc: f.cc,
    cognitive: f.cognitive,
    coupling_instability: f.coupling,
    loc: f.loc,
    duplication_pct: f.duplication,
    churn: f.churn,
    churnCC: f.churnCC,
    composite: f.composite,
    any_types: f.any,
  }])),
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
writeFileSync('.audit/metrics_raw.json', JSON.stringify(snapshot, null, 2));
console.log("\nMetrics saved to .audit/metrics_raw.json");
