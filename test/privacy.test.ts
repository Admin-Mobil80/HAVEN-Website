import { test } from "node:test";
import assert from "node:assert/strict";
import { callStats, wasPromptedByHaven } from "../src/domain/metrics.js";
import { elderProjection, familyProjection, redactLogSummary } from "../src/domain/privacy.js";
import type { Household } from "../src/domain/types.js";
import { DAY, HOUR } from "../src/domain/util.js";
import { seedHousehold } from "../src/store/seed.js";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const SECRET = "Borrowed fifty thousand rupees from Lalitha for the roof repair";
const SECRET_HI = "बेटे को मत बताना कि मैं गिर गई थी";
const ELDER_TURN = "I keep thinking about the old house in Mysuru";

function householdWithSecrets(): Household {
  const doc = seedHousehold("hh-privacy", NOW, { demo: true });
  const at = NOW.toISOString();
  doc.memories.push(
    { id: "m_200", type: "event", content: SECRET, private: true, source: "conversation", createdAt: at },
    { id: "m_201", type: "event", content: SECRET_HI, private: true, source: "conversation", createdAt: at },
    { id: "m_202", type: "preference", content: "Likes filter coffee after her walk", private: false, source: "conversation", createdAt: at },
  );
  doc.wellbeing.push({ id: "w_200", at, mood: "low", mentions: ["roof"], note: "Worried about the roof money, keep it quiet", private: true, tier: "worth_knowing" });
  doc.turns.push(
    { id: "t_1", at, speaker: "elder", text: ELDER_TURN },
    { id: "t_2", at, speaker: "avatar", text: "That sounds lovely, Amma. Tell me about the garden there." },
    { id: "t_3", at, speaker: "elder", text: "Don't tell Priya, I borrowed fifty thousand rupees from Lalitha", private: true },
  );
  doc.confirmations.push({ id: "cf_secret_42", tool: "record_reply", argsHash: "abc", issuedAt: at });
  // Upstream mistakes the projection must still catch: private words copied into family-facing text.
  doc.outbox.push({ id: "o_1", at, to: "priya", kind: "elder_reply", body: `Amma says: ${SECRET}. Call her tonight.`, channel: "simulated", status: "simulated", refId: "cf_secret_42" });
  doc.digests.push({
    id: "g_1",
    date: "2026-10-15",
    createdAt: at,
    summary: `Good day. She mentioned she borrowed fifty thousand rupees from Lalitha.`,
    topics: ["garden"],
    starters: ["Ask about the jasmine"],
    openDeferrals: [],
    tier: "worth_knowing",
  });
  return doc;
}

test("family projection never contains private memories, private wellbeing, elder turns or confirmation ids", () => {
  const doc = householdWithSecrets();
  const json = JSON.stringify(familyProjection(doc, NOW));
  for (const needle of [SECRET, SECRET_HI, "fifty thousand rupees", "Lalitha for the roof", "keep it quiet", ELDER_TURN, "Don't tell Priya", "cf_secret_42"]) {
    assert.ok(!json.includes(needle), `family projection leaked: ${needle}`);
  }
  const fam = familyProjection(doc, NOW);
  assert.ok(fam.memories.some((m) => m.content === "Likes filter coffee after her walk"));
  assert.ok(fam.memories.every((m) => !("private" in m)));
  assert.ok(fam.wellbeing.every((w) => w.id !== "w_200"));
  assert.deepEqual(fam.avatarLines.map((l) => l.text), ["That sounds lovely, Amma. Tell me about the garden there."]);
  assert.match(fam.outbox[0].body, /\[private\]/);
  assert.equal(fam.outbox[0].refId, undefined);
  assert.match(fam.digests[0].summary, /^Good day\. She mentioned she \[private\]\.$/);
  assert.equal(fam.callStats.goal, 4);
});

test("redactLogSummary removes private text, including truncated and Devanagari copies", () => {
  const doc = householdWithSecrets();
  const full = redactLogSummary(`tools/call remember: stored "${SECRET}"`, doc);
  assert.ok(!full.includes("fifty thousand"));
  assert.ok(full.includes("[private]"));
  assert.ok(full.startsWith("tools/call remember: stored"));

  const truncated = `tools/call remember: ${SECRET}`.slice(0, 50); // cuts "...thousand rup"
  const red = redactLogSummary(truncated, doc);
  assert.ok(!/fifty|thousand|rup/i.test(red), red);

  const hi = redactLogSummary(`remember: ${SECRET_HI}`, doc);
  assert.ok(!hi.includes("मत बताना"), hi);
  assert.ok(hi.includes("[private]"));

  const cased = redactLogSummary("BORROWED FIFTY THOUSAND RUPEES", doc);
  assert.equal(cased, "[private]");
});

