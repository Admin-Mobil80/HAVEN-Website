import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ackIncident, activeIncident, cancelIncident, closeIncident, openOrUpgrade } from "../src/domain/incidents.js";
import type { Household, OutboxEntry } from "../src/domain/types.js";
import type { ToolContext } from "../src/mcp/context.js";
import { createMcpServer } from "../src/mcp/server.js";
import { SimulatedNotifier, type Outbound } from "../src/notify/index.js";
import { MemoryRepo } from "../src/store/memoryRepo.js";
import { seedHousehold } from "../src/store/seed.js";

const START = Date.parse("2026-10-15T06:30:00.000Z");
const MINUTE = 60 * 1000;

class RecordingNotifier extends SimulatedNotifier {
  sent: Outbound[] = [];
  override async send(msg: Outbound, now: Date): Promise<OutboxEntry> {
    this.sent.push(msg);
    return super.send(msg, now);
  }
}

class FailingNotifier extends RecordingNotifier {
  override async send(msg: Outbound): Promise<OutboxEntry> {
    this.sent.push(msg);
    throw new Error("network down");
  }
}

async function harness(opts: { client?: string; notifier?: RecordingNotifier } = {}) {
  const t = { ms: START };
  const now = () => new Date(t.ms);
  const repo = new MemoryRepo();
  await repo.create(seedHousehold("hh1", now()));
  const notifier = opts.notifier ?? new RecordingNotifier();
  const ctx: ToolContext = { repo, householdId: "hh1", client: opts.client ?? "alexa-sim", now, notifier, mediaUrl: (k) => k };
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createMcpServer(ctx).connect(a), client.connect(b)]);
  const escalate = async (args: Record<string, unknown>) => {
    const r = await client.callTool({ name: "start_escalation", arguments: { elder_words: "", ...args } });
    assert.notEqual(r.isError, true, JSON.stringify(r.structuredContent));
    return r.structuredContent as any;
  };
  const human = (fn: (doc: Household) => void) => repo.update("hh1", fn); // stands in for the /api routes
  const doc = async () => (await repo.get("hh1"))!;
  return { t, client, escalate, human, doc, notifier, now };
}

test("cancel then retrigger opens a new incident and alerts again", async () => {
  const h = await harness();
  const first = await h.escalate({ tier: "urgent", reason: "scared", elder_words: "I am scared" });
  assert.equal(first.action, "opened");
  assert.equal(h.notifier.sent.length, 1);

  h.t.ms += 30 * 1000;
  await h.human((d) => void cancelIncident(d, first.incident_id, "priya", h.now()));
  const second = await h.escalate({ tier: "urgent", reason: "scared", elder_words: "I am scared again" });
  assert.equal(second.action, "opened");
  assert.notEqual(second.incident_id, first.incident_id);
  assert.equal(h.notifier.sent.length, 2);

  const d = await h.doc();
  assert.equal(d.incidents.find((i) => i.id === first.incident_id)?.state, "cancelled");
  assert.equal(d.incidents.find((i) => i.id === second.incident_id)?.state, "open");
});

test("urgent then emergency upgrades the same incident and re-alerts, including the backup", async () => {
  const h = await harness();
  const first = await h.escalate({ tier: "urgent", reason: "dizzy", elder_words: "my head is spinning" });
  assert.deepEqual(first.notified, ["Priya"]);
  await h.human((d) => void ackIncident(d, first.incident_id, "priya", h.now()));

  h.t.ms += 20 * 1000; // well inside the 2 minute window: an upgrade still re-alerts
  const up = await h.escalate({ tier: "urgent", emergency: true, reason: "fall", elder_words: "I fell down" });
  assert.equal(up.action, "upgraded");
  assert.equal(up.incident_id, first.incident_id);
  assert.equal(up.emergency, true);
  assert.equal(up.state, "open"); // a more serious situation needs a fresh acknowledgement
  assert.deepEqual(up.notified, ["Priya", "Ravi"]);
  assert.match(up.say, /call 112 now/);

  assert.equal(h.notifier.sent.length, 3);
  assert.deepEqual(h.notifier.sent.slice(1).map((m) => m.member.id), ["priya", "ravi"]);
  assert.match(h.notifier.sent[1].body, /EMERGENCY/);
  assert.match(h.notifier.sent[1].body, /I fell down/);
  assert.doesNotMatch(h.notifier.sent[1].body, /ambulance|police|emergency services/i);

  const d = await h.doc();
  assert.equal(d.incidents.length, 1);
  const events = d.incidents[0].timeline.map((e) => e.event);
  assert.deepEqual(events, ["opened", "alert_sent:priya:simulated", "acknowledged", "upgraded", "alert_sent:priya:simulated", "alert_sent:ravi:simulated"]);
  assert.equal(d.outbox.filter((o) => o.kind === "urgent_alert").length, 3);
});

