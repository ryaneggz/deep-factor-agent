export function isPendingResult(r) {
    return r.stopReason === "human_input_needed";
}
