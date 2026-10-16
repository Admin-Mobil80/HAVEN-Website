import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { Member } from "../src/domain/types.js";
import { WhatsAppNotifier } from "../src/notify/whatsapp.js";
import { sanitizeParam, WhatsAppClient } from "../src/notify/whatsappClient.js";
import { actionOf } from "../src/routes/webhooks.js";
import { MemoryRepo } from "../src/store/memoryRepo.js";
import { seedHousehold } from "../src/store/seed.js";
import { SECRET, startApp } from "./helpers/httpHarness.js";

const APP_SECRET = "test-app-secret";
const VERIFY = "verify-me";
const PRIYA = "919800000002";

type Sent = { url: string; body: any };

// Fake Graph API: records every call and answers like Meta does.
function fakeGraph(opts: { fail?: boolean } = {}) {
  const sent: Sent[] = [];
  let n = 0;
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("https://lookaside.example/")) return new Response(Buffer.from("OggS-fake-audio"), { status: 200 });
    let body: any = init?.body;
    if (typeof body === "string") body = JSON.parse(body);
    sent.push({ url: u, body });
    if (opts.fail) return Response.json({ error: { code: 131047, message: "Re-engagement message" } }, { status: 400 });
    if (u.endsWith("/media")) return Response.json({ id: "media-1" });
    if (/\/v23\.0\/inbound-media-\d+$/.test(u)) return Response.json({ url: "https://lookaside.example/x", mime_type: "audio/ogg" });
    return Response.json({ messages: [{ id: `wamid.${++n}` }] });
  }) as typeof fetch;
  return { sent, client: new WhatsAppClient({ token: "t", phoneNumberId: "PN", fetch: f }) };
}

const member = (over: Partial<Member> = {}): Member => ({
  id: "priya",
  name: "Priya",
  relation: "daughter",
  role: "primary",
  phone: PRIYA,
  waOptIn: { by: "priya", at: "2026-10-16T00:00:00.000Z" },
  ...over,
});
const NOW = new Date("2026-10-17T10:00:00.000Z");
const alert = (m: Member, householdId = "owner") => ({
  householdId,
  member: m,
  kind: "urgent_alert" as const,
  body: "Haven alert: Kamala may need you right now.",
  template: { name: "haven_urgent_alert", params: ["Kamala", "+91 90000\n00001"] },
});

test("template params are sanitised (no newlines, no long space runs)", () => {
  assert.equal(sanitizeParam("a\nb\t c    d"), "a b c d");
  assert.equal(sanitizeParam("x".repeat(400)).length, 300);
});

test("notifier: non-live households and members without opt-in stay simulated", async () => {
  const g = fakeGraph();
  const n = new WhatsAppNotifier(g.client, (hh) => hh === "owner");
  assert.equal((await n.send(alert(member(), "demo-1"), NOW)).status, "simulated");
  assert.equal((await n.send(alert(member({ waOptIn: undefined })), NOW)).status, "simulated");
  assert.equal(g.sent.length, 0);
});

test("notifier: outside the 24 h window it sends the approved template", async () => {
  const g = fakeGraph();
  const e = await new WhatsAppNotifier(g.client, () => true).send(alert(member()), NOW);
  assert.equal(e.status, "sent");
  assert.equal(e.wamid, "wamid.1");
  assert.equal(g.sent[0].body.type, "template");
  assert.equal(g.sent[0].body.template.name, "haven_urgent_alert");
  assert.equal(g.sent[0].body.template.components[0].parameters[1].text, "+91 90000 00001");
});

test("notifier: inside the window it sends free-form with the Calling now button", async () => {
  const g = fakeGraph();
  const m = member({ lastInboundAt: new Date(NOW.getTime() - 60_000).toISOString() });
  await new WhatsAppNotifier(g.client, () => true).send(alert(m), NOW);
  assert.equal(g.sent[0].body.type, "interactive");
  assert.deepEqual(g.sent[0].body.interactive.action.buttons.map((b: any) => b.reply.title), ["Calling now"]);
});

test("notifier: a Graph error becomes a failed outbox entry, never a throw", async () => {
  const g = fakeGraph({ fail: true });
  const e = await new WhatsAppNotifier(g.client, () => true).send(alert(member()), NOW);
  assert.equal(e.status, "failed");
  assert.match(e.error ?? "", /wa_131047/);
});

test("button routing works for template quick replies and interactive replies", () => {
  assert.equal(actionOf({ from: "1", id: "a", type: "button", button: { text: "I will call tonight" } }), "call_tonight");
  assert.equal(actionOf({ from: "1", id: "a", type: "button", button: { payload: "Play voice note" } }), "play_voice_note");
  assert.equal(actionOf({ from: "1", id: "a", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "calling_now", title: "Calling now" } } }), "calling_now");
  assert.equal(actionOf({ from: "1", id: "a", type: "audio", audio: { id: "m" } }), "audio");
});

// --- webhook over HTTP ---

