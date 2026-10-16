import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Household } from "../src/domain/types.js";
import { DAY, HOUR } from "../src/domain/util.js";
import type { ToolContext } from "../src/mcp/context.js";
import { ErrorOutput } from "../src/mcp/result.js";
import { createMcpServer } from "../src/mcp/server.js";
import { DeferralOutput } from "../src/mcp/tools/deferrals.js";
import { EscalationOutput } from "../src/mcp/tools/escalation.js";
import { RecallOutput, RememberOutput } from "../src/mcp/tools/memory.js";
import { PlayOutput, ReplyOutput } from "../src/mcp/tools/messages.js";
import { RemindersOutput } from "../src/mcp/tools/reminders.js";
import { WellbeingOutput } from "../src/mcp/tools/wellbeing.js";
import { SimulatedNotifier, type Outbound } from "../src/notify/index.js";
import { MemoryRepo } from "../src/store/memoryRepo.js";
import { seedHousehold } from "../src/store/seed.js";
import type { OutboxEntry } from "../src/domain/types.js";

// 06:30 UTC = 12:00 IST on 15 Oct 2026.
const START = Date.parse("2026-10-15T06:30:00.000Z");

class RecordingNotifier extends SimulatedNotifier {
  sent: Outbound[] = [];
  override async send(msg: Outbound, now: Date): Promise<OutboxEntry> {
    this.sent.push(msg);
    return super.send(msg, now);
  }
}

async function harness(opts: { repo?: MemoryRepo; id?: string; client?: string; t?: { ms: number } } = {}) {
  const id = opts.id ?? "hh1";
  const t = opts.t ?? { ms: START };
  const now = () => new Date(t.ms);
  const repo = opts.repo ?? new MemoryRepo();
  if (!(await repo.get(id))) await repo.create(seedHousehold(id, now()));
  const notifier = new RecordingNotifier();
  const ctx: ToolContext = { repo, householdId: id, client: opts.client ?? "alexa-sim", now, notifier, mediaUrl: (k) => `https://media.test/${k}?sig=abc` };
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createMcpServer(ctx).connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    return { isError: r.isError === true, data: r.structuredContent as any, text: (r.content as { text: string }[])[0]?.text };
  };
  const edit = (fn: (doc: Household) => void) => repo.update(id, fn);
  const doc = async () => (await repo.get(id))!;
  return { id, repo, client, call, edit, doc, notifier, t, now };
}

test("exposes exactly the 8 tools, each with schemas, annotations and a title", async () => {
  const { client } = await harness();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "create_deferral",
    "get_reminders",
    "log_wellbeing",
    "play_family_message",
    "recall_memory",
    "record_reply",
    "remember",
    "start_escalation",
  ]);
  for (const t of tools) {
    assert.ok(t.title, `${t.name} title`);
    assert.ok(t.description && t.description.length > 40, `${t.name} description`);
    assert.equal(t.outputSchema?.type, "object", `${t.name} outputSchema`);
    assert.equal(typeof t.annotations?.readOnlyHint, "boolean", `${t.name} readOnlyHint`);
    assert.equal(typeof t.annotations?.openWorldHint, "boolean", `${t.name} openWorldHint`);
    assert.equal(t.inputSchema.type, "object");
  }
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.equal(byName.recall_memory.annotations?.readOnlyHint, true);
  assert.equal(byName.get_reminders.annotations?.readOnlyHint, true);
  assert.equal(byName.record_reply.annotations?.openWorldHint, true);
});

test("server instructions describe consent and AI honesty", async () => {
  const { client } = await harness();
  const instructions = client.getInstructions() ?? "";
  assert.match(instructions, /AI/);
  assert.match(instructions, /yes/);
  assert.match(instructions, /112/);
  assert.equal(client.getServerVersion()?.name, "haven");
});

