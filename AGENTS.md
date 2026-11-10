<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project map (agent-starter)

A Next.js chat + voice AI assistant template. Most changes happen in `src/agent/`:

- `src/agent/brand.ts`: name, tagline, greeting, starter chips, footer (shown in the browser).
- `src/agent/config.ts`: system rules, tools, `voiceTools`, `writes`, safety `guard`, models, rate limits. Server only.
- `src/agent/tools/*.ts`: tools (`tool()` from `@openai/agents`, parameters as zod). `example.ts` shows the pattern.
- `src/agent/cards.tsx`: optional React card per tool result, keyed by tool name.
- `src/app/globals.css`: shadcn colour tokens.

Rules:

- A new tool must be added to `tools` in `config.ts`. If it changes data, also add its name to `writes`.
- Who is asking (`visitorId`, `channel`) comes from `RunContext<AgentCtx>`, never from tool arguments.
- Voice and chat share `src/lib/agent/run.ts`. Change behaviour there only for both channels.
- Chat model: `CHAT_MODEL` env. Bare name = OpenAI; `provider/model` = Vercel AI Gateway. Voice is OpenAI Realtime only.
- Never expose `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to client code.
- After changes run `bun run test` and `bun run lint`.
