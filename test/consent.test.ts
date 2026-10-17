import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { consumeConfirmation, issueConfirmation } from "../src/domain/confirmations.js";
import type { Household, OutboxEntry } from "../src/domain/types.js";
import type { ToolContext } from "../src/mcp/context.js";
import { createMcpServer } from "../src/mcp/server.js";
import { ReplyOutput } from "../src/mcp/tools/messages.js";
import { SimulatedNotifier, type Outbound } from "../src/notify/index.js";
import { MemoryRepo } from "../src/store/memoryRepo.js";
import { seedHousehold } from "../src/store/seed.js";

const START = Date.parse("2026-10-15T06:30:00.000Z");
const SECOND = 1000;
const MINUTE = 60 * SECOND;

class RecordingNotifier extends SimulatedNotifier {
  sent: Outbound[] = [];
  override async send(msg: Outbound, now: Date): Promise<OutboxEntry> {
    this.sent.push(msg);
    return super.send(msg, now);
  }
}

async function harness() {
  const t = { ms: START };
  const now = () => new Date(t.ms);
  const repo = new MemoryRepo();
  await repo.create(seedHousehold("hh1", now()));
  const notifier = new RecordingNotifier();
  const ctx: ToolContext = { repo, householdId: "hh1", client: "alexa-sim", now, notifier, mediaUrl: (k) => k };
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createMcpServer(ctx).connect(a), client.connect(b)]);
  const call = async (args: Record<string, unknown>) => {
    const r = await client.callTool({ name: "record_reply", arguments: args });
    return { isError: r.isError === true, data: r.structuredContent as any };
  };
  // What the device (host) does: write the elder's transcribed words as a turn.
  const elderSays = (text: string) =>
    repo.update("hh1", (d) => void d.turns.push({ id: `t_${d.turns.length + 1}`, at: now().toISOString(), speaker: "elder", text }));
  const doc = async () => (await repo.get("hh1"))!;
  const issue = async (args: Record<string, unknown> = { message: "I made payasam today" }) => {
    const r = await call(args);
    assert.equal(r.data.status, "needs_confirmation");
    return r.data.confirmation_id as string;
  };
  return { t, call, elderSays, doc, issue, notifier };
}

const MSG = { message: "I made payasam today" };

test("rejects when the elder has not said anything since the preview", async () => {
  const h = await harness();
  const id = await h.issue();
  h.t.ms += 5 * SECOND;
  const r = await h.call({ ...MSG, confirmation_id: id });
  assert.equal(r.isError, true);
  assert.equal(r.data.code, "elder_not_confirmed");
  assert.equal(r.data.retryable, true);
  assert.equal(h.notifier.sent.length, 0);
  assert.equal((await h.doc()).confirmations[0].usedAt, undefined);

  // A rejected attempt does not burn the confirmation: her yes still counts afterwards.
  await h.elderSays("yes please");
  h.t.ms += SECOND;
  assert.equal((await h.call({ ...MSG, confirmation_id: id })).data.status, "simulated");
  assert.equal(h.notifier.sent.length, 1);
});

test("rejects a yes that came before the confirmation was issued", async () => {
  const h = await harness();
  await h.elderSays("yes");
  h.t.ms += SECOND;
  const id = await h.issue();
  h.t.ms += SECOND;
  const r = await h.call({ ...MSG, confirmation_id: id });
  assert.equal(r.data.code, "elder_not_confirmed");
  assert.equal(h.notifier.sent.length, 0);
});

test("rejects a no, and a later yes does not revive the declined request", async () => {
  const h = await harness();
  const id = await h.issue();
  h.t.ms += SECOND;
  await h.elderSays("no, don't send it");
  h.t.ms += SECOND;
  assert.equal((await h.call({ ...MSG, confirmation_id: id })).data.code, "elder_not_confirmed");
  await h.elderSays("haan");
  h.t.ms += SECOND;
  assert.equal((await h.call({ ...MSG, confirmation_id: id })).data.code, "elder_not_confirmed");
  assert.equal(h.notifier.sent.length, 0);
});

