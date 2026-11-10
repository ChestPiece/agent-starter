# agent-starter

A ready-made AI assistant for your website. People can **type to it (chat)** or **talk to it (voice call)**. Both use the same brain, the same tools and the same memory of the conversation.

Clone it, add your API key, change a few files (or ask your AI coding tool to change them), and you have your own AI app.

It started as a real receptionist agent in production, so it already handles the boring hard parts: safety checks, rate limits, cost limits on voice calls, and saving conversations.

## What you need

- **Bun** (runs the app). Install it from [bun.sh](https://bun.sh). Node.js also works if you prefer `npm`.
- **An OpenAI API key**. Get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). It costs money per use, so add a small amount of credit first.
- Optional: a **Supabase** project, to keep conversations after a restart (free tier is fine).
- Optional: a **Vercel AI Gateway** key, to use Claude, Gemini or other models for chat.

## Start it (about 5 minutes)

1. Get the code:
   ```bash
   git clone https://github.com/chestpiece/agent-starter.git my-assistant
   cd my-assistant
   ```
2. Install everything:
   ```bash
   bun install
   ```
3. Make your settings file:
   ```bash
   cp .env.example .env.local
   ```
4. Open `.env.local` in any text editor and paste your key after `OPENAI_API_KEY=`. Save.
5. Run it:
   ```bash
   bun run dev
   ```
6. Open [http://localhost:3000](http://localhost:3000). Type a message, or press **Call** and allow the microphone to talk to it.

With only the OpenAI key set, conversations are kept in memory. That is fine for trying it out, but they are gone when you stop the app.

## Make it yours

You only need to touch these files:

| File | What it controls |
|---|---|
| `src/agent/brand.ts` | The name, tagline, first greeting, starter buttons and footer people see |
| `src/agent/config.ts` | How the assistant behaves (its rules), which tools it can use, the safety check, models, limits |
| `src/agent/tools/*.ts` | Tools: things the assistant can *do*, like look up an order or book a slot. `get_time` and `save_note` are examples |
| `src/agent/cards.tsx` | Optional: a nice card to show a tool's result in chat |
| `src/app/globals.css` | Colours |

## Build it with your AI assistant

This repo includes `AGENTS.md` and `CLAUDE.md`, so Claude Code, Cursor, Codex and similar tools know where things are. Open the folder in your tool and ask in plain words. For example:

- "Rename the assistant to *Nova*, a helper for my bakery. Change the greeting and starter buttons to fit."
- "Add a tool that returns today's opening hours: Mon to Fri 9 to 5, closed on weekends."
- "Add a tool that looks up an order by order number from my API at `https://example.com/orders/{id}`. Show the result as a card."
- "Make the colours warm orange and cream."
- "Use Claude for chat instead of OpenAI."

After a change, ask it to run `bun run test` and `bun run lint` to check nothing broke.

## Use another model for chat

Chat can run on almost any model. Voice calls always use OpenAI's realtime model.

In `.env.local`:

```bash
# An OpenAI model: uses your OPENAI_API_KEY
CHAT_MODEL=gpt-5.6-luna

# Or any provider/model through Vercel AI Gateway (one key for all providers)
CHAT_MODEL=anthropic/claude-sonnet-5-5
AI_GATEWAY_API_KEY=your-gateway-key
```

Get a gateway key and the list of model names at [vercel.com/ai-gateway](https://vercel.com/ai-gateway). Leave `CHAT_MODEL` empty to use the default OpenAI model.

## Costs and limits

- **Voice calls cost the most.** They are billed per minute of audio. Calls end after 8 minutes or 45 seconds of silence.
- Limits stop one person (or a bot) from running up your bill: messages per 10 minutes, and calls per hour per visitor, per IP and in total.
- Change all of these in `limits` in `src/agent/config.ts`.
- Set a monthly spending limit in your OpenAI dashboard too.

## Keep conversations (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL editor**, paste everything from `supabase/migrations/0001_agent.sql`, and run it.
3. In **Project Settings > API**, copy the URL and the `service_role` key into `.env.local`:
   ```bash
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

The `service_role` key is a secret. Never put it in browser code or share it. The tables only allow the server to read and write them.

## Put it online (Vercel)

1. Push your copy to GitHub.
2. On [vercel.com](https://vercel.com), choose **Add New > Project** and import the repo.
3. Add the same settings from `.env.local` under **Environment Variables**.
4. Deploy.

Use Supabase when it is online. Memory storage does not work there, because each request can run on a different server.

## Problems

- **Call button does nothing, or no sound:** allow the microphone in the browser (the icon next to the address bar). Calls need `localhost` or `https`.
- **"The call didn't connect":** check `OPENAI_API_KEY` in `.env.local`, and that your OpenAI account has credit. Restart `bun run dev` after editing that file.
- **Conversations disappear:** without Supabase, they are kept in memory only and are lost on restart.
- **"That is a lot of messages at once":** you hit a rate limit. Wait a few minutes, or raise it in `src/agent/config.ts`.

## How it works (for developers)

```
browser ── POST /api/chat (newest message only) ──▶ guard ▶ rate limits ▶ Agent (stream) ──▶ useChat
        ◀────────────── UI message stream (text, tool parts) ──────────────┘   after(): transcript, history, usage

browser ── POST /api/voice (WebRTC offer) ──▶ OpenAI /v1/realtime/calls (prompt + tool schemas stay on the server)
   │  data channel: transcripts, function calls
   ├── POST /api/voice/tool  → runs the tool on the server with the server's context
   └── POST /api/voice/turn  → saves each spoken turn to the transcript and the shared history (guard runs here too)
```

- **One brain** (`src/lib/agent/run.ts`): one `Agent`, one prompt builder. `channel` (`web` | `voice`) switches the rules: chips for web, short spoken sentences and read-back before writes for voice.
- **Any chat model**: `chatModel()` passes a bare name to OpenAI and wraps `provider/model` with `aisdk(gateway(id))`.
- **Prompt caching**: static rules first, per-user lines last, so the provider can reuse the long prefix.
- **History on the server** (`conversations.history`): the client cannot rewrite what the model saw. `trimHistory` always cuts at a user turn so a tool result never loses its call.
- **Deterministic safety first**: `config.guard(text)` runs before the model (a regex is cheaper and more reliable than another model call). `unforge` strips `[Staff]`/`[System]` tags users type.
- **Tool context from the server**: tools get `visitorId` and `channel` from the server, never from the model's arguments.
- **Empty final answers**: newer models can put their words in "commentary" messages and end with an empty final answer; `replyText` saves what the user actually saw.
- **Storage**: the interface is `src/lib/store/index.ts` (memory or Supabase). Add another backend by implementing it.

### Add a tool (code)

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

## Not included

Add these when a project needs them:

- User login and per-user accounts
- Answers from your own documents (RAG)
- Phone numbers, WhatsApp, SMS
- Human handoff and a staff inbox
- An embeddable widget for other sites

## Scripts

```bash
bun run dev    # start locally
bun run test   # tests (vitest)
bun run lint   # code checks
bun run build  # production build
```

## License

MIT. See [LICENSE](LICENSE).
