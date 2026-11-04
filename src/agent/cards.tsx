"use client";

// Optional rich cards for tool results in the chat (a slot picker, an order summary, a chart...).
// Key = tool name, value = a component that gets the tool's output. Tools without a card just show the model's text.
import { ClockIcon, StickyNoteIcon } from "lucide-react";
import type { ReactNode } from "react";

export type CardProps = { output: Record<string, unknown>; send: (text: string) => void; busy: boolean };

const Card = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <div className="flex w-fit max-w-[85%] items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
    <span className="text-muted-foreground">{icon}</span>
    <div className="min-w-0">{children}</div>
  </div>
);

export const toolCards: Record<string, (p: CardProps) => ReactNode> = {
  get_time: ({ output }) =>
    typeof output.now === "string" ? (
      <Card icon={<ClockIcon className="size-4" />}>
        <div className="font-medium">{output.now}</div>
        <div className="text-xs text-muted-foreground">{String(output.timeZone)}</div>
      </Card>
    ) : null,
  save_note: ({ output }) =>
    output.saved ? (
      <Card icon={<StickyNoteIcon className="size-4" />}>
        <div className="text-xs text-muted-foreground">Note saved</div>
        <div>{String(output.text)}</div>
      </Card>
    ) : null,
};
