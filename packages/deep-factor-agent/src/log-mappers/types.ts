import type { AgentMode } from "../types.js";
import type { ProviderType } from "../unified-log.js";

export interface MapperContext {
  sessionId: string;
  sequence: number;
  currentIteration: number;
  provider: ProviderType;
  model?: string;
  mode?: AgentMode;
}

export function nextSequence(ctx: MapperContext): number {
  return ctx.sequence++;
}
