import { assistant, user } from "@openai/agents";
import { expect, test } from "vitest";
import { freshMemory, memoryStore } from "./memory";

test("visitors are stable per key, history keeps the newest max items", async () => {
  const s = memoryStore(freshMemory());
  const a = await s.upsertVisitor("k1");
  expect((await s.upsertVisitor("k1")).id).toBe(a.id);
  await s.appendHistory(a.id, [user("1"), assistant("2")], 3);
  await s.appendHistory(a.id, [user("3"), assistant("4")], 3);
  expect((await s.getHistory(a.id)).map((i) => ("content" in i ? JSON.stringify(i.content) : ""))).toHaveLength(3);
});

test("messages: oldest first, `after` returns only newer rows", async () => {
  const s = memoryStore(freshMemory());
  const v = await s.upsertVisitor("k");
  await s.logMessages(v.id, "web", [{ role: "user", body: "a" }, { role: "assistant", body: "b" }]);
  const all = await s.messages(v.id);
  expect(all.map((m) => m.body)).toEqual(["a", "b"]);
  expect((await s.messages(v.id, { after: all[0].id })).map((m) => m.body)).toEqual(["b"]);
});

test("hit: allows max per window, then refuses", async () => {
  const s = memoryStore(freshMemory());
  expect(await s.hit("x", 2, 60)).toBe(true);
  expect(await s.hit("x", 2, 60)).toBe(true);
  expect(await s.hit("x", 2, 60)).toBe(false);
  expect(await s.hit("y", 2, 60)).toBe(true);
});

test("countEvents counts by visitor, kind and time", async () => {
  const s = memoryStore(freshMemory());
  await s.logEvent("v", "call", "c");
  await s.logEvent("v", "note", "n");
  expect(await s.countEvents("v", "call", new Date(Date.now() - 1000).toISOString())).toBe(1);
  expect(await s.countEvents("v", "call", new Date(Date.now() + 1000).toISOString())).toBe(0);
});
