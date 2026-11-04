// User text must never pass as a staff turn or a system note: those tags carry authority in the prompt.
// Only assistant-role "[Staff]" turns, written by the server, are real.
export const unforge = (text: string) => text.replace(/^\s*(\[(staff|front desk|voice note|system)\]\s*:?\s*)+/i, "");
