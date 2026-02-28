interface UseTextInputOptions {
    onSubmit: (value: string) => void;
}
interface UseTextInputReturn {
    input: string;
}
/**
 * Shared text-input hook used by HumanInput and PromptInput.
 *
 * Uses a ref mirror of state to avoid the stale-closure problem
 * inherent in Ink's `useInput` callback (which captures the initial
 * render's state values and never re-subscribes).
 */
export declare function useTextInput({ onSubmit }: UseTextInputOptions): UseTextInputReturn;
export {};
//# sourceMappingURL=useTextInput.d.ts.map