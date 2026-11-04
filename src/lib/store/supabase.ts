// Supabase storage (service role, server only). Schema: supabase/migrations/0001_agent.sql.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AgentInputItem } from "@openai/agents";
import type { Store, Visitor } from "./index";

export function supabaseStore(): Store {
  const sb: SupabaseClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const must = <T>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  return {
    async upsertVisitor(key) {
      return must(await sb.from("visitors").upsert({ key }, { onConflict: "key" }).select("id, name").single()) as Visitor;
    },
    async findVisitor(key) {
      return must(await sb.from("visitors").select("id, name").eq("key", key).maybeSingle());
    },
    async setVisitorName(visitorId, name) {
      must(await sb.from("visitors").update({ name }).eq("id", visitorId).is("name", null).select("id"));
    },
    async getHistory(visitorId) {
      const row = must(await sb.from("conversations").select("history").eq("visitor_id", visitorId).maybeSingle());
      return (row?.history ?? []) as AgentInputItem[];
    },
    async appendHistory(visitorId, items, max) {
      must(await sb.rpc("append_history", { v: visitorId, items, max }));
    },
    async logMessages(visitorId, channel, lines) {
      const { error } = await sb.from("messages").insert(lines.map((l) => ({ visitor_id: visitorId, channel, role: l.role, body: l.body })));
      if (error) console.error("[store] messages", error.message);
    },
    async messages(visitorId, { after = 0, limit = 30 } = {}) {
      let q = sb.from("messages").select("id, role, body, channel, created_at").eq("visitor_id", visitorId).order("id", { ascending: !!after }).limit(limit);
      if (after) q = q.gt("id", after);
      const rows = must(await q) as { id: number; role: "user" | "assistant" | "staff"; body: string; channel: "web" | "voice"; created_at: string }[];
      return (after ? rows : rows.reverse()).map((r) => ({ id: r.id, role: r.role, body: r.body, channel: r.channel, at: r.created_at }));
    },
    async logUsage(channel, u) {
      const { error } = await sb.from("usage_events").insert({ channel, requests: u.requests ?? 0, input_tokens: u.inputTokens ?? 0, output_tokens: u.outputTokens ?? 0 });
      if (error) console.error("[store] usage", error.message);
    },
    async logEvent(visitorId, kind, summary, data) {
      const { error } = await sb.from("events").insert({ visitor_id: visitorId, kind, summary, data: data ?? null });
      if (error) console.error("[store] event", error.message);
    },
    async countEvents(visitorId, kind, sinceIso) {
      const { count } = await sb.from("events").select("id", { count: "exact", head: true }).eq("visitor_id", visitorId).eq("kind", kind).gt("created_at", sinceIso);
      return count ?? 0;
    },
    async hit(key, max, windowS) {
      const { data, error } = await sb.rpc("hit", { k: key, max, window_s: windowS });
      if (error) {
        console.error("[rate]", error.message); // fail open: a limiter outage must not take the chat down
        return true;
      }
      return data === true;
    },
  };
}
