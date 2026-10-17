import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { openOrUpgrade } from "../src/domain/incidents.js";
import { signToken } from "../src/http/households.js";
import { seedHousehold } from "../src/store/seed.js";
import { SECRET, startApp, type Harness } from "./helpers/httpHarness.js";

let h: Harness;
before(async () => {
  h = await startApp({ rateLimits: { demoSession: 100 } });
});
after(async () => {
  await h.close();
});

async function session() {
  const res = await h.request("POST", "/api/demo/session");
  assert.equal(res.status, 201);
  const s = res.json() as { householdId: string; token: string };
  // A new demo session is blank (setup first); these tests use the populated fixture instead.
  await h.repo.put(seedHousehold(s.householdId, new Date(), { demo: true }));
  const auth = { authorization: `Bearer ${s.token}` };
  const get = (path: string) => h.request("GET", path, { headers: auth });
  const post = (path: string, body: object = {}) => h.request("POST", path, { headers: auth, body });
  return { ...s, get, post };
}

async function addDeferral(householdId: string, id: string, question: string) {
  await h.repo.update(householdId, (doc) => {
    doc.deferrals.push({ id, topic: "visit", question, context: "She asked when Priya will visit", status: "open", createdAt: new Date().toISOString() });
  });
}

test("API routes other than health and demo session require a household token", async () => {
  for (const [method, path] of [
    ["GET", "/api/state/elder"],
    ["GET", "/api/state/family"],
    ["GET", "/api/log"],
    ["POST", "/api/calls"],
    ["POST", "/api/messages"],
    ["POST", "/api/deferrals/d_1/answer"],
    ["POST", "/api/incidents/i_1/ack"],
    ["POST", "/api/demo/reset"],
  ] as const) {
    const res = await h.request(method, path, { body: method === "POST" ? {} : undefined });
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.deepEqual(res.json(), { error: "unauthorized" });
  }
  const viaQuery = await h.request("GET", `/api/state/elder?token=${signToken("public-demo", SECRET)}`);
  assert.equal(viaQuery.status, 401, "tokens are never accepted from the query string");
});

test("deferral answer flow: family answers, the deferral closes, Amma's tablet sees a pending message", async () => {
  const s = await session();
  await addDeferral(s.householdId, "d_1", "When are you coming home for Diwali?");

  const fam0 = (await s.get("/api/state/family")).json();
  assert.deepEqual(
    fam0.deferrals.map((d: { id: string; status: string; question: string }) => [d.id, d.status, d.question]),
    [["d_1", "open", "When are you coming home for Diwali?"]],
  );
  assert.equal((await s.get("/api/state/elder")).json().pendingFamilyMessages, 0);

  const res = await s.post("/api/deferrals/d_1/answer", { text: "  I'm booking tickets for the 30th, Amma!  " });
  assert.equal(res.status, 201);
  const { messageId, deferralId } = res.json();
  assert.equal(deferralId, "d_1");

  const doc = await h.repo.get(s.householdId);
  const d = doc!.deferrals.find((x) => x.id === "d_1")!;
  assert.equal(d.status, "answered");
  assert.equal(d.answerMessageId, messageId);
  assert.ok(d.answeredAt);
  const msg = doc!.messages.find((m) => m.id === messageId)!;
  assert.deepEqual(
    { kind: msg.kind, from: msg.from, text: msg.text, inReplyTo: msg.inReplyTo },
    { kind: "deferral_answer", from: "priya", text: "I'm booking tickets for the 30th, Amma!", inReplyTo: "d_1" },
  );

  assert.equal((await s.get("/api/state/elder")).json().pendingFamilyMessages, 1);
  assert.equal((await s.get("/api/state/family")).json().deferrals[0].status, "answered");

  const again = await s.post("/api/deferrals/d_1/answer", { text: "Second answer" });
  assert.equal(again.status, 409);
  assert.deepEqual(again.json(), { error: "deferral_not_open" });
  assert.equal((await s.post("/api/deferrals/d_missing/answer", { text: "x" })).status, 404);
  const empty = await s.post("/api/deferrals/d_1/answer", { text: "   " });
  assert.equal(empty.status, 400);
  assert.deepEqual(empty.json(), { error: "invalid_body" });
  assert.equal((await s.post("/api/deferrals/d_1/answer", { text: "x".repeat(501) })).status, 400);
});

test("a deferral in one household cannot be answered with another household's token", async () => {
  const a = await session();
  const b = await session();
  await addDeferral(a.householdId, "d_5", "Can you send money for the gas cylinder?");
  const res = await b.post("/api/deferrals/d_5/answer", { text: "Hijack" });
  assert.equal(res.status, 404);
  const doc = await h.repo.get(a.householdId);
  assert.equal(doc!.deferrals[0].status, "open");
});