test("remember auto-privates Devanagari and Hinglish 'don't tell' requests", async () => {
  const cases: [elderTurn: string, content: string][] = [
    ["प्रिया को मत बताना, मेरा चश्मा खो गया", "Lost her glasses"],
    ["किसी को मत बताना, मैं सीढ़ी पर फिसली थी", "Slipped on the stairs last week"],
    ["Priya se mat kehna, I skipped the temple", "Skipped the temple visit"],
    ["Priya ko na bataana, the maid left", "The maid left"],
  ];
  for (const [turn, content] of cases) {
    const { call, edit, now } = await harness();
    await edit((d) => d.turns.push({ id: "t_1", at: now().toISOString(), speaker: "elder", text: turn }));
    const r = await call("remember", { type: "event", content });
    assert.equal(r.data.private, true, turn);
  }
  const { call } = await harness();
  assert.equal((await call("remember", { type: "event", content: "प्रिया को मत बताना, चश्मा खो गया" })).data.private, true);
  assert.equal((await call("remember", { type: "event", content: "मैंने मतदान किया" })).data.private, false);
});

test("persona prompt is listed and labels the avatar as AI", async () => {
  const { client, edit } = await harness();
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name), ["digital_priya_persona"]);
  const r = await client.getPrompt({ name: "digital_priya_persona" });
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].role, "user");
  const text = (r.messages[0].content as { text: string }).text;
  assert.match(text, /AI/);
  assert.match(text, /not the real Priya/);
  assert.match(text, /112/);
  assert.match(text, /are you real|whether you are real/i);
  assert.match(text, /property dispute with uncle/);

  await edit((d) => {
    d.persona.mode = "neutral";
    d.memories.push({ id: "m_secret", type: "other", content: "Hides sweets from the doctor", private: true, source: "conversation", createdAt: new Date(START).toISOString() });
  });
  const neutral = ((await client.getPrompt({ name: "digital_priya_persona" })).messages[0].content as { text: string }).text;
  assert.match(neutral, /You are Haven/);
  assert.doesNotMatch(neutral, /Digital Priya/);
  assert.doesNotMatch(neutral, /Hides sweets/);
});

test("recall_memory ranks by keyword overlap and recency", async () => {
  const { call } = await harness();
  const recent = await call("recall_memory", {});
  RecallOutput.parse(recent.data);
  assert.equal(recent.data.memories.length, 5);
  assert.equal(recent.data.memories[0].id, "m_2"); // mentioned a day ago, the others two days ago

  const physio = await call("recall_memory", { query: "physio exercises" });
  assert.deepEqual(physio.data.memories.map((m: any) => m.id), ["m_2", "m_1"]);
  assert.equal(physio.data.memories[0].private, false);

  const people = await call("recall_memory", { about: "person", limit: 2 });
  assert.deepEqual(people.data.memories.map((m: any) => m.id), ["m_3"]);

  const none = await call("recall_memory", { query: "cricket" });
  assert.equal(none.data.memories.length, 0);

  const tooLong = await call("recall_memory", { query: "x".repeat(81) });
  assert.equal(tooLong.isError, true);
});

test("remember stores, dedupes, respects boundaries and auto-privates", async () => {
  const { call, doc, edit, now } = await harness();
  const stored = await call("remember", { type: "person", content: "Her neighbour Shanthi brings jasmine every Friday" });
  RememberOutput.parse(stored.data);
  assert.equal(stored.data.status, "stored");
  assert.equal(stored.data.private, false);

  const dup = await call("remember", { type: "person", content: "her neighbour Shanthi brings jasmine every friday." });
  assert.equal(dup.data.status, "duplicate");
  assert.equal(dup.data.memory_id, stored.data.memory_id);

  const near = await call("remember", { type: "story", content: "Used to make 40 kinds of sweets for Diwali when Priya was a child!" });
  assert.equal(near.data.status, "duplicate");
  assert.equal(near.data.memory_id, "m_5");

  const blocked = await call("remember", { type: "other", content: "Upset about the property dispute with uncle again" });
  assert.equal(blocked.data.status, "blocked_by_boundary");
  assert.equal(blocked.data.memory_id, null);
  const blocked2 = await call("remember", { type: "other", content: "Her uncle's property dispute is dragging on" });
  assert.equal(blocked2.data.status, "blocked_by_boundary");

  const secret = await call("remember", { type: "event", content: "Don't tell Priya, she skipped the temple trip because of her knee" });
  assert.equal(secret.data.status, "stored");
  assert.equal(secret.data.private, true);

  // The model dropped the "don't tell" part, but the elder said it in her last turn.
  await edit((d) => d.turns.push({ id: "t_1", at: now().toISOString(), speaker: "elder", text: "I lost my reading glasses. Don't tell her, okay?" }));
  const viaTurn = await call("remember", { type: "event", content: "Lost her reading glasses" });
  assert.equal(viaTurn.data.private, true);

  const d = await doc();
  assert.equal(d.memories.filter((m) => m.content.includes("Shanthi")).length, 1);
  assert.ok(!d.memories.some((m) => m.content.includes("property")));
  assert.equal(d.memories.find((m) => m.id === secret.data.memory_id)?.private, true);
});