async function webhookApp() {
  const repo = new MemoryRepo();
  const doc = seedHousehold("owner", NOW, { demo: false });
  doc.members[0].phone = PRIYA;
  await repo.create(doc);
  await repo.mapPhone(PRIYA, "owner");
  const g = fakeGraph();
  const stored = new Map<string, Buffer>();
  const media = { put: async (k: string, d: Buffer) => void stored.set(k, d), getBytes: async (k: string) => stored.get(k) };
  const h = await startApp({ repo, now: () => NOW, whatsapp: { client: g.client, appSecret: APP_SECRET, verifyToken: VERIFY, media, voiceNote: async () => Buffer.from("ogg") } });
  const post = (payload: object, sig?: string) => {
    const raw = JSON.stringify(payload);
    const signature = sig ?? `sha256=${createHmac("sha256", APP_SECRET).update(raw).digest("hex")}`;
    return h.request("POST", "/webhooks/whatsapp", { headers: { "content-type": "application/json", "x-hub-signature-256": signature }, body: raw });
  };
  const msg = (m: object) => ({ entry: [{ changes: [{ value: { messages: [{ from: PRIYA, ...m }] } }] }] });
  return { h, repo, g, stored, post, msg };
}

test("webhook: Meta verification handshake", async () => {
  const w = await webhookApp();
  try {
    const ok = await w.h.request("GET", `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`);
    assert.equal(ok.status, 200);
    assert.equal(ok.text, "12345");
    assert.equal((await w.h.request("GET", "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1")).status, 403);
  } finally {
    await w.h.close();
  }
});

test("webhook: bad signature is rejected; a duplicate delivery is processed once", async () => {
  const w = await webhookApp();
  try {
    const payload = w.msg({ id: "wamid.in1", type: "button", button: { text: "I will call tonight" } });
    assert.equal((await w.post(payload, "sha256=deadbeef")).status, 401);
    assert.equal((await w.post(payload)).status, 200);
    assert.equal((await w.post(payload)).status, 200);
    const doc = (await w.repo.get("owner"))!;
    assert.equal(doc.messages.filter((m) => m.kind === "call_promise").length, 1, "deduped");
    assert.ok(doc.members[0].lastInboundAt, "24 h window reopened");
    assert.equal(doc.reminders.filter((r) => r.source === "call_promise").length, 1);
    assert.match(w.g.sent.at(-1)!.body.text.body, /you'll call tonight/);
  } finally {
    await w.h.close();
  }
});

test("webhook: Calling now acknowledges the open incident and logs a call", async () => {
  const w = await webhookApp();
  try {
    await w.repo.update("owner", (d) => {
      d.incidents.push({ id: "inc_1", tier: "urgent", emergency: false, source: "rule", reason: "dizzy", elderWords: "dizzy", state: "open", openedAt: NOW.toISOString(), timeline: [] });
    });
    await w.post(w.msg({ id: "wamid.in2", type: "button", button: { text: "Calling now" } }));
    const doc = (await w.repo.get("owner"))!;
    assert.equal(doc.incidents[0].state, "acknowledged");
    assert.equal(doc.incidents[0].ackBy, "priya");
    assert.equal(doc.contacts.filter((c) => !c.demoSeed).length, 1);
  } finally {
    await w.h.close();
  }
});

test("webhook: Priya's voice note is stored and answers the open deferral", async () => {
  const w = await webhookApp();
  try {
    await w.repo.update("owner", (d) => {
      d.deferrals.push({ id: "d_1", topic: "visit", question: "Will you come for Diwali?", context: "", status: "open", createdAt: NOW.toISOString() });
    });
    await w.post(w.msg({ id: "wamid.in3", type: "audio", audio: { id: "inbound-media-1", mime_type: "audio/ogg" } }));
    const doc = (await w.repo.get("owner"))!;
    const reply = doc.messages.at(-1)!;
    assert.equal(reply.kind, "deferral_answer");
    assert.equal(reply.inReplyTo, "d_1");
    assert.equal(doc.deferrals[0].status, "answered");
    assert.ok(w.stored.has(reply.audioKey!), "recording stored");
    assert.match(w.g.sent.at(-1)!.body.text.body, /her own voice|your own voice/);
  } finally {
    await w.h.close();
  }
});

test("webhook: Play voice note with no digest yet answers in text", async () => {
  const w = await webhookApp();
  try {
    await w.post(w.msg({ id: "wamid.in4", type: "button", button: { text: "Play voice note" } }));
    assert.match(w.g.sent.at(-1)!.body.text.body, /no update yet/i);
  } finally {
    await w.h.close();
  }
});

test("webhook: unknown senders are ignored", async () => {
  const w = await webhookApp();
  try {
    const r = await w.post({ entry: [{ changes: [{ value: { messages: [{ from: "910000000999", id: "wamid.x", type: "text", text: { body: "hi" } }] } }] }] });
    assert.equal(r.status, 200);
    assert.equal(w.g.sent.length, 0);
  } finally {
    await w.h.close();
  }
});

test("admin: owner household needs the admin key and maps the phones", async () => {
  const repo = new MemoryRepo();
  const h = await startApp({ repo, adminKey: "admin-key-123" });
  try {
    const body = { priyaPhone: PRIYA, raviPhone: "919800000003" };
    assert.equal((await h.request("POST", "/api/admin/owner", { body })).status, 401);
    const r = await h.request("POST", "/api/admin/owner", { headers: { "x-haven-admin": "admin-key-123" }, body });
    assert.equal(r.status, 201);
    assert.match(r.json().familyLink, /^\/family#t=owner\./);
    assert.equal(await repo.householdForPhone(PRIYA), "owner");
    const doc = (await repo.get("owner"))!;
    assert.equal(doc.demo, false);
    assert.ok(doc.members[0].waOptIn);
    assert.equal(doc.contacts.length, 0);
    assert.equal((await h.request("POST", "/api/admin/owner", { headers: { "x-haven-admin": "admin-key-123" }, body })).status, 409);
    void SECRET;
  } finally {
    await h.close();
  }
});
