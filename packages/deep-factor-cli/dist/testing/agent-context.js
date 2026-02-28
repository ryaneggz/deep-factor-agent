import { createContext, useContext } from "react";
const AgentContext = createContext(null);
/** Provider to inject a UseAgentReturn value (real or mock) */
export const AgentProvider = AgentContext.Provider;
/**
 * Consume the injected agent state.
 * Returns null when no provider is present (production default).
 */
export function useAgentContext() {
    return useContext(AgentContext);
}