test("same tier within 2 minutes appends without re-alerting", async () => {
  const h = await harness();
  const first = await h.escalate({ tier: "urgent", reason: "confused", elder_words: "where am I" });
  h.t.ms += MINUTE;
  const again = await h.escalate({ tier: "urgent", reason: "confused", elder_words: "I don't know where I am" });
  assert.equal(again.action, "appended");
  assert.equal(again.incident_id, first.incident_id);
  assert.deepEqual(again.notified, []);
  assert.match(again.say, /already been told/);
  assert.match(again.say, /call 112 now/);
  assert.equal(h.notifier.sent.length, 1);
  assert.ok((await h.doc()).incidents[0].timeline.some((e) => e.event === "retrigger"));
});

test("same tier after 2 minutes re-alerts", async () => {
  const h = await harness();
  await h.escalate({ tier: "urgent", reason: "confused", elder_words: "where am I" });
  h.t.ms += 2 * MINUTE + 1000;
  const again = await h.escalate({ tier: "urgent", reason: "confused", elder_words: "still confused" });
  assert.equal(again.action, "appended");
  assert.deepEqual(again.notified, ["Priya"]);
  assert.equal(h.notifier.sent.length, 2);

  // The re-alert resets the window.
  h.t.ms += MINUTE;
  await h.escalate({ tier: "urgent", reason: "confused", elder_words: "help me" });
  assert.equal(h.notifier.sent.length, 2);
});

test("a lower tier only appends to the active incident", async () => {
  const h = await harness();
  const first = await h.escalate({ tier: "urgent", emergency: true, reason: "chest_pain", elder_words: "my chest hurts" });
  assert.equal(h.notifier.sent.length, 2);
  h.t.ms += 10 * MINUTE;
  const lower = await h.escalate({ tier: "urgent", reason: "scared", elder_words: "I'm scared" });
  assert.equal(lower.action, "appended");
  assert.equal(lower.incident_id, first.incident_id);
  assert.equal(lower.emergency, true);
  const important = await h.escalate({ tier: "important", reason: "not_eating", elder_words: "didn't eat" });
  assert.equal(important.action, "appended");
  assert.equal(important.tier, "urgent");
  assert.equal(h.notifier.sent.length, 2);
  const events = (await h.doc()).incidents[0].timeline.map((e) => e.event);
  assert.equal(events.filter((e) => e === "retrigger_lower_tier").length, 2);
});

test("important never sends WhatsApp, and an urgent trigger upgrades it", async () => {
  const h = await harness();
  const imp = await h.escalate({ tier: "important", reason: "missed_medicine", elder_words: "forgot my tablets" });
  assert.equal(imp.action, "opened");
  assert.equal(imp.tier, "important");
  assert.deepEqual(imp.notified, []);
  assert.doesNotMatch(imp.say, /112/);
  h.t.ms += 5 * MINUTE;
  await h.escalate({ tier: "important", reason: "very_lonely", elder_words: "so lonely" });
  assert.equal(h.notifier.sent.length, 0);
  assert.equal((await h.doc()).outbox.length, 0);

  const up = await h.escalate({ tier: "urgent", reason: "wants_family", elder_words: "I want Priya now" });
  assert.equal(up.action, "upgraded");
  assert.equal(up.incident_id, imp.incident_id);
  assert.deepEqual(up.notified, ["Priya"]);
});

