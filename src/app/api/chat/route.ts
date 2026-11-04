// The web chat channel: streams the agent's reply (text plus tool calls) to the AI SDK useChat client.
// History lives on the server; the client sends only its newest message.
import { assistant, user, type AgentInputItem } from "@openai/agents";
import { createAiSdkUiMessageStreamResponse } from "@openai/agents-extensions/ai-sdk-ui";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { after } from "next/server";
import { z } from "zod";
import { config } from "@/agent/config";
import { markerOf, splitChips } from "@/lib/agent/chips";
import { capText, HISTORY_MAX, replyText, trimHistory } from "@/lib/agent/history";
import { ipOf, sameOrigin } from "@/lib/agent/http";
import { streamAgent, wroteData } from "@/lib/agent/run";
import { unforge } from "@/lib/agent/safety";
import { getStore } from "@/lib/store";

export const maxDuration = 60;

const Body = z.object({
  visitorId: z.uuid(),
  message: z.object({ role: z.literal("user"), parts: z.array(z.object({ type: z.string(), text: z.string().optional() })) }),
});

// A fixed reply in the same stream format, for answers the model must not write (guard hits, rate limit, errors).
// It carries an empty chips marker, so no chips show under it.
const fixed = (text: string) =>
  createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "text-start", id: "fixed" });
        writer.write({ type: "text-delta", id: "fixed", delta: `${text}\n[[chips: ]]` });
        writer.write({ type: "text-end", id: "fixed" });
      },
    }),
  });

const SLOW = "That is a lot of messages at once. Give me a few minutes, then try again.";
const SORRY = "Sorry, something went wrong on my side. Please try again.";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("forbidden", { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const text = capText(unforge(parsed.data.message.parts.map((p) => (p.type === "text" ? (p.text ?? "") : "")).join("\n").trim()));
  if (!text) return new Response("empty message", { status: 400 });

  const store = getStore();
  const { limits } = config;
  // Per IP first (rotating visitor ids gets past a per-visitor limit), then per visitor. Counted before the model runs.
  if (!(await store.hit(`chat-ip:${ipOf(req)}`, limits.ipMessagesPer10Min, 600))) return fixed(SLOW);
  const visitor = await store.upsertVisitor(parsed.data.visitorId);
  if (!(await store.hit(`chat-v:${visitor.id}`, limits.messagesPer10Min, 600))) return fixed(SLOW);

  const save = async (items: AgentInputItem[], reply: string | undefined) => {
    const shown = reply && splitChips(reply).text;
    await store.logMessages(visitor.id, "web", [{ role: "user", body: text }, ...(shown ? [{ role: "assistant" as const, body: shown }] : [])]);
    await store.appendHistory(visitor.id, items, HISTORY_MAX);
  };

  // Deterministic safety first: a fixed reply, the model does not run.
  const guarded = config.guard(text);
  if (guarded) {
    after(() => save([user(text), assistant(`${guarded}\n[[chips: ]]`)], guarded));
    return fixed(guarded);
  }

  try {
    const saved = trimHistory(await store.getHistory(visitor.id));
    const result = await streamAgent({ channel: "web", visitorId: visitor.id, visitorName: visitor.name }, [...saved, user(text)]);
    after(async () => {
      try {
        await result.completed;
        await store.logUsage("web", result.state.usage);
        const items = result.history.slice(saved.length);
        await save(items, replyText(result.finalOutput, items));
        if (wroteData(result.newItems)) await store.logEvent(visitor.id, "write", "A write tool ran in chat");
      } catch (e) {
        console.error("[chat]", (e as Error).message);
      }
    });
    return createAiSdkUiMessageStreamResponse(result);
  } catch (e) {
    console.error("[chat]", (e as Error).message);
    return fixed(SORRY);
  }
}

// Transcript after a reload: { messages }, only rows newer than `after` if given.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const visitorId = z.uuid().safeParse(q.get("visitorId"));
  if (!visitorId.success) return Response.json({ messages: [] });
  const store = getStore();
  const visitor = await store.findVisitor(visitorId.data);
  if (!visitor) return Response.json({ messages: [] });
  const after = Number(q.get("after")) || 0;
  const messages = (await store.messages(visitor.id, { after })).map((m) => ({ id: String(m.id), role: m.role, text: m.body }));
  // A reload: hand the newest reply back with its hidden chips line (kept in history, not in the transcript).
  const last = messages.at(-1);
  if (!after && last?.role === "assistant") {
    const marker = markerOf(await store.getHistory(visitor.id));
    if (marker) last.text = `${last.text}\n${marker}`;
  }
  return Response.json({ messages });
}