test("play_family_message plays the oldest real message once and relays its deferral", async () => {
  const { call, edit, doc, t } = await harness();
  const empty = await call("play_family_message", {});
  PlayOutput.parse(empty.data);
  assert.deepEqual(empty.data, { message: null, remaining: 0 });

  const created = await call("create_deferral", { topic: "visit", question: "Will you come for Diwali?" });
  const deferralId = created.data.deferral_id;
  await edit((d) => {
    d.messages.push(
      { id: "fm_2", from: "priya", kind: "text", text: "Love you Amma", createdAt: new Date(START - HOUR).toISOString() },
      { id: "fm_1", from: "priya", kind: "deferral_answer", text: "Yes Amma, I'll come on the 8th!", audioKey: "hh1/fm_1.ogg", inReplyTo: deferralId, createdAt: new Date(START - 2 * HOUR).toISOString() },
    );
    d.deferrals.find((x) => x.id === deferralId)!.status = "answered";
  });

  const peek = await call("play_family_message", { peek: true });
  assert.equal(peek.data.message.id, "fm_1");
  assert.equal((await doc()).messages.find((m) => m.id === "fm_1")?.playedAt, undefined);

  t.ms += 1000;
  const first = await call("play_family_message", {});
  PlayOutput.parse(first.data);
  assert.equal(first.data.message.id, "fm_1");
  assert.equal(first.data.message.attribution, "real_family_member");
  assert.equal(first.data.message.from, "Priya");
  assert.equal(first.data.message.kind, "deferral_answer");
  assert.equal(first.data.message.audioUrl, "https://media.test/hh1/fm_1.ogg?sig=abc");
  assert.equal(first.data.message.question, "Will you come for Diwali?");
  assert.equal(first.data.remaining, 1);

  const d = await doc();
  assert.equal(d.messages.find((m) => m.id === "fm_1")?.playedAt, new Date(t.ms).toISOString());
  const deferral = d.deferrals.find((x) => x.id === deferralId)!;
  assert.equal(deferral.status, "relayed");
  assert.equal(deferral.relayedAt, new Date(t.ms).toISOString());

  const second = await call("play_family_message", {});
  assert.equal(second.data.message.id, "fm_2");
  assert.equal(second.data.message.audioUrl, null);
  assert.equal(second.data.message.question, null);
  assert.equal(second.data.remaining, 0);
  assert.equal((await call("play_family_message", {})).data.message, null);
});

test("create_deferral never promises and dedupes within 24 h", async () => {
  const { call, doc, t } = await harness();
  const first = await call("create_deferral", { topic: "visit", question: "Will you come for Diwali?", context: "Asked twice this week" });
  DeferralOutput.parse(first.data);
  assert.equal(first.data.status, "open");
  assert.equal(first.data.deduped, false);
  assert.equal(first.data.say, "That one's for the real Priya, Amma. I can't promise that, but I'll ask Priya tonight.");

  t.ms += 3 * HOUR;
  const again = await call("create_deferral", { topic: "visit", question: "will you come for Diwali" });
  assert.equal(again.data.deferral_id, first.data.deferral_id);
  assert.equal(again.data.deduped, true);

  const other = await call("create_deferral", { topic: "money", question: "Can you send money for the new TV?" });
  assert.notEqual(other.data.deferral_id, first.data.deferral_id);

  t.ms += DAY;
  const later = await call("create_deferral", { topic: "visit", question: "Will you come for Diwali?" });
  assert.equal(later.data.deduped, false);
  assert.notEqual(later.data.deferral_id, first.data.deferral_id);
  assert.equal((await doc()).deferrals.length, 3);

  const bad = await call("create_deferral", { topic: "weather", question: "Will it rain?" });
  assert.equal(bad.isError, true);
});