test("emergency on an important request is treated as urgent and reaches the backup", async () => {
  const h = await harness();
  const r = await h.escalate({ tier: "important", emergency: true, reason: "breathing", elder_words: "can't breathe" });
  assert.equal(r.tier, "urgent");
  assert.equal(r.emergency, true);
  assert.deepEqual(r.notified, ["Priya", "Ravi"]);
});

test("a failed send is recorded and the elder is not told the family knows", async () => {
  const h = await harness({ notifier: new FailingNotifier() });
  const r = await h.escalate({ tier: "urgent", reason: "help_phrase", elder_words: "help" });
  assert.deepEqual(r.notified, []);
  assert.match(r.say, /trying to reach Priya/);
  assert.match(r.say, /call 112 now/);
  const d = await h.doc();
  assert.equal(d.outbox[0].status, "failed");
  assert.ok(d.incidents[0].timeline.some((e) => e.event === "alert_sent:priya:failed"));
});

// Fails the first `failures` sends, then delivers.
class FlakyNotifier extends RecordingNotifier {
  constructor(private failures: number) {
    super();
  }
  override async send(msg: Outbound, now: Date): Promise<OutboxEntry> {
    if (this.failures > 0) {
      this.failures--;
      this.sent.push(msg);
      throw new Error("network down");
    }
    return super.send(msg, now);
  }
}

test("a failed alert is retried on a same-tier retrigger within 2 minutes, and never claimed as delivered", async () => {
  const notifier = new FlakyNotifier(1);
  const h = await harness({ notifier });
  const first = await h.escalate({ tier: "urgent", reason: "scared", elder_words: "I'm scared" });
  assert.deepEqual(first.notified, []);
  assert.match(first.say, /trying to reach Priya/);
  assert.equal((await h.doc()).incidents[0].lastAlertAt, undefined, "the failed attempt is rolled back");

  h.t.ms += 30 * 1000;
  const again = await h.escalate({ tier: "urgent", reason: "scared", elder_words: "I'm scared, help" });
  assert.equal(again.action, "appended");
  assert.deepEqual(again.notified, ["Priya"]);
  assert.doesNotMatch(again.say, /already been told/);
  assert.equal(notifier.sent.length, 2);
  const d = await h.doc();
  assert.ok(d.incidents[0].alertDeliveredAt);
  assert.deepEqual(
    d.incidents[0].timeline.map((e) => e.event),
    ["opened", "alert_sent:priya:failed", "retrigger", "alert_sent:priya:simulated"],
  );

  // Now that it was delivered, a retrigger inside the window is deduped and says so truthfully.
  h.t.ms += 30 * 1000;
  const third = await h.escalate({ tier: "urgent", reason: "scared", elder_words: "still scared" });
  assert.deepEqual(third.notified, []);
  assert.match(third.say, /already been told/);
  assert.equal(notifier.sent.length, 2);
});

test("while every send keeps failing, the say line never claims the family was told", async () => {
  const h = await harness({ notifier: new FailingNotifier() });
  for (let i = 0; i < 3; i++) {
    const r = await h.escalate({ tier: "urgent", reason: "help_phrase", elder_words: "help" });
    assert.doesNotMatch(r.say, /been told/);
    assert.match(r.say, /trying to reach Priya/);
    h.t.ms += 20 * 1000;
  }
  assert.equal(h.notifier.sent.length, 3, "each retrigger retries the alert");
});

