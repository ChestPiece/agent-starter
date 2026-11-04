// Voice call, step 1: create the OpenAI Realtime call for this visitor. The browser sends its WebRTC offer and gets the
// answer back; the API key, the prompt and the tool definitions stay on the server. Tools run in /api/voice/tool.
import { z } from "zod";
import { config } from "@/agent/config";
import { spokenHistory, trimHistory } from "@/lib/agent/history";
import { ipOf, sameOrigin } from "@/lib/agent/http";
import { buildInstructions, toolSchemas } from "@/lib/agent/run";
import { getStore } from "@/lib/store";

const Body = z.object({ visitorId: z.uuid(), sdp: z.string().min(1).max(20_000) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("forbidden", { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "unavailable" }, { status: 503 });
  const store = getStore();
  const { limits } = config;

  // Realtime minutes are the costliest thing here: cap per IP and in total, not only per visitor id.
  const [ipOk, allOk] = await Promise.all([store.hit(`call-ip:${ipOf(req)}`, limits.callsPerHourPerIp, 3600), store.hit("call-all", limits.callsPerHourTotal, 3600)]);
  if (!ipOk || !allOk) return Response.json({ error: "busy" }, { status: 429 });
  const visitor = await store.upsertVisitor(parsed.data.visitorId);
  const calls = await store.countEvents(visitor.id, "call", new Date(Date.now() - 3_600_000).toISOString());
  if (calls >= limits.callsPerHourPerVisitor) return Response.json({ error: "busy" }, { status: 429 });

  const earlier = spokenHistory(trimHistory(await store.getHistory(visitor.id)), config.name);
  const instructions = buildInstructions("voice", visitor.name) + (earlier ? `\n\nEarlier in this chat (typed or on an earlier call):\n${earlier}` : "");
  const session = {
    type: "realtime",
    model: config.models.voice,
    instructions,
    tools: toolSchemas(),
    tool_choice: "auto",
    reasoning: { effort: "low" }, // reasoning tokens are the main delay on a call
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: { model: "gpt-4o-mini-transcribe" }, // for the transcript; the model hears the audio itself
        // semantic_vad waits when the caller sounds unfinished, so "hm" or a pause mid-sentence does not trigger a reply
        turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true },
      },
      output: { voice: config.models.voiceName },
    },
  };
  const form = new FormData();
  form.set("sdp", parsed.data.sdp);
  form.set("session", JSON.stringify(session));
  const res = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  if (!res.ok) {
    console.error("[voice]", res.status, (await res.text()).slice(0, 300));
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
  await store.logEvent(visitor.id, "call", "Voice call started");
  return new Response(await res.text(), { headers: { "Content-Type": "application/sdp" } });
}