test("log_wellbeing tiers on the server and never returns urgent", async () => {
  const { call, doc } = await harness();
  const fine = await call("log_wellbeing", { mood: "happy", mentions: ["garden"] });
  WellbeingOutput.parse(fine.data);
  assert.equal(fine.data.tier, "worth_knowing");

  const lowSleep = await call("log_wellbeing", { mood: "low", sleep: "poor", note: "Said she slept badly" });
  assert.equal(lowSleep.data.tier, "important");

  const okay = await call("log_wellbeing", { mood: "okay" });
  assert.equal(okay.data.tier, "worth_knowing");

  // low, okay, anxious: 2 of the last 3 are low or anxious
  const anxious = await call("log_wellbeing", { mood: "anxious", private: true });
  assert.equal(anxious.data.tier, "important");

  const tooMany = await call("log_wellbeing", { mood: "okay", mentions: ["a", "b", "c", "d", "e"] });
  assert.equal(tooMany.isError, true);

  const d = await doc();
  assert.equal(d.wellbeing.length, 5);
  assert.ok(d.wellbeing.every((w) => (w.tier as string) !== "urgent"));
  assert.equal(d.wellbeing.at(-1)?.private, true);
});

test("get_reminders uses IST day bounds", async () => {
  const { call, edit } = await harness();
  await edit((d) => {
    d.reminders.push(
      { id: "r_soon", text: "Physio at 1 pm", due: "2026-10-15T07:30:00.000Z", source: "family", confirmedBy: "priya" }, // 13:00 IST
      { id: "r_eve", text: "Priya will call tonight", due: "2026-10-15T14:00:00.000Z", source: "call_promise", confirmedBy: "priya" }, // 19:30 IST
      { id: "r_late", text: "Temple with Ravi", due: "2026-10-15T19:00:00.000Z", source: "family", confirmedBy: "ravi" }, // 00:30 IST on the 16th
      { id: "r_tom", text: "Physio", due: "2026-10-16T04:00:00.000Z", source: "family", confirmedBy: "priya" }, // 09:30 IST on the 16th
      { id: "r_past", text: "Breakfast with Lalitha", due: "2026-10-14T03:00:00.000Z", source: "family", confirmedBy: "priya" },
    );
  });
  const today = await call("get_reminders", {});
  RemindersOutput.parse(today.data);
  assert.equal(today.data.window, "today");
  assert.deepEqual(today.data.reminders.map((r: any) => r.id), ["r_soon", "r_eve"]);
  assert.equal(today.data.reminders[1].time, "7:30 pm");
  assert.equal(today.data.reminders[1].from, "Priya");

  const now = await call("get_reminders", { window: "now" });
  assert.deepEqual(now.data.reminders.map((r: any) => r.id), ["r_soon"]);

  const tomorrow = await call("get_reminders", { window: "tomorrow" });
  assert.deepEqual(tomorrow.data.reminders.map((r: any) => r.id), ["r_late", "r_tom"]);
  assert.equal(tomorrow.data.reminders[0].from, "Ravi");
});

test("start_escalation alerts the primary member and points to 112", async () => {
  const { call, notifier, doc } = await harness({ client: "alexa-sim" });
  const r = await call("start_escalation", { tier: "urgent", reason: "dizzy", elder_words: "I feel very dizzy" });
  EscalationOutput.parse(r.data);
  assert.equal(r.data.action, "opened");
  assert.equal(r.data.state, "open");
  assert.deepEqual(r.data.notified, ["Priya"]);
  assert.match(r.data.say, /Priya has been told/);
  assert.match(r.data.say, /If you are in danger, call 112 now\./);
  assert.doesNotMatch(r.data.say, /ambulance|police|emergency services/i);
  assert.equal(notifier.sent.length, 1);
  assert.equal(notifier.sent[0].kind, "urgent_alert");
  assert.deepEqual(notifier.sent[0].template, { name: "haven_urgent_alert", params: ["Kamala", "+910000000001"] });
  assert.match(notifier.sent[0].body, /I feel very dizzy/);
  const d = await doc();
  assert.equal(d.incidents[0].source, "alexa");
  assert.equal(d.outbox.length, 1);
  assert.ok(d.incidents[0].timeline.some((e) => e.event === "alert_sent:priya:simulated"));
});

