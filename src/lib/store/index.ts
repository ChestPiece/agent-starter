// Storage for the agent: visitors, chat history, transcript, usage, events and rate limits.
// In-memory by default; Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set (run supabase/migrations first).
import type { AgentInputItem } from "@openai/agents";
import type { Channel } from "@/lib/agent/types";
import { memoryStore } from "./memory";
import { supabaseStore } from "./supabase";

export type Visitor = { id: string; name: string | null };
export type Role = "user" | "assistant" | "staff";
export type Line = { id: number; role: Role; body: string; channel: Channel; at: string };
export type Usage = { requests?: number; inputTokens?: number; outputTokens?: number };

export interface Store {
  /** The visitor row for a browser's anonymous key (created on first use). */
  upsertVisitor(key: string): Promise<Visitor>;
  findVisitor(key: string): Promise<Visitor | null>;
  setVisitorName(visitorId: string, name: string): Promise<void>;
  /** The agent's own memory (model input items), newest last. */
  getHistory(visitorId: string): Promise<AgentInputItem[]>;
  /** Append atomically, keeping the newest `max` items. */
  appendHistory(visitorId: string, items: AgentInputItem[], max: number): Promise<void>;
  /** The human-readable transcript. Never throws: the reply is already out. */
  logMessages(visitorId: string, channel: Channel, lines: { role: Role; body: string }[]): Promise<void>;
  /** Transcript rows, oldest first; only rows with id > after when given. */
  messages(visitorId: string, opts?: { after?: number; limit?: number }): Promise<Line[]>;
  logUsage(channel: Channel, usage: Usage): Promise<void>;
  logEvent(visitorId: string | null, kind: string, summary: string, data?: unknown): Promise<void>;
  countEvents(visitorId: string, kind: string, sinceIso: string): Promise<number>;
  /** Sliding-window rate limit: true = allowed (and counted). */
  hit(key: string, max: number, windowS: number): Promise<boolean>;
}

let store: Store | undefined;
export function getStore(): Store {
  store ??= process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? supabaseStore() : memoryStore();
  return store;
}
