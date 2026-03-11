#!/usr/bin/env node
// Unified log smoke test validator
// Usage: node scripts/validate-smoke-logs.mjs <file1.jsonl> [file2.jsonl ...]

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node validate-smoke-logs.mjs <file1.jsonl> [...]");
  process.exit(1);
}

const VALID_TYPES = new Set([
  "init",
  "message",
  "thinking",
  "tool_call",
  "tool_result",
  "file_change",
  "error",
  "approval",
  "human_input_requested",
  "human_input_received",
  "plan",
  "summary",
  "status",
  "rate_limit",
  "completion",
  "result",
]);

let totalPass = 0;
let totalFail = 0;

for (const file of files) {
  const name = basename(file);
  const errors = [];
  let lines;

  try {
    const raw = readFileSync(file, "utf-8").trim();
    lines = raw.split("\n").filter(Boolean);
  } catch (e) {
    console.log(`SKIP  ${name} — ${e.message}`);
    continue;
  }

  if (lines.length === 0) {
    console.log(`SKIP  ${name} — empty file`);
    continue;
  }

  // Parse all lines
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      entries.push(JSON.parse(lines[i]));
    } catch {
      errors.push(`Line ${i + 1}: invalid JSON`);
    }
  }

  if (entries.length === 0) {
    errors.push("No valid JSON lines");
    report(name, errors);
    continue;
  }

  // 1. Every entry has required base fields
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.type) errors.push(`Line ${i + 1}: missing "type"`);
    if (!e.sessionId) errors.push(`Line ${i + 1}: missing "sessionId"`);
    if (e.timestamp === undefined) errors.push(`Line ${i + 1}: missing "timestamp"`);
    if (e.sequence === undefined) errors.push(`Line ${i + 1}: missing "sequence"`);
    if (e.type && !VALID_TYPES.has(e.type)) errors.push(`Line ${i + 1}: unknown type "${e.type}"`);
  }

  // 2. Monotonic sequences
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].sequence <= entries[i - 1].sequence) {
      errors.push(
        `Line ${i + 1}: sequence ${entries[i].sequence} <= previous ${entries[i - 1].sequence}`,
      );
    }
  }

  // 3. Bookend events
  if (entries[0].type !== "init") {
    errors.push(`First entry type is "${entries[0].type}", expected "init"`);
  }
  if (entries[entries.length - 1].type !== "result") {
    errors.push(`Last entry type is "${entries[entries.length - 1].type}", expected "result"`);
  }

  // 4. Session consistency
  const sessionIds = new Set(entries.map((e) => e.sessionId));
  if (sessionIds.size > 1) {
    errors.push(`Multiple sessionIds found: ${[...sessionIds].join(", ")}`);
  }

  // 5. No leaked tool JSON in assistant messages
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.type === "message" && e.role === "assistant" && typeof e.content === "string") {
      if (e.content.includes('"tool_calls"') || e.content.includes('"function_call"')) {
        errors.push(`Line ${i + 1}: assistant message contains raw tool JSON`);
      }
    }
  }

  // 6. No consecutive duplicate status lines
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].type === "status" && entries[i - 1].type === "status") {
      const a = entries[i - 1];
      const b = entries[i];
      if (
        a.status === b.status &&
        a.iterations === b.iterations &&
        JSON.stringify(a.usage) === JSON.stringify(b.usage)
      ) {
        errors.push(`Lines ${i}–${i + 1}: consecutive identical status entries`);
      }
    }
  }

  // 7. Tool call/result matching
  const toolCalls = entries.filter((e) => e.type === "tool_call");
  const toolResults = entries.filter((e) => e.type === "tool_result");
  const callIds = new Set(toolCalls.map((e) => e.toolCallId));
  const resultIds = new Set(toolResults.map((e) => e.toolCallId));

  for (const id of callIds) {
    if (!resultIds.has(id)) {
      errors.push(`tool_call "${id}" has no matching tool_result`);
    }
  }
  for (const id of resultIds) {
    if (!callIds.has(id)) {
      errors.push(`tool_result "${id}" has no matching tool_call`);
    }
  }

  // 8. Provider field on init
  if (entries[0].type === "init" && !entries[0].provider) {
    errors.push("init entry missing provider field");
  }

  report(name, errors);
}

function report(name, errors) {
  if (errors.length === 0) {
    console.log(`PASS  ${name}`);
    totalPass++;
  } else {
    console.log(`FAIL  ${name}`);
    for (const err of errors) {
      console.log(`      - ${err}`);
    }
    totalFail++;
  }
}

console.log(`\n${totalPass} passed, ${totalFail} failed out of ${totalPass + totalFail} files`);
process.exit(totalFail > 0 ? 1 : 0);
