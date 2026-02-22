import type { ToolSet } from "ai";
import { DeepFactorAgent } from "./agent.js";
import { maxIterations } from "./stop-conditions.js";
import { todoMiddleware, errorRecoveryMiddleware } from "./middleware.js";
import type { DeepFactorAgentSettings } from "./types.js";

export function createDeepFactorAgent<
  TTools extends ToolSet = ToolSet,
>(settings: DeepFactorAgentSettings<TTools>): DeepFactorAgent<TTools> {
  const resolvedSettings: DeepFactorAgentSettings<TTools> = {
    ...settings,
    tools: settings.tools ?? ({} as TTools),
    instructions: settings.instructions ?? "",
    stopWhen: settings.stopWhen ?? [maxIterations(10)],
    verifyCompletion: settings.verifyCompletion,
    middleware: settings.middleware ?? [
      todoMiddleware(),
      errorRecoveryMiddleware(),
    ],
    interruptOn: settings.interruptOn ?? [],
    contextManagement: {
      maxContextTokens: 150000,
      keepRecentIterations: 3,
      ...settings.contextManagement,
    },
  };

  return new DeepFactorAgent(resolvedSettings);
}