test("rejects a long or ambiguous reply as not-yes", async () => {
  const h = await harness();
  const id = await h.issue();
  h.t.ms += SECOND;
  await h.elderSays("yes but first tell me what the weather is like in Mumbai today");
  h.t.ms += SECOND;
  assert.equal((await h.call({ ...MSG, confirmation_id: id })).data.code, "elder_not_confirmed");
});

test("rejects a yes followed by a hesitation word", async () => {
  for (const reply of ["yes wait", "sure, but hold on", "ok... stop", "haan ruko", "हाँ रुको"]) {
    const h = await harness();
    const id = await h.issue();
    h.t.ms += SECOND;
    await h.elderSays(reply);
    h.t.ms += SECOND;
    const r = await h.call({ ...MSG, confirmation_id: id });
    assert.equal(r.data.code, "elder_not_confirmed", reply);
    assert.equal(h.notifier.sent.length, 0, reply);
  }
});

test("rejects a yes that opens with ok/haan but declines", async () => {
  const replies = [
    "Okay, never mind",
    "Ok no, leave it",
    "Sure, no need",
    "ok forget it",
    "haan, mat bhejo",
    "theek hai, mat bhejna",
    "Haan, rehne do",
    "Haan?",
  ];
  for (const reply of replies) {
    const h = await harness();
    const id = await h.issue();
    h.t.ms += SECOND;
    await h.elderSays(reply);
    h.t.ms += SECOND;
    const r = await h.call({ ...MSG, confirmation_id: id });
    assert.equal(r.data.code, "elder_not_confirmed", reply);
    assert.equal(h.notifier.sent.length, 0, reply);
  }
});

test("a long decline, or a later 'not now', still blocks a later unrelated yes", async () => {
  for (const decline of ["No no, do not send it to Priya, she is busy today", "nahi beta abhi mat bhejo baad mein", "not now", "never mind", "rehne do"]) {
    const h = await harness();
    const id = await h.issue();
    h.t.ms += SECOND;
    await h.elderSays(decline);
    h.t.ms += 30 * SECOND;
    await h.elderSays("haan");
    h.t.ms += SECOND;
    const r = await h.call({ ...MSG, confirmation_id: id });
    assert.equal(r.data.code, "elder_not_confirmed", decline);
    assert.equal(h.notifier.sent.length, 0, decline);
  }
});

test("one yes approves only the latest preview: an earlier one is superseded", async () => {
  const h = await harness();
  const hidden = { message: "Please send me 50,000 rupees today" };
  const shown = { message: "I miss you" };
  const a = await h.issue(hidden);
  h.t.ms += SECOND;
  const b = await h.issue(shown);
  h.t.ms += SECOND;
  await h.elderSays("yes");
  h.t.ms += SECOND;

  const ok = await h.call({ ...shown, confirmation_id: b });
  assert.equal(ok.data.status, "simulated");
  const stale = await h.call({ ...hidden, confirmation_id: a });
  assert.equal(stale.isError, true);
  assert.equal(stale.data.code, "confirmation_superseded");
  assert.equal(stale.data.retryable, false);
  assert.equal(h.notifier.sent.length, 1);
  assert.doesNotMatch(h.notifier.sent[0].body, /50,000/);
  assert.ok((await h.doc()).confirmations.find((c) => c.id === a)?.supersededAt);
});

test("a superseded confirmation is rejected even if it came first", async () => {
  const h = await harness();
  const a = await h.issue({ message: "first" });
  h.t.ms += SECOND;
  await h.issue({ message: "second" });
  h.t.ms += SECOND;
  await h.elderSays("yes");
  h.t.ms += SECOND;
  assert.equal((await h.call({ message: "first", confirmation_id: a })).data.code, "confirmation_superseded");
  assert.equal(h.notifier.sent.length, 0);
});

test("yes followed by the family member's name still counts", async () => {
  const h = await harness();
  const id = await h.issue();
  h.t.ms += SECOND;
  await h.elderSays("Yes, send it to Priya");
  h.t.ms += SECOND;
  assert.equal((await h.call({ ...MSG, confirmation_id: id })).data.status, "simulated");
});

