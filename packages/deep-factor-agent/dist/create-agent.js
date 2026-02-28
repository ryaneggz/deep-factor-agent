import { DeepFactorAgent } from "./agent.js";
import { maxIterations } from "./stop-conditions.js";
import { todoMiddleware, errorRecoveryMiddleware } from "./middleware.js";
export function createDeepFactorAgent(settings) {
    const resolvedSettings = {
        ...settings,
        tools: settings.tools ?? [],
        instructions: settings.instructions ?? "",
        stopWhen: settings.stopWhen ?? [maxIterations(10)],
        verifyCompletion: settings.verifyCompletion,
        middleware: settings.middleware ?? [
            todoMiddleware(),
            errorRecoveryMiddleware(),
        ],
        interruptOn: settings.interruptOn ?? [],
        contextMode: settings.contextMode ?? "standard",
        contextManagement: {
            maxContextTokens: 150000,
            keepRecentIterations: 3,
            ...settings.contextManagement,
        },
    };
    return new DeepFactorAgent(resolvedSettings);
}
