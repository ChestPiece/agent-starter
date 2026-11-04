import type { AgentInputItem } from "@openai/agents";
import { splitChips } from "./chips";

export const HISTORY_MAX = 80; // items kept per chat in storage (a plain tail cut)
export const MAX_CHARS = 1_500;

export const capText = (text: string) => (text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)} [message cut]` : text);

// ponytail: keep the last `turns` user turns, cut at a user message so no tool call loses its output. Summarize if long chats matter.
export function trimHistory(items: AgentInputItem[], turns = 14) {
  const starts = items.flatMap((it, i) => ("role" in it && it.role === "user" ? [i] : []));
  // Always start at a user turn: the storage tail cut can leave a tool result without its call, which OpenAI rejects.
  return starts.length > turns ? items.slice(starts[starts.length - turns]) : starts[0] ? items.slice(starts[0]) : items;
}

// The last typed or spoken turns as plain lines, so a voice call picks up where the chat left off.
export function spokenHistory(items: AgentInputItem[], name: string, turns = 10) {
  const text = (c: unknown) =>
    typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p && typeof p === "object" && "text" in p ? String(p.text) : "")).join(" ") : "";
  return items
    .flatMap((i) => ("role" in i && (i.role === "user" || i.role === "assistant") ? [`${i.role === "user" ? "User" : name}: ${splitChips(text(i.content)).text.trim()}`] : []))
    .filter((l) => !l.endsWith(": "))
    .slice(-turns * 2)
    .join("\n");
}

// The words the user saw from this run. Newer models write them as "commentary" messages and can end with an empty
// final answer, so fall back to the last assistant text after the user's message (never an older turn).
export function replyText(finalOutput: string | undefined, items: AgentInputItem[]): string | undefined {
  if (finalOutput?.trim()) return finalOutput;
  for (const it of [...items].reverse()) {
    if (!("role" in it)) continue;
    if (it.role === "user") break;
    if (it.role !== "assistant" || !Array.isArray(it.content)) continue;
    const text = (it.content as { type: string; text?: string }[]).map((c) => (c.type === "output_text" ? (c.text ?? "") : "")).join("").trim();
    if (text) return text;
  }
  return undefined;
}
