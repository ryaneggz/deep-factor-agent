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
import type { AgentThread, AgentEvent, UnifiedLogEntry } from "deep-factor-agent";
import { serializeLogEntry } from "deep-factor-agent";
import { DEFAULT_MODELS, DEFAULT_PROVIDER, normalizeProvider } from "./types.js";
import type { ProviderType, ProviderInput } from "./types.js";
import type { ToolDisplayMetadata } from "deep-factor-agent";

const SESSIONS_DIR = join(homedir(), ".deepfactor", "sessions");

let currentSessionId: string | undefined;

/**
 * @internal Legacy format kept only for reading old session files.
 * Not exported — use UnifiedLogEntry for all new code.
 */
interface SessionEntry {
  timestamp: string;
  sessionId: string;
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolCallId?: string;
  toolDisplay?: ToolDisplayMetadata;
  parallelGroup?: string;
  model?: string;
  provider?: ProviderInput;
}

export interface ResolvedSessionSettings {
  provider: ProviderType;
  model: string;
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

/**
 * Returns true if the current session has any logged entries (i.e. the session file exists).
 */
export function hasSessionEntries(): boolean {
  if (!currentSessionId) return false;
  return existsSync(sessionFilePath(currentSessionId));
}

function sessionFilePath(id: string): string {
  return join(SESSIONS_DIR, `${id}.jsonl`);
}

/**
 * Append a unified log entry to the session file.
 */
export function appendUnifiedSession(entry: UnifiedLogEntry): void {
  ensureSessionsDir();
  const id = getSessionId();
  // Ensure the entry uses the current session ID
  const withSession = { ...entry, sessionId: id };
  appendFileSync(sessionFilePath(id), serializeLogEntry(withSession) + "\n");
}

/**
 * Load a session file as unified log entries.
 * Handles both unified (new) and legacy SessionEntry formats transparently.
 * Legacy lines are detected by 'role' field without 'sequence' and converted inline.
 */
export function loadSession(id: string): UnifiedLogEntry[] {
  const filePath = sessionFilePath(id);
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, "utf-8").trim().split("\n");
  return lines.filter(Boolean).map((line) => {
    const parsed = JSON.parse(line);
    // Detect legacy format: has 'role' but no 'sequence' field
    if (parsed.role && parsed.sequence === undefined) {
      return _convertLegacyEntry(parsed as SessionEntry);
    }
    // Already unified format — no conversion needed
    return parsed as UnifiedLogEntry;
  });
}

/**
 * Convert a legacy SessionEntry to UnifiedLogEntry.
 * Used as a read-path fallback for pre-migration session files.
 */
function _convertLegacyEntry(entry: SessionEntry): UnifiedLogEntry {
  const ts = new Date(entry.timestamp).getTime() || Date.now();
  const base = {
    sessionId: entry.sessionId,
    timestamp: ts,
    sequence: 0,
  };

  switch (entry.role) {
    case "user":
      return {
        ...base,
        type: "message" as const,
        role: "user" as const,
        content: entry.content,
        iteration: 0,
        providerMeta: { model: entry.model, provider: entry.provider },
      };

    case "assistant":
      return {
        ...base,
        type: "message" as const,
        role: "assistant" as const,
        content: entry.content,
        iteration: 0,
        providerMeta: { model: entry.model, provider: entry.provider },
      };

    case "tool_call":
      return {
        ...base,
        type: "tool_call" as const,
        toolCallId: entry.toolCallId ?? randomUUID(),
        toolName: entry.toolName ?? "unknown",
        args: entry.toolArgs ?? {},
        display: entry.toolDisplay,
        parallelGroup: entry.parallelGroup,
        iteration: 0,
      };

    case "tool_result":
      return {
        ...base,
        type: "tool_result" as const,
        toolCallId: entry.toolCallId ?? randomUUID(),
        result: entry.content,
        isError: false,
        display: entry.toolDisplay,
        parallelGroup: entry.parallelGroup,
        iteration: 0,
      };
  }
}

export function resolveSessionSettings(args: {
  entries: UnifiedLogEntry[];
  hasProviderFlag: boolean;
  providerFlag?: ProviderType;
  hasModelFlag: boolean;
  modelFlag?: string;
}): ResolvedSessionSettings {
  const { entries, hasProviderFlag, providerFlag, hasModelFlag, modelFlag } = args;

  // Extract provider from init entries or providerMeta on any entry
  const latestProviderEntry = [...entries].reverse().find((entry) => {
    if (entry.type === "init") {
      return normalizeProvider(entry.provider as string);
    }
    return normalizeProvider(entry.providerMeta?.provider as string);
  });

  const rawProvider =
    latestProviderEntry?.type === "init"
      ? (latestProviderEntry.provider as string)
      : (latestProviderEntry?.providerMeta?.provider as string);
  const rawModel =
    latestProviderEntry?.type === "init"
      ? (latestProviderEntry.model as string)
      : (latestProviderEntry?.providerMeta?.model as string);

  const sessionProvider = normalizeProvider(rawProvider);
  const sessionModel = sessionProvider ? (rawModel ?? DEFAULT_MODELS[sessionProvider]) : undefined;

  const provider = hasProviderFlag
    ? (providerFlag ?? DEFAULT_PROVIDER)
    : (sessionProvider ?? DEFAULT_PROVIDER);
  const model = hasModelFlag
    ? (modelFlag ?? DEFAULT_MODELS[provider])
    : hasProviderFlag
      ? DEFAULT_MODELS[provider]
      : (sessionModel ?? DEFAULT_MODELS[provider]);

  return { provider, model };
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

/**
 * Build an AgentThread directly from unified log entries.
 */
export function buildThreadFromUnifiedSession(entries: UnifiedLogEntry[]): AgentThread {
  const events: AgentEvent[] = [];
  let iteration = 0;
  let lastToolCallId = "";

  for (const entry of entries) {
    switch (entry.type) {
      case "message":
        if (entry.role === "user") iteration++;
        events.push({
          type: "message",
          role: entry.role === "system" ? "assistant" : entry.role,
          content: entry.content,
          timestamp: entry.timestamp,
          iteration: entry.iteration ?? iteration,
        });
        break;

      case "tool_call": {
        const tcId = entry.toolCallId ?? randomUUID();
        lastToolCallId = tcId;
        events.push({
          type: "tool_call",
          toolName: entry.toolName ?? "unknown",
          toolCallId: tcId,
          args: entry.args ?? {},
          display: entry.display,
          parallelGroup: entry.parallelGroup,
          timestamp: entry.timestamp,
          iteration: entry.iteration ?? iteration,
        });
        break;
      }

      case "tool_result":
        events.push({
          type: "tool_result",
          toolCallId: entry.toolCallId ?? (lastToolCallId || randomUUID()),
          result: typeof entry.result === "string" ? entry.result : JSON.stringify(entry.result),
          display: entry.display,
          parallelGroup: entry.parallelGroup,
          timestamp: entry.timestamp,
          iteration: entry.iteration ?? iteration,
        });
        break;

      case "completion":
        events.push({
          type: "message",
          role: "assistant",
          content: entry.result,
          timestamp: entry.timestamp,
          iteration: entry.iteration ?? iteration,
        });
        break;

      // Skip non-conversation entry types (init, result, status, error, thinking, etc.)
      default:
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
