/**
 * Type guard distinguishing `ModelAdapter` from `BaseChatModel`.
 *
 * `BaseChatModel` always has the abstract `_generate` method; `ModelAdapter`
 * never does. This is a reliable discriminator that avoids false positives
 * from duck-typing `invoke` alone (which both types share).
 */
export function isModelAdapter(obj) {
    return (typeof obj === "object" &&
        obj !== null &&
        "invoke" in obj &&
        typeof obj.invoke === "function" &&
        !("_generate" in obj));
}
