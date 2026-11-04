# agent-starter

A Next.js starter for an AI assistant you can **chat with or call**: streaming text replies with tool calls and rich tool cards, quick-reply chips, server-side memory, and a WebRTC voice call (OpenAI Realtime) that uses the same tools and the same history.

Extracted from a production receptionist agent. Clone it per project and edit two files.

## 5-minute start

```bash
bun install
cp .env.example .env.local   # set OPENAI_API_KEY
bun run dev                  # http://localhost:3000
```

With only `OPENAI_API_KEY` set, everything is kept in memory: fine locally, gone on restart.

## Make it yours

| File | What to change |
|---|---|
| `src/agent/brand.ts` | Name, tagline, greeting, starter chips, footer (shown in the browser) |
| `src/agent/config.ts` | Rules (system prompt), tools, voice tools, write tools, the safety `guard`, models, rate limits |
| `src/agent/tools/*.ts` | Your tools (`get_time` and `save_note` are examples) |
| `src/agent/cards.tsx` | Optional React card per tool result (tools without a card show the model's text) |
| `src/app/globals.css` | Colour tokens (shadcn) |

### Add a tool

```ts
// src/agent/tools/orders.ts
export const orderStatus = tool({
  name: "order_status",
  description: "Status of one of the user's orders.",
  parameters: z.object({ orderId: z.string() }),
  async execute({ orderId }, rc?: RunContext<AgentCtx>) {
    const { visitorId } = rc!.context; // who is asking comes from the server, never from the model
    return await lookUp(visitorId, orderId);
  },
});
```

Then add it to `tools` in `config.ts`, and list it in `writes` if it changes data. Voice calls use the same tools unless you set `voiceTools`.

## How it works

```
browser ── POST /api/chat (newest message only) ──▶ guard ▶ rate limits ▶ Agent (stream) ──▶ useChat
        ◀────────────── UI message stream (text, tool parts) ──────────────┘   after(): transcript, history, usage

browser ── POST /api/voice (WebRTC offer) ──▶ OpenAI /v1/realtime/calls (prompt + tool schemas stay on the server)
   │  data channel: transcripts, function calls
   ├── POST /api/voice/tool  → runs the tool on the server with the server's context
   └── POST /api/voice/turn  → saves each spoken turn to the transcript and the shared history (guard runs here too)
```

- **One brain** (`src/lib/agent/run.ts`): one `Agent`, one prompt builder. `channel` (`web` | `voice`) switches the rules: chips for web, short spoken sentences and read-back before writes for voice.
- **Prompt caching**: static rules first, per-user lines last, so OpenAI reuses the long prefix.
- **History on the server** (`conversations.history`): the client cannot rewrite what the model saw. `trimHistory` always cuts at a user turn so a tool result never loses its call.
- **Deterministic safety first**: `config.guard(text)` runs before the model (a regex is cheaper and more reliable than another model call). `unforge` strips `[Staff]`/`[System]` tags users type.
- **Limits**: per IP and per visitor for chat; per IP, per visitor and in total for calls (realtime minutes are the costly part); calls end after 8 min or 45 s of silence.
- **Empty final answers**: newer models can put their words in "commentary" messages and end with an empty final answer; `replyText` saves what the user actually saw.

## Persistent storage (Supabase)

1. Create a Supabase project and paste `supabase/migrations/0001_agent.sql` into the SQL editor.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (and in Vercel).

The tables have RLS on and no policies: only the server (service role) reads or writes them. The store interface is `src/lib/store/index.ts`; add another backend by implementing it.

## Deploy

Vercel: import the repo, set the env vars, deploy. `after()` keeps logging off the response path. In-memory storage does not work across serverless instances, so use Supabase in production.

## Not included (add when a project needs it)

- Human handoff and a staff inbox (pause the agent, staff reply, hand back)
- An LLM reviewer that audits risky replies after they are sent
- Other channels (WhatsApp, SMS), an embeddable widget with an origin allowlist, user auth

## Scripts

```bash
bun run dev
bun run test   # vitest
bun run lint
```
