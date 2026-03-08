import {
  appendFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { AgentThread, AgentEvent } from "deep-factor-agent";

const SESSIONS_DIR = join(homedir(), ".deepfactor", "sessions");

let currentSessionId: string | undefined;

export interface SessionEntry {
  timestamp: string;
  sessionId: string;
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolCallId?: string;
  model?: string;
}

function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

export function getSessionId(): string {
  if (!currentSessionId) {
    currentSessionId = randomUUID();
  }
  return currentSessionId;
}

function sessionFilePath(id: string): string {
  return join(SESSIONS_DIR, `${id}.jsonl`);
}

export function appendSession(entry: Omit<SessionEntry, "sessionId">): void {
  ensureSessionsDir();
  const id = getSessionId();
  const fullEntry: SessionEntry = { ...entry, sessionId: id };
  appendFileSync(sessionFilePath(id), JSON.stringify(fullEntry) + "\n");
}

export function loadSession(id: string): SessionEntry[] {
  const filePath = sessionFilePath(id);
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, "utf-8").trim().split("\n");
  return lines.filter(Boolean).map((line) => JSON.parse(line) as SessionEntry);
}

export function getLatestSessionId(): string | undefined {
  ensureSessionsDir();
  const files = readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .sort((a, b) => {
      const mtimeA = statSync(join(SESSIONS_DIR, a)).mtimeMs;
      const mtimeB = statSync(join(SESSIONS_DIR, b)).mtimeMs;
      return mtimeB - mtimeA;
    });
  if (files.length === 0) return undefined;
  return files[0].replace(".jsonl", "");
}

export function buildThreadFromSession(entries: SessionEntry[]): AgentThread {
  const events: AgentEvent[] = [];
  let iteration = 0;
  let lastToolCallId = "";

  for (const entry of entries) {
    const ts = new Date(entry.timestamp).getTime() || Date.now();

    switch (entry.role) {
      case "user":
        iteration++;
        events.push({
          type: "message",
          role: "user",
          content: entry.content,
          timestamp: ts,
          iteration,
        });
        break;
      case "assistant":
        events.push({
          type: "message",
          role: "assistant",
          content: entry.content,
          timestamp: ts,
          iteration,
        });
        break;
      case "tool_call": {
        const tcId = entry.toolCallId ?? randomUUID();
        lastToolCallId = tcId;
        events.push({
          type: "tool_call",
          toolName: entry.toolName ?? "unknown",
          toolCallId: tcId,
          args: entry.toolArgs ?? {},
          timestamp: ts,
          iteration,
        });
        break;
      }
      case "tool_result":
        events.push({
          type: "tool_result",
          toolCallId: entry.toolCallId ?? (lastToolCallId || randomUUID()),
          result: entry.content,
          timestamp: ts,
          iteration,
        });
        break;
    }
  }

  const now = Date.now();
  return {
    id: `resumed-${randomUUID()}`,
    events,
    metadata: {},
    createdAt: events[0]?.timestamp ?? now,
    updatedAt: events[events.length - 1]?.timestamp ?? now,
  };
}
