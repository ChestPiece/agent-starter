// Voice call: run one tool call the realtime model asked for. Same trust as the chat: the visitor id picks the row,
// and the tool only ever acts for that visitor (never for an id in the model's arguments).
import { z } from "zod";
import { inCall } from "@/lib/agent/call";
import { sameOrigin } from "@/lib/agent/http";
import { runTool } from "@/lib/agent/run";
import { getStore } from "@/lib/store";

export const maxDuration = 30;
const FAILED = "That did not work. Say sorry and offer to try again.";

const Body = z.object({ visitorId: z.uuid(), name: z.string().max(64), args: z.string().max(4_000) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("forbidden", { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const store = getStore();
  const visitor = await store.findVisitor(parsed.data.visitorId);
  if (!visitor || !(await inCall(visitor.id))) return new Response("no call", { status: 404 });
  if (!(await store.hit(`voice:${visitor.id}`, 150, 600))) return new Response("busy", { status: 429 }); // one call is about 60 posts
  try {
    return Response.json({ output: await runTool({ channel: "voice", visitorId: visitor.id, visitorName: visitor.name }, parsed.data.name, parsed.data.args) });
  } catch (e) {
    console.error("[voice tool]", parsed.data.name, (e as Error).message);
    return Response.json({ output: FAILED });
  }
}