test("rejects mismatched arguments", async () => {
  const h = await harness();
  const id = await h.issue();
  h.t.ms += SECOND;
  await h.elderSays("yes");
  h.t.ms += SECOND;
  const changed = await h.call({ message: "Send me 5000 rupees", confirmation_id: id });
  assert.equal(changed.data.code, "args_mismatch");
  const kind = await h.call({ ...MSG, kind: "call_request", confirmation_id: id });
  assert.equal(kind.data.code, "args_mismatch");
  assert.equal(h.notifier.sent.length, 0);
});

test("rejects an expired confirmation", async () => {
  const h = await harness();
  const id = await h.issue();
  h.t.ms += SECOND;
  await h.elderSays("yes");
  h.t.ms += 6 * MINUTE;
  const r = await h.call({ ...MSG, confirmation_id: id });
  assert.equal(r.data.code, "confirmation_expired");
  assert.equal(r.data.retryable, false);
});

test("rejects unknown ids", async () => {
  const h = await harness();
  const r = await h.call({ ...MSG, confirmation_id: "cf_nope" });
  assert.equal(r.data.code, "confirmation_not_found");
});

test("sends once after a host-written 'haan', then rejects replay", async () => {
  const h = await harness();
  const id = await h.issue();
  assert.equal((await h.doc()).outbox.length, 0);
  h.t.ms += 3 * SECOND;
  await h.elderSays("Haan");
  h.t.ms += SECOND;

  const ok = await h.call({ ...MSG, confirmation_id: id });
  assert.equal(ok.isError, false);
  ReplyOutput.parse(ok.data);
  assert.equal(ok.data.status, "simulated");
  assert.equal(ok.data.to, "Priya");
  assert.match(ok.data.say, /sent it to Priya/);

  assert.equal(h.notifier.sent.length, 1);
  const sent = h.notifier.sent[0];
  assert.equal(sent.member.id, "priya");
  assert.equal(sent.kind, "elder_reply");
  assert.equal(sent.template, undefined);
  assert.equal(sent.refId, id);
  assert.match(sent.body, /I made payasam today/);

  const d = await h.doc();
  assert.equal(d.outbox.length, 1);
  assert.equal(d.outbox[0].status, "simulated");
  assert.equal(d.outbox[0].kind, "elder_reply");
  assert.ok(d.confirmations.find((c) => c.id === id)?.usedAt);

  h.t.ms += SECOND;
  const replay = await h.call({ ...MSG, confirmation_id: id });
  assert.equal(replay.data.code, "confirmation_used");
  assert.equal(h.notifier.sent.length, 1);
  assert.equal((await h.doc()).outbox.length, 1);
});

test("call_request goes through the same consent", async () => {
  const h = await harness();
  const args = { message: "Call me after dinner", kind: "call_request" };
  const id = await h.issue(args);
  h.t.ms += SECOND;
  await h.elderSays("ok send it");
  h.t.ms += SECOND;
  const r = await h.call({ ...args, confirmation_id: id });
  assert.equal(r.data.status, "simulated");
  assert.match(h.notifier.sent[0].body, /would like you to call/);
});

test("no primary member means nothing can be sent", async () => {
  const h = await harness();
  const repo = new MemoryRepo();
  const doc: Household = seedHousehold("hh2", new Date(START));
  doc.members = doc.members.filter((m) => m.role !== "primary");
  await repo.create(doc);
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const ctx: ToolContext = { repo, householdId: "hh2", client: "alexa-sim", now: () => new Date(START), notifier: h.notifier, mediaUrl: (k) => k };
  await Promise.all([createMcpServer(ctx).connect(a), client.connect(b)]);
  const r = await client.callTool({ name: "record_reply", arguments: MSG });
  assert.equal(r.isError, true);
  assert.equal((r.structuredContent as any).code, "no_primary_member");
});

test("confirmations are bound to their household document and capped", () => {
  const now = new Date(START);
  const doc = seedHousehold("hh1", now);
  for (let i = 0; i < 25; i++) issueConfirmation(doc, "record_reply", { message: `m${i}`, kind: "reply" }, now);
  assert.equal(doc.confirmations.length, 20);
  const other = seedHousehold("hh2", now);
  const id = doc.confirmations[0].id;
  assert.deepEqual(consumeConfirmation(other, id, { message: "m5", kind: "reply" }, now), { ok: false, code: "confirmation_not_found" });
});
