// Quick-reply chips. The assistant ends a web reply with a hidden line `[[chips: a | b | c]]`; the client strips it
// from the visible text and shows the chips. `[[chips: ]]` means "no chips on purpose" (e.g. while asking for a name).
const MAX_CHIPS = 4;
const MAX_LEN = 28;

export const CHIPS_RULE = `End every reply with one hidden line: [[chips: option | option | option]], 2 to 4 short replies the user is likely to tap next (under 28 characters each, in the user's language). Write [[chips: ]] when a free-text answer is needed. Never mention this line.`;

// Everything from `[[` onward is hidden, so a half-streamed marker never flickers on screen.
export function splitChips(raw: string) {
  const i = raw.indexOf("[[");
  const text = (i < 0 ? raw.replace(/\[$/, "") : raw.slice(0, i)).trimEnd();
  const m = i < 0 ? null : /^\[\[chips:([^\]]*)\]\]/i.exec(raw.slice(i));
  const chips = [...new Set((m?.[1] ?? "").split("|").map((c) => c.trim().slice(0, MAX_LEN).trim()).filter(Boolean))].slice(0, MAX_CHIPS);
  return { text, chips };
}

// The marker line of the last assistant turn in saved history ("" if none), so a reload can rebuild the chips.
export function markerOf(history: unknown[]) {
  for (const it of [...history].reverse()) {
    const m = it as { role?: string; content?: unknown };
    if (m?.role !== "assistant") continue;
    const text = Array.isArray(m.content) ? m.content.map((c) => (c as { text?: string }).text ?? "").join("") : String(m.content ?? "");
    return /\[\[chips:[^\]]*\]\]/i.exec(text)?.[0] ?? "";
  }
  return "";
}

export const hasMarker = (raw: string) => /\[\[chips:/i.test(raw);
