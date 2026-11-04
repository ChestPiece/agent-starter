import { config } from "@/agent/config";
import { getStore } from "@/lib/store";

// Tool and turn posts only count during a call this visitor started recently (a call lasts at most callMaxMs).
export async function inCall(visitorId: string) {
  const since = new Date(Date.now() - config.limits.callMaxMs - 60_000).toISOString();
  return (await getStore().countEvents(visitorId, "call", since)) > 0;
}