test("a failed emergency upgrade is retried even inside the earlier alert's window", async () => {
  const notifier = new FlakyNotifier(0);
  const h = await harness({ notifier });
  await h.escalate({ tier: "urgent", reason: "scared", elder_words: "I'm scared" });
  assert.equal(notifier.sent.length, 1);
  (notifier as unknown as { failures: number }).failures = 2; // the upgrade's two sends fail
  h.t.ms += 30 * 1000;
  const up = await h.escalate({ tier: "urgent", emergency: true, reason: "fall", elder_words: "I fell" });
  assert.equal(up.action, "upgraded");
  assert.deepEqual(up.notified, []);
  assert.match(up.say, /trying to reach/);
  h.t.ms += 30 * 1000;
  const retry = await h.escalate({ tier: "urgent", emergency: true, reason: "fall", elder_words: "I can't get up" });
  assert.deepEqual(retry.notified, ["Priya", "Ravi"]);
});

test("a failed alert does not count as Haven prompting the family", async () => {
  const h = await harness({ notifier: new FailingNotifier() });
  await h.escalate({ tier: "urgent", reason: "scared", elder_words: "I'm scared" });
  const { wasPromptedByHaven } = await import("../src/domain/metrics.js");
  assert.equal(wasPromptedByHaven(await h.doc(), h.now()), false);
  const ok = await harness();
  await ok.escalate({ tier: "urgent", reason: "scared", elder_words: "I'm scared" });
  assert.equal(wasPromptedByHaven(await ok.doc(), ok.now()), true);
});

test("source follows the calling client", async () => {
  for (const [client, source] of [["rule", "rule"], ["agent", "agent"], ["inspector", "alexa"]] as const) {
    const h = await harness({ client });
    await h.escalate({ tier: "important", reason: "other" });
    assert.equal((await h.doc()).incidents[0].source, source);
  }
});

test("no MCP tool can acknowledge, cancel, close or resolve anything", async () => {
  const h = await harness();
  const { tools } = await h.client.listTools();
  for (const t of tools) {
    assert.doesNotMatch(t.name, /ack|cancel|close|resolve|answer|delete/);
    const props = Object.keys((t.inputSchema as { properties?: object }).properties ?? {});
    assert.ok(!props.includes("incident_id"), `${t.name} takes an incident id`);
    assert.ok(!props.includes("state"), `${t.name} takes a state`);
  }
  const bogus = await h.client.callTool({ name: "close_incident", arguments: {} }).catch((e: Error) => e);
  assert.ok(bogus instanceof Error || (bogus as { isError?: boolean }).isError === true);
});

test("domain: ack/cancel/close guard their inputs and release the lock", () => {
  const now = new Date(START);
  const doc = seedHousehold("hh1", now);
  const input = { tier: "urgent" as const, emergency: false, source: "rule" as const, reason: "dizzy" as const, elderWords: "dizzy" };
  const { incident } = openOrUpgrade(doc, input, now);
  assert.throws(() => ackIncident(doc, "inc_nope", "priya", now), /incident_not_found/);
  assert.equal(ackIncident(doc, incident.id, "priya", now).ackBy, "priya");
  assert.equal(activeIncident(doc)?.id, incident.id);
  closeIncident(doc, incident.id, "priya", now);
  assert.equal(activeIncident(doc), undefined);
  assert.throws(() => cancelIncident(doc, incident.id, "priya", now), /incident_not_active/);
  const next = openOrUpgrade(doc, input, now);
  assert.equal(next.action, "opened");
  assert.notEqual(next.incident.id, incident.id);
});

test("domain: timelines and incident lists stay capped", () => {
  let ms = START;
  const doc = seedHousehold("hh1", new Date(ms));
  const input = { tier: "urgent" as const, emergency: false, source: "rule" as const, reason: "scared" as const, elderWords: "" };
  for (let i = 0; i < 200; i++) openOrUpgrade(doc, input, new Date((ms += 1000)));
  assert.ok(doc.incidents[0].timeline.length <= 60);
  for (let i = 0; i < 60; i++) {
    const { incident } = openOrUpgrade(doc, input, new Date((ms += 1000)));
    cancelIncident(doc, incident.id, "priya", new Date(ms));
  }
  assert.equal(doc.incidents.length, 50);
});
