// Two example tools: one read (get_time) and one write (save_note). Copy the shape for your own.
import { tool, type RunContext } from "@openai/agents";
import { z } from "zod";
import type { AgentCtx } from "@/lib/agent/types";
import { getStore } from "@/lib/store";

export const getTime = tool({
  name: "get_time",
  description: "The current date and time in an IANA time zone, e.g. Asia/Tokyo.",
  parameters: z.object({ timeZone: z.string().describe("IANA time zone, e.g. Europe/London") }),
  async execute({ timeZone }) {
    try {
      return { timeZone, now: new Date().toLocaleString("en-GB", { timeZone, dateStyle: "full", timeStyle: "short" }) };
    } catch {
      return `Unknown time zone ${timeZone}. Ask the user for a city.`;
    }
  },
});

export const saveNote = tool({
  name: "save_note",
  description: "Save a short note for the user. Only when they ask to save or remember something.",
  parameters: z.object({ text: z.string().min(1).max(500) }),
  // The visitor comes from the run context (the server), never from the model's arguments.
  async execute({ text }, rc?: RunContext<AgentCtx>) {
    const ctx = rc!.context;
    await getStore().logEvent(ctx.visitorId, "note", text);
    return { saved: true, text };
  },
});
