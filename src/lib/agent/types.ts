// Shared agent types. `channel` drives prompt rules and which tools run; branch on it, never on other fields.
export type Channel = "web" | "voice";

/** What every tool gets as run context. It comes from the server, never from the model's arguments. */
export type AgentCtx = { channel: Channel; visitorId: string; visitorName: string | null };
