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
 * Load a session file. Handles both legacy SessionEntry and unified log formats.
 */
export function loadSession(id: string): SessionEntry[] {
  const filePath = sessionFilePath(id);
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, "utf-8").trim().split("\n");
  return lines.filter(Boolean).map((line) => {
    const parsed = JSON.parse(line);
    // If it's already a unified log entry, convert to legacy format
    if (parsed.type && !parsed.role && parsed.sessionId && parsed.sequence !== undefined) {
      return unifiedToSessionEntry(parsed as UnifiedLogEntry);
    }
    return parsed as SessionEntry;
  });
}

/**
 * Load a session as unified log entries.
 */
export function loadUnifiedSession(id: string): UnifiedLogEntry[] {
  const filePath = sessionFilePath(id);
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, "utf-8").trim().split("\n");
  return lines.filter(Boolean).map((line) => {
    const parsed = JSON.parse(line);
    // If it's a legacy SessionEntry, convert to unified
    if (parsed.role && !parsed.sequence) {
      return sessionEntryToUnified(parsed as SessionEntry);
    }
    return parsed as UnifiedLogEntry;
  });
}

function unifiedToSessionEntry(entry: UnifiedLogEntry): SessionEntry {
  const base: SessionEntry = {
    timestamp: new Date(entry.timestamp).toISOString(),
    sessionId: entry.sessionId,
    role: "assistant",
    content: "",
    model: (entry.providerMeta?.model as string) ?? undefined,
    provider: (entry.providerMeta?.provider as ProviderInput) ?? undefined,
  };

  switch (entry.type) {
    case "message":
      return {
        ...base,
        role: entry.role === "system" ? "assistant" : entry.role,
        content: entry.content,
      };

    case "tool_call":
      return {
        ...base,
        role: "tool_call",
        content: JSON.stringify(entry.args),
        toolName: entry.toolName,
        toolArgs: entry.args,
        toolCallId: entry.toolCallId,
        toolDisplay: entry.display,
        parallelGroup: entry.parallelGroup,
      };

    case "tool_result":
      return {
        ...base,
        role: "tool_result",
        content: typeof entry.result === "string" ? entry.result : JSON.stringify(entry.result),
        toolCallId: entry.toolCallId,
        toolDisplay: entry.display,
        parallelGroup: entry.parallelGroup,
      };

    case "completion":
      return {
        ...base,
        role: "assistant",
        content: entry.result,
      };

    default:
      return base;
  }
}

function sessionEntryToUnified(entry: SessionEntry): UnifiedLogEntry {
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
  entries: SessionEntry[];
  hasProviderFlag: boolean;
  providerFlag?: ProviderType;
  hasModelFlag: boolean;
  modelFlag?: string;
}): ResolvedSessionSettings {
  const { entries, hasProviderFlag, providerFlag, hasModelFlag, modelFlag } = args;

  const latestProviderEntry = [...entries]
    .reverse()
    .find((entry) => normalizeProvider(entry.provider));

  const sessionProvider = normalizeProvider(latestProviderEntry?.provider);
  const sessionModel = sessionProvider
    ? (latestProviderEntry?.model ?? DEFAULT_MODELS[sessionProvider])
    : undefined;

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
          display: entry.toolDisplay,
          parallelGroup: entry.parallelGroup,
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
          display: entry.toolDisplay,
          parallelGroup: entry.parallelGroup,
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

/**
 * Build an AgentThread from unified log entries.
 */
export function buildThreadFromUnifiedSession(entries: UnifiedLogEntry[]): AgentThread {
  // Convert to legacy format and reuse existing logic
  const sessionEntries = entries
    .filter(
      (e) =>
        e.type === "message" ||
        e.type === "tool_call" ||
        e.type === "tool_result" ||
        e.type === "completion",
    )
    .map(unifiedToSessionEntry);

  return buildThreadFromSession(sessionEntries);
}
