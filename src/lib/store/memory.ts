// ponytail: process memory. One server instance only, and it resets on restart or deploy. Fine for local work and demos;
// set the Supabase env vars for anything real.
import type { AgentInputItem } from "@openai/agents";
import type { Line, Store, Usage, Visitor } from "./index";

type Db = {
  visitors: Map<string, Visitor & { key: string }>;
  history: Map<string, AgentInputItem[]>;
  lines: (Line & { visitorId: string })[];
  usage: (Usage & { channel: string; at: number })[];
  events: { visitorId: string | null; kind: string; summary: string; data?: unknown; at: number }[];
  hits: Map<string, number[]>;
  seq: number;
};
const fresh = (): Db => ({ visitors: new Map(), history: new Map(), lines: [], usage: [], events: [], hits: new Map(), seq: 0 });

// Kept on globalThis so Next's dev hot reload does not wipe it.
const g = globalThis as { __agentMemory?: Db };

export function memoryStore(db: Db = (g.__agentMemory ??= fresh())): Store {
  return {
    async upsertVisitor(key) {
      const found = await this.findVisitor(key);
      if (found) return found;
      const v = { id: crypto.randomUUID(), key, name: null };
      db.visitors.set(key, v);
      return { id: v.id, name: v.name };
    },
    async findVisitor(key) {
      const v = db.visitors.get(key);
      return v ? { id: v.id, name: v.name } : null;
    },
    async setVisitorName(visitorId, name) {
      for (const v of db.visitors.values()) if (v.id === visitorId && !v.name) v.name = name;
    },
    async getHistory(visitorId) {
      return structuredClone(db.history.get(visitorId) ?? []);
    },
    async appendHistory(visitorId, items, max) {
      db.history.set(visitorId, [...(db.history.get(visitorId) ?? []), ...structuredClone(items)].slice(-max));
    },
    async logMessages(visitorId, channel, lines) {
      const at = new Date().toISOString();
      for (const l of lines) db.lines.push({ id: ++db.seq, visitorId, channel, role: l.role, body: l.body, at });
    },
    async messages(visitorId, { after = 0, limit = 30 } = {}) {
      const mine = db.lines.filter((l) => l.visitorId === visitorId && l.id > after);
      return (after ? mine.slice(0, limit) : mine.slice(-limit)).map((l) => ({ id: l.id, role: l.role, body: l.body, channel: l.channel, at: l.at }));
    },
    async logUsage(channel, usage) {
      db.usage.push({ ...usage, channel, at: Date.now() });
    },
    async logEvent(visitorId, kind, summary, data) {
      db.events.push({ visitorId, kind, summary, data, at: Date.now() });
    },
    async countEvents(visitorId, kind, sinceIso) {
      const since = Date.parse(sinceIso);
      return db.events.filter((e) => e.visitorId === visitorId && e.kind === kind && e.at > since).length;
    },
    async hit(key, max, windowS) {
      const now = Date.now();
      const recent = (db.hits.get(key) ?? []).filter((t) => now - t < windowS * 1000);
      const ok = recent.length < max;
      if (ok) recent.push(now);
      db.hits.set(key, recent);
      return ok;
    },
  };
}

export const freshMemory = fresh; // tests
