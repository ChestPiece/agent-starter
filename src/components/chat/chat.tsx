"use client";

// The chat: streaming replies (AI SDK useChat), tool cards, quick-reply chips, history on reload, and a voice call.
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type DynamicToolUIPart, type UIMessage } from "ai";
import { ArrowUpIcon, PhoneCallIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { brand } from "@/agent/brand";
import { toolCards } from "@/agent/cards";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { Button } from "@/components/ui/button";
import { InputGroupAddon } from "@/components/ui/input-group";
import { hasMarker, splitChips } from "@/lib/agent/chips";
import { CallBar, useCall } from "./call";

const KEY = "agent-visitor-id";

// One anonymous id per browser, so the agent remembers the visitor between visits.
function visitorId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) localStorage.setItem(KEY, (id = crypto.randomUUID()));
    return id;
  } catch {
    return crypto.randomUUID(); // storage blocked: this tab only
  }
}

function newChat() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  location.reload();
}

type Line = { id: string; role: string; text: string };
const toUi = (m: Line): UIMessage => ({ id: `h${m.id}`, role: m.role === "user" ? "user" : "assistant", parts: [{ type: "text", text: m.text }] });

// Tool output arrives as the tool's return value; strings are notes meant for the model.
const outputOf = (part: DynamicToolUIPart) => {
  if (part.state !== "output-available") return null;
  const out = part.output;
  if (typeof out !== "string") return out as Record<string, unknown>;
  try {
    return JSON.parse(out) as Record<string, unknown>;
  } catch {
    return null;
  }
};

function ToolPart({ part, send, busy }: { part: DynamicToolUIPart; send: (t: string) => void; busy: boolean }) {
  if (part.state === "input-streaming" || part.state === "input-available") return <Shimmer className="text-sm">One moment…</Shimmer>;
  const out = outputOf(part);
  const Card = toolCards[part.toolName];
  return out && Card ? <Card output={out} send={send} busy={busy} /> : null;
}

function Enter({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
      {children}
    </motion.div>
  );
}

export function Chat() {
  const [id] = useState(visitorId);
  const [history, setHistory] = useState<UIMessage[] | null>(null);
  useEffect(() => {
    fetch(`/api/chat?visitorId=${id}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d: { messages: Line[] }) => setHistory(d.messages.map(toUi)))
      .catch(() => setHistory([]));
  }, [id]);
  return <ChatView id={id} history={history} />;
}

function ChatView({ id, history }: { id: string; history: UIMessage[] | null }) {
  const { messages, setMessages, sendMessage, regenerate, error, clearError, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat", prepareSendMessagesRequest: ({ messages }) => ({ body: { visitorId: id, message: messages.at(-1) } }) }),
  });
  // History lands late: apply it only if the visitor has not typed yet.
  useEffect(() => {
    if (history?.length && messages.length === 0 && status === "ready") setMessages(history);
  }, [history, messages.length, status, setMessages]);
  const busy = status === "submitted" || status === "streaming";
  const send = (text: string) => !busy && text.trim() && sendMessage({ text });

  const call = useCall({
    visitorId: id,
    name: brand.name,
    onTurn: (role, text) => setMessages((ms) => [...ms, { id: `c${Date.now()}-${ms.length}`, role, parts: [{ type: "text", text }] }]),
  });
  const onCall = call.state === "connecting" || call.state === "live";

  // Chips: starters on an empty chat, else the newest reply's hidden marker line.
  const last = messages.at(-1);
  const raw = last?.role === "assistant" ? last.parts.map((p) => (p.type === "text" ? p.text : "")).join("") : "";
  const chips = busy || onCall ? [] : messages.length === 0 ? brand.starters : hasMarker(raw) ? splitChips(raw).chips : [];

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {brand.name[0]}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-medium">{brand.name}</div>
            <div className="text-xs text-muted-foreground">{brand.tagline}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!onCall && (
            <Button size="sm" variant="outline" onClick={() => void call.start()} disabled={busy} aria-label={`Call ${brand.name}`}>
              <PhoneCallIcon className="size-4" /> <span className="hidden sm:inline">Call</span>
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={newChat} aria-label="New chat">
            <PlusIcon className="size-4" /> <span className="hidden sm:inline">New chat</span>
          </Button>
        </div>
      </header>

      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-8 sm:px-6">
          <Message from="assistant">
            <MessageContent>
              <MessageResponse>{brand.greeting}</MessageResponse>
            </MessageContent>
          </Message>
          {messages.map((m) => (
            <Enter key={m.id}>
              <Message from={m.role}>
                <MessageContent dir="auto">
                  {m.parts.map((p, i) =>
                    p.type === "text" ? (
                      (m.role === "user" ? p.text : splitChips(p.text).text) && <MessageResponse key={i}>{m.role === "user" ? p.text : splitChips(p.text).text}</MessageResponse>
                    ) : p.type === "dynamic-tool" ? (
                      <ToolPart key={i} part={p} send={send} busy={busy} />
                    ) : null,
                  )}
                </MessageContent>
              </Message>
            </Enter>
          ))}
          {status === "submitted" && <Shimmer className="text-sm">{`${brand.name} is thinking…`}</Shimmer>}
          {error && (
            <div role="alert" className="flex w-fit items-center gap-3 rounded-md border border-dashed border-destructive px-4 py-3 text-sm">
              That message did not go through.
              <Button size="sm" variant="outline" onClick={() => (clearError(), void regenerate())}>
                <RotateCcwIcon className="size-3.5" /> Try again
              </Button>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pb-4 pt-1 sm:px-6">
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <Suggestion key={c} suggestion={c} onClick={(q) => void send(q)} className="h-8 text-[13px]" />
            ))}
          </div>
        )}
        {call.error && (
          <p role="alert" className="text-center text-sm text-destructive">
            {call.error}
          </p>
        )}
        {onCall ? (
          <CallBar call={call} name={brand.name} />
        ) : (
          <PromptInput onSubmit={({ text }) => void send(text)} className="[&_[data-slot=input-group]]:h-auto [&_[data-slot=input-group]]:items-end [&_[data-slot=input-group]]:rounded-2xl">
            <PromptInputBody>
              <PromptInputTextarea dir="auto" placeholder={`Message ${brand.name}…`} rows={1} className="min-h-0 py-3.5 ps-4" />
            </PromptInputBody>
            <InputGroupAddon align="inline-end">
              <PromptInputSubmit status={status} onStop={stop} className="rounded-full">
                {status === "ready" ? <ArrowUpIcon className="size-4" /> : undefined}
              </PromptInputSubmit>
            </InputGroupAddon>
          </PromptInput>
        )}
        <p className="text-center text-[11px] text-muted-foreground">{brand.footer}</p>
      </div>
    </div>
  );
}
