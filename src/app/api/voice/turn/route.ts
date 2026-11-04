// Voice call: save one finished turn (what the caller said, or what the assistant said) to the transcript and to the
// agent's history, so typed chat after the call knows what was said. A caller turn also goes through the guard.
import { assistant, user } from "@openai/agents";
import { z } from "zod";
import { config } from "@/agent/config";
import { inCall } from "@/lib/agent/call";
import { capText, HISTORY_MAX } from "@/lib/agent/history";
import { sameOrigin } from "@/lib/agent/http";
import { unforge } from "@/lib/agent/safety";
import { getStore } from "@/lib/store";

const Body = z.object({ visitorId: z.uuid(), role: z.enum(["user", "assistant"]), text: z.string().min(1).max(4_000) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("forbidden", { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const { role } = parsed.data;
  const text = capText(role === "user" ? unforge(parsed.data.text.trim()) : parsed.data.text.trim());
  const store = getStore();
  const visitor = await store.findVisitor(parsed.data.visitorId);
  if (!visitor || !(await inCall(visitor.id))) return new Response("no call", { status: 404 });
  if (!(await store.hit(`voice:${visitor.id}`, 150, 600))) return new Response("busy", { status: 429 });

  // Safety first, as in chat: the browser makes the assistant say this exact reply instead of its own.
  const say = role === "user" ? config.guard(text) : null;
  await Promise.all([
    store.logMessages(visitor.id, "voice", [{ role, body: text }]),
    store.appendHistory(visitor.id, [role === "user" ? user(text) : assistant(text)], HISTORY_MAX),
  ]);
  return Response.json({ say });
}