test("errors are isError results whose structuredContent passes client validation", async () => {
  const { call } = await harness();
  const r = await call("record_reply", { message: "Hello", confirmation_id: "cf_999" });
  assert.equal(r.isError, true);
  assert.deepEqual(ErrorOutput.parse(r.data), {
    code: "confirmation_not_found",
    message: r.data.message,
    retryable: false,
  });
  assert.equal(JSON.parse(r.text).code, "confirmation_not_found");

  const repo = new MemoryRepo();
  const gone = await harness({ repo, id: "hh_gone" });
  await repo.delete("hh_gone");
  const missing = await gone.call("recall_memory", {});
  assert.equal(missing.isError, true);
  assert.equal(missing.data.code, "household_not_found");
});

test("argument validation failures carry {code: invalid_arguments, retryable: false}", async () => {
  const { call } = await harness();
  for (const [name, args] of [
    ["remember", { type: "story", content: "x".repeat(250) }],
    ["log_wellbeing", { mood: "okay", mentions: ["a", "b", "c", "d", "e"] }],
    ["create_deferral", { topic: "weather", question: "Will it rain?" }],
    ["recall_memory", { query: "x".repeat(81) }],
  ] as [string, Record<string, unknown>][]) {
    const r = await call(name, args);
    assert.equal(r.isError, true, name);
    assert.deepEqual(ErrorOutput.parse(r.data), { code: "invalid_arguments", message: r.data.message, retryable: false }, name);
    assert.match(r.data.message, /Input validation error/, name);
    assert.ok(r.data.message.length <= 300);
    assert.equal(JSON.parse(r.text).code, "invalid_arguments");
  }
  const unknown = await call("no_such_tool", {});
  assert.equal(unknown.isError, true);
  assert.equal(unknown.data.code, "invalid_arguments");
});

test("household isolation: two contexts never see each other's data", async () => {
  const repo = new MemoryRepo();
  const one = await harness({ repo, id: "hh1" });
  const two = await harness({ repo, id: "hh2" });

  await one.call("remember", { type: "person", content: "Grandson Arjun plays the tabla" });
  const recalled = await two.call("recall_memory", { query: "Arjun tabla" });
  assert.equal(recalled.data.memories.length, 0);

  const issued = await one.call("record_reply", { message: "Call me after dinner" });
  assert.equal(issued.data.status, "needs_confirmation");
  await two.edit((d) => d.turns.push({ id: "t_1", at: new Date(START + 1000).toISOString(), speaker: "elder", text: "yes" }));
  two.t.ms += 2000;
  const crossed = await two.call("record_reply", { message: "Call me after dinner", confirmation_id: issued.data.confirmation_id });
  assert.equal(crossed.isError, true);
  assert.equal(crossed.data.code, "confirmation_not_found");

  await one.call("start_escalation", { tier: "urgent", reason: "scared", elder_words: "I am scared" });
  assert.equal((await two.doc()).incidents.length, 0);
  assert.equal((await one.doc()).incidents.length, 1);
  assert.equal(two.notifier.sent.length, 0);
});

test("record_reply phase 1 returns a preview and sends nothing", async () => {
  const { call, notifier, doc } = await harness();
  const r = await call("record_reply", { message: "Please call me tonight", kind: "call_request" });
  ReplyOutput.parse(r.data);
  assert.equal(r.data.status, "needs_confirmation");
  assert.deepEqual(r.data.preview, { to: "Priya", message: "Please call me tonight", kind: "call_request" });
  assert.match(r.data.say, /\?$/);
  assert.equal(notifier.sent.length, 0);
  assert.equal((await doc()).outbox.length, 0);
});
