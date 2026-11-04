// The agent brain shared by chat and voice: one Agent, the prompt builder, and the voice tool bridge.
import { Agent, run, RunContext, type AgentInputItem, type FunctionTool, type RunItem } from "@openai/agents";
import { config } from "@/agent/config";
import { CHIPS_RULE } from "./chips";
import type { AgentCtx, Channel } from "./types";

const VOICE_RULES = `This is a live voice call.
- Short spoken sentences: one or two per turn, then one question. No markdown, lists, links, emoji or symbols: everything you write is read aloud.
- The caller sees nothing. Never say "type", "tap", "click" or "in this chat".
- Before a tool call, say one short line ("One moment."), then give the result in the same turn.
- Before any tool that changes data, read the details back and wait for a clear yes.
- If you did not catch something, ask once to repeat it. Never guess a name, number or time.`;

// Static rules first, per-minute and per-user lines last, so OpenAI prompt caching can reuse the long prefix.
export function buildInstructions(channel: Channel, visitorName: string | null, now = new Date()) {
  return [
    config.rules,
    channel === "voice" ? VOICE_RULES : config.chips ? CHIPS_RULE : "",
    `Now: ${now.toISOString()} (UTC).`,
    visitorName ? `The user's name: ${visitorName}.` : "",
  ].filter(Boolean).join("\n\n");
}

let agent: Agent<AgentCtx> | undefined;
const theAgent = () =>
  (agent ??= new Agent<AgentCtx>({
    name: config.name,
    instructions: ({ context }) => buildInstructions(context.channel, context.visitorName),
    tools: config.tools,
    ...(config.models.chat ? { model: config.models.chat } : {}),
  }));

export const runAgent = (ctx: AgentCtx, input: AgentInputItem[]) => run(theAgent(), input, { context: ctx });
export const streamAgent = (ctx: AgentCtx, input: AgentInputItem[]) => run(theAgent(), input, { context: ctx, stream: true });

const voiceTools = () => config.voiceTools ?? config.tools;

// Tool definitions for the realtime session config.
export const toolSchemas = () => voiceTools().map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.parameters }));

// Run one voice tool call. The context (who is calling) comes from the server, never from the model's arguments.
export async function runTool(ctx: AgentCtx, name: string, args: string, tools: FunctionTool<AgentCtx>[] = voiceTools()) {
  const t = tools.find((x) => x.name === name);
  if (!t) return `Unknown tool ${name}.`;
  const out = await t.invoke(new RunContext(ctx), args);
  return typeof out === "string" ? out : JSON.stringify(out);
}

// A run that used a write tool did something; useful to log or to keep its reply even if a newer message arrived.
export const wroteData = (items: RunItem[]) =>
  items.some((i) => i.type === "tool_call_item" && "name" in i.rawItem && config.writes.includes(i.rawItem.name));