test("family text messages are queued for the tablet", async () => {
  const s = await session();
  const res = await s.post("/api/messages", { text: "Wear your shawl tonight, it's cold" });
  assert.equal(res.status, 201);
  const doc = await h.repo.get(s.householdId);
  const msg = doc!.messages.find((m) => m.id === res.json().messageId)!;
  assert.equal(msg.kind, "text");
  assert.equal(msg.from, "priya");
  assert.equal((await s.get("/api/state/elder")).json().pendingFamilyMessages, 1);

  const fromRavi = await s.post("/api/messages", { text: "Coming by on Sunday", from: "ravi" });
  assert.equal(fromRavi.status, 201);
  assert.equal((await s.post("/api/messages", { text: "x", from: "stranger" })).status, 400);
  assert.equal((await s.post("/api/messages", {})).status, 400);
});

test("calls metric: a real call is counted, and marked prompted only after a Haven nudge", async () => {
  const s = await session();
  const before = (await s.get("/api/state/family")).json().callStats;
  assert.deepEqual(before, { realCallsThisWeek: 3, promptedByHaven: 3, demoSeeded: 3, goal: 4, baseline: 1 });

  const first = await s.post("/api/calls", { by: "priya" });
  assert.equal(first.status, 201);
  const r1 = first.json();
  assert.equal(r1.realCallsThisWeek, 4);
  assert.equal(r1.promptedByHaven, 3);
  assert.equal(r1.prompted, false);
  assert.ok(r1.contactId);

  await h.repo.update(s.householdId, (doc) => {
    doc.outbox.push({ id: "o_t1", at: new Date().toISOString(), to: "priya", kind: "digest", body: "Today's update", channel: "simulated", status: "simulated" });
  });
  const second = (await s.post("/api/calls", {})).json();
  assert.equal(second.realCallsThisWeek, 5);
  assert.equal(second.promptedByHaven, 4);
  assert.equal(second.prompted, true);

  const doc = await h.repo.get(s.householdId);
  const real = doc!.contacts.filter((c) => !c.demoSeed);
  assert.deepEqual(real.map((c) => [c.type, c.by, c.promptedByHaven]), [["call", "priya", false], ["call", "priya", true]]);

  const elder = (await s.get("/api/state/elder")).json();
  assert.equal(elder.familyCalling?.by, "Priya");

  assert.equal((await s.post("/api/calls", { by: "nobody" })).status, 400);
  assert.equal((await s.get("/api/state/family")).json().callStats.realCallsThisWeek, 5);
});

test("incident routes: acknowledge then close, cancel, and errors", async () => {
  const s = await session();
  const now = new Date();
  const opened = await h.repo.update(s.householdId, (doc) =>
    openOrUpgrade(doc, { tier: "urgent", emergency: true, source: "rule", reason: "fall", elderWords: "I fell in the bathroom" }, now).incident.id,
  );

  const ack = await s.post(`/api/incidents/${opened}/ack`, { by: "priya" });
  assert.equal(ack.status, 200);
  assert.equal(ack.json().incident.state, "acknowledged");
  assert.equal(ack.json().incident.ackBy, "priya");
  assert.ok(!ack.text.includes("bathroom"), "raw elder words are not echoed");

  const elder = (await s.get("/api/state/elder")).json();
  assert.equal(elder.openIncident.id, opened);
  assert.equal(elder.openIncident.state, "acknowledged");

  const close = await s.post(`/api/incidents/${opened}/close`, { by: "ravi" });
  assert.equal(close.status, 200);
  assert.equal(close.json().incident.state, "closed");
  assert.equal(close.json().incident.closedBy, "ravi");
  assert.equal((await s.get("/api/state/elder")).json().openIncident, null);

  const fam = (await s.get("/api/state/family")).json();
  const events = fam.incidents[0].timeline.map((e: { event: string }) => e.event);
  assert.ok(events.includes("acknowledged") && events.includes("closed"), events.join(","));

  const late = await s.post(`/api/incidents/${opened}/cancel`);
  assert.equal(late.status, 409);
  assert.deepEqual(late.json(), { error: "incident_not_active" });

  const second = await h.repo.update(s.householdId, (doc) =>
    openOrUpgrade(doc, { tier: "important", emergency: false, source: "agent", reason: "not_eating", elderWords: "I skipped lunch" }, new Date()).incident.id,
  );
  assert.notEqual(second, opened);
  const cancel = await s.post(`/api/incidents/${second}/cancel`);
  assert.equal(cancel.status, 200);
  assert.equal(cancel.json().incident.state, "cancelled");
  assert.equal(cancel.json().incident.closedBy, "priya", "defaults to the primary member");

  assert.equal((await s.post("/api/incidents/i_missing/ack")).status, 404);
  assert.equal((await s.post(`/api/incidents/${second}/reopen`)).status, 404);
  assert.equal((await s.post(`/api/incidents/${second}/constructor`)).status, 404);
  assert.equal((await s.post(`/api/incidents/${second}/ack`, { by: "stranger" })).status, 400);
});

