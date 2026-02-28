import { createContext, useContext } from "react";
import type { UseAgentReturn } from "../types.js";

const AgentContext = createContext<UseAgentReturn | null>(null);

/** Provider to inject a UseAgentReturn value (real or mock) */
export const AgentProvider = AgentContext.Provider;

/**
 * Consume the injected agent state.
 * Returns null when no provider is present (production default).
 */
export function useAgentContext(): UseAgentReturn | null {
  return useContext(AgentContext);
}