test("redactLogSummary leaves unrelated text alone", () => {
  const doc = householdWithSecrets();
  const s = "tools/call recall_memory: 3 memories about physio and the garden";
  assert.equal(redactLogSummary(s, doc), s);
  assert.equal(redactLogSummary("", doc), "");
  const clean = seedHousehold("hh-clean", NOW);
  assert.equal(redactLogSummary(SECRET, clean), SECRET);
});

test("a memory made private later is redacted from text written before", () => {
  const doc = householdWithSecrets();
  const before = "remember stored: Likes filter coffee after her walk";
  assert.equal(redactLogSummary(before, doc), before);
  doc.memories.find((m) => m.id === "m_202")!.private = true;
  assert.equal(redactLogSummary(before, doc), "remember stored: [private]");
});

test("elder projection hides phone numbers and family-side data, and labels the AI", () => {
  const doc = householdWithSecrets();
  const elder = elderProjection(doc, NOW);
  const json = JSON.stringify(elder);
  for (const m of doc.members) assert.ok(m.phone && !json.includes(m.phone), `leaked phone of ${m.id}`);
  assert.ok(!json.includes(doc.elder.phone));
  assert.ok(!json.includes(SECRET));
  assert.ok(!json.includes("cf_secret_42"));
  assert.ok(!json.includes("Amma says"));
  assert.equal(elder.persona.isAI, true);
  assert.equal(elder.persona.displayName, "Digital Priya");
  assert.match(elder.persona.badge, /AI/);
  assert.equal(elder.elder.name, "Kamala");

  doc.persona.mode = "neutral";
  const neutral = elderProjection(doc, NOW);
  assert.equal(neutral.persona.displayName, "Haven");
  assert.equal(neutral.persona.childName, undefined);
});

test("elder projection counts unplayed family messages and shows the active incident", () => {
  const doc = householdWithSecrets();
  const at = NOW.toISOString();
  doc.messages.push(
    { id: "fm_1", from: "priya", kind: "text", text: "Love you Amma", createdAt: at },
    { id: "fm_2", from: "priya", kind: "voice", audioKey: "k", createdAt: at, playedAt: at },
  );
  doc.incidents.push({ id: "i_1", tier: "urgent", emergency: true, source: "rule", reason: "fall", elderWords: "I fell", state: "open", openedAt: at, timeline: [] });
  const elder = elderProjection(doc, NOW);
  assert.equal(elder.pendingFamilyMessages, 1);
  assert.equal(elder.openIncident?.id, "i_1");
  assert.ok(!JSON.stringify(elder).includes("I fell"));
  doc.incidents[0].state = "closed";
  assert.equal(elderProjection(doc, NOW).openIncident, null);
});

test("callStats counts real calls in a rolling 7-day window", () => {
  const doc = seedHousehold("hh-calls", NOW);
  assert.deepEqual(callStats(doc, NOW), { realCallsThisWeek: 3, promptedByHaven: 3, demoSeeded: 3, goal: 4, baseline: 1 });
  doc.contacts.push(
    { id: "c_10", type: "call", by: "priya", at: new Date(NOW.getTime() - HOUR).toISOString(), promptedByHaven: false },
    { id: "c_11", type: "call", by: "priya", at: new Date(NOW.getTime() - 8 * DAY).toISOString(), promptedByHaven: true },
    { id: "c_12", type: "visit", by: "ravi", at: new Date(NOW.getTime() - HOUR).toISOString(), promptedByHaven: true },
  );
  assert.deepEqual(callStats(doc, NOW), { realCallsThisWeek: 4, promptedByHaven: 3, demoSeeded: 3, goal: 4, baseline: 1 });
});

test("a call counts as prompted only after a Haven nudge in the last 24 h", () => {
  const doc = seedHousehold("hh-prompt", NOW);
  assert.equal(wasPromptedByHaven(doc, NOW), false);
  const old = new Date(NOW.getTime() - 2 * DAY).toISOString();
  doc.outbox.push({ id: "o_1", at: old, to: "priya", kind: "digest", body: "x", channel: "simulated", status: "simulated" });
  assert.equal(wasPromptedByHaven(doc, NOW), false);
  doc.outbox.push({ id: "o_2", at: new Date(NOW.getTime() - HOUR).toISOString(), to: "priya", kind: "digest", body: "x", channel: "whatsapp", status: "failed" });
  assert.equal(wasPromptedByHaven(doc, NOW), false, "a failed send nudged nobody");
  doc.messages.push({ id: "fm_1", from: "priya", kind: "call_promise", text: "I'll call tonight", createdAt: new Date(NOW.getTime() - 2 * HOUR).toISOString() });
  assert.equal(wasPromptedByHaven(doc, NOW), true);
});