test("activity log route filters by since and redacts private text", async () => {
  const s = await session();
  const secret = "Hid the pension passbook inside the rice tin";
  await h.repo.update(s.householdId, (doc) => {
    doc.memories.push({ id: "m_900", type: "other", content: secret, private: true, source: "conversation", createdAt: new Date().toISOString() });
  });
  await h.repo.appendLog(s.householdId, { at: "2026-10-15T10:00:00.000Z", client: "inspector", kind: "mcp", method: "tools/list", summary: "tools/list" });
  await h.repo.appendLog(s.householdId, { at: "2026-10-15T10:05:00.000Z", client: "inspector", kind: "mcp", method: "tools/call", tool: "remember", summary: `remember: ${secret}` });

  const all = (await s.get("/api/log")).json().entries;
  assert.equal(all.length, 2);
  assert.ok(!JSON.stringify(all).includes("passbook"));
  assert.equal(all[1].summary, "remember: [private]");

  const since = (await s.get("/api/log?since=2026-10-15T10:01:00.000Z")).json().entries;
  assert.deepEqual(since.map((e: { method: string }) => e.method), ["tools/call"]);
  assert.equal((await s.get("/api/log?limit=0")).status, 400);
});

test("demo reset re-seeds a demo household and refuses the owner household", async () => {
  const s = await session();
  await s.post("/api/messages", { text: "Hello Amma" });
  await s.post("/api/calls", {});
  const before = await h.repo.get(s.householdId);
  assert.equal(before!.messages.length, 1);

  const res = await s.post("/api/demo/reset");
  assert.equal(res.status, 200);
  const after = await h.repo.get(s.householdId);
  assert.equal(after!.messages.length, 0);
  assert.equal(after!.contacts.length, 0);
  assert.equal(after!.configured, false, "reset goes back to setup");
  assert.ok(after!.version > before!.version);
  assert.equal(after!.demo, true);

  await h.repo.create(seedHousehold("owner-api", new Date(), { demo: false }));
  const owner = await h.request("POST", "/api/demo/reset", { headers: { authorization: `Bearer ${signToken("owner-api", SECRET)}` } });
  assert.equal(owner.status, 403);
  assert.deepEqual(owner.json(), { error: "not_a_demo_household" });
});

test("demo session creation is rate limited separately", async () => {
  const limited = await startApp({ rateLimits: { demoSession: 2 } });
  try {
    assert.equal((await limited.request("POST", "/api/demo/session")).status, 201);
    assert.equal((await limited.request("POST", "/api/demo/session")).status, 201);
    assert.equal((await limited.request("POST", "/api/demo/session")).status, 429);
  } finally {
    await limited.close();
  }
});

test("a new demo starts blank, and setup builds the household from the user's answers", async () => {
  const res = await h.request("POST", "/api/demo/session");
  const { token, householdId } = res.json() as { token: string; householdId: string };
  const auth = { authorization: `Bearer ${token}` };
  assert.equal((await h.request("GET", "/api/setup", { headers: auth })).json().configured, false);
  const body = { userName: "Fazil", userPronouns: "he", userRelation: "son", elderName: "Jesy", relationToUser: "mother", calledBy: "Ummi", elderPronouns: "she", thingsTheyLove: ["her roses"] };
  const r = await h.request("POST", "/api/setup/new", { headers: auth, body });
  assert.equal(r.status, 201);
  const doc = (await h.repo.get(householdId))!;
  assert.equal(doc.configured, true);
  assert.equal(doc.elder.calledBy, "Ummi");
  assert.equal(doc.persona.displayName, "Digital Fazil");
  assert.equal(doc.contacts.length, 0, "no invented call history");
  const elder = (await h.request("GET", "/api/state/elder", { headers: auth })).json();
  assert.equal(elder.persona.badge, "Digital Fazil · AI");
  assert.doesNotMatch(JSON.stringify(doc), /Amma|Priya|Kamala|Ravi/);
});
