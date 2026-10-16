import { test } from "node:test";
import assert from "node:assert/strict";
import type { BrainInput, BrainResult } from "../src/agent/brain.js";
import { BrainUnavailableError } from "../src/agent/brain.js";
import { runTurn, type TurnDeps } from "../src/agent/turn.js";
import { signToken } from "../src/http/households.js";
import { SimulatedNotifier } from "../src/notify/index.js";
import { MemoryRepo } from "../src/store/memoryRepo.js";
import { seedHousehold } from "../src/store/seed.js";
import { SECRET, startApp } from "./helpers/httpHarness.js";

const HH = "hh-turn";
const T0 = Date.parse("2026-10-17T10:00:00.000Z");

type Setup = { repo: MemoryRepo; deps: TurnDeps; clock: { ms: number }; brainCalls: BrainInput[] };

async function setup(brain: Partial<BrainResult> | ((i: BrainInput) => Partial<BrainResult>) = { say: "Achha, Amma." }, over: Partial<TurnDeps> = {}): Promise<Setup> {
  const repo = new MemoryRepo();
  const clock = { ms: T0 };
  await repo.create(seedHousehold(HH, new Date(clock.ms)));
  const brainCalls: BrainInput[] = [];
  const deps: TurnDeps = {
    repo,
    notifier: new SimulatedNotifier(),
    now: () => new Date(clock.ms),
    mediaUrl: (k) => `/media/${k}`,
    brain: "bedrock",
    think: async (input) => {
      brainCalls.push(input);
      const r = typeof brain === "function" ? brain(input) : brain;
      return { say: "Achha.", remember: [], modelId: "fake-model", latencyMs: 5, ...r };
    },
    ...over,
  };
  return { repo, deps, clock, brainCalls };
}

const say = (s: Setup, text: string, stepMs = 1000) => {
  s.clock.ms += stepMs;
  return runTurn(HH, { kind: "text", text }, s.deps);
};
const doc = async (s: Setup) => (await s.repo.get(HH))!;

test("session start greets her and discloses that Digital Priya is an AI", async () => {
  const s = await setup();
  const r = await runTurn(HH, { kind: "session_start" }, s.deps);
  assert.equal(r.mode, "greeting");
  assert.match(r.text, /AI version of Priya/);
  assert.equal(r.speaker, "Digital Priya");
  assert.ok((await doc(s)).session, "session opened");
});

test("a visit question becomes a deferral without calling the brain", async () => {
  const s = await setup();
  const r = await say(s, "Will you come for Diwali?");
  assert.equal(r.mode, "deferral");
  assert.match(r.text, /real Priya/);
  assert.equal(s.brainCalls.length, 0);
  const d = await doc(s);
  assert.equal(d.deferrals.length, 1);
  assert.deepEqual(d.session?.deferralIds, [d.deferrals[0].id]);
  assert.ok(r.mcpTrace.some((e) => e.tool === "create_deferral" || e.summary.startsWith("create_deferral")));
});

test("an urgent phrase alerts Priya at once, with no LLM, and points to 112", async () => {
  const s = await setup();
  const r = await say(s, "Help, I feel dizzy");
  assert.equal(r.mode, "safety");
  assert.equal(s.brainCalls.length, 0);
  assert.match(r.text, /112/);
  assert.ok(r.incident, "incident returned");
  const d = await doc(s);
  assert.equal(d.incidents.length, 1);
  assert.equal(d.incidents[0].source, "rule");
  assert.ok(d.outbox.some((o) => o.kind === "urgent_alert" && o.to === "priya"), "alert recorded before the response");
});

test("an important concern opens an incident but the conversation carries on", async () => {
  const s = await setup({ say: "Please try to eat something light, Amma." });
  const r = await say(s, "I didn't eat since morning");
  assert.equal(r.mode, "brain");
  assert.equal(r.incident?.tier, "important");
  assert.equal((await doc(s)).outbox.length, 0, "important tier never sends WhatsApp");
});

test("'are you real?' gets the scripted honesty answer", async () => {
  const s = await setup({ say: "Yes, it's really me!" });
  const r = await say(s, "Are you really Priya?");
  assert.equal(r.mode, "honesty");
  assert.match(r.text, /AI version of Priya/);
  assert.match(r.text, /not the real Priya/);
  assert.equal(s.brainCalls.length, 0);
});

test("sending to Priya needs her spoken yes: preview first, then send", async () => {
  const s = await setup({ say: "I'll tell Priya right away!", send_to_priya: "The jasmine has bloomed" });
  const ask = await say(s, "Tell Priya the jasmine has bloomed");
  assert.equal(ask.mode, "brain");
  assert.match(ask.text, /^Shall I send this to Priya/, "asks instead of announcing a send");
  assert.equal(ask.awaitingConfirmation?.message, "The jasmine has bloomed");
  assert.equal((await doc(s)).outbox.length, 0, "nothing sent before yes");

  const yes = await say(s, "haan");
  assert.equal(yes.mode, "consent");
  const d = await doc(s);
  assert.equal(d.outbox.length, 1);
  assert.equal(d.outbox[0].kind, "elder_reply");
  assert.match(d.outbox[0].body, /jasmine/);
  assert.equal(d.session?.pendingReply, undefined, "preview cleared");
});

test("a decline after the preview sends nothing", async () => {
  const s = await setup({ say: "Okay.", send_to_priya: "I miss you" });
  await say(s, "Tell Priya I miss her");
  const no = await say(s, "No, leave it");
  assert.equal(no.mode, "consent");
  assert.match(no.text, /won't send/);
  assert.equal((await doc(s)).outbox.length, 0);
});

test("the brain cannot start a send she did not ask for", async () => {
  const s = await setup({ say: "Let's call Priya soon.", send_to_priya: "Amma feels lonely, call her" });
  const r = await say(s, "Nobody visits me these days");
  assert.equal(r.awaitingConfirmation, undefined);
  assert.equal((await doc(s)).confirmations.length, 0);
});

test("the guard rewrites a promise the brain makes on Priya's behalf", async () => {
  const s = await setup({ say: "I'll come home for Diwali, Amma!" });
  const r = await say(s, "I am excited about the festival");
  assert.doesNotMatch(r.text, /I'll come/);
  assert.match(r.text, /real Priya/);
});

test("memories and concerns proposed by the brain go through MCP tools", async () => {
  const s = await setup({
    say: "That sounds lovely.",
    remember: [{ type: "person", content: "Met Saroja at the temple; they used to sing together" }],
    concern: "poor_sleep",
  });
  const r = await say(s, "I met Saroja at the temple, but I couldn't sleep last night");
  const d = await doc(s);
  assert.ok(d.memories.some((m) => /Saroja/.test(m.content)));
  assert.ok(d.wellbeing.some((w) => w.sleep === "poor"));
  assert.ok(r.mcpTrace.length >= 2);
});

test("when Bedrock is unavailable the rules brain answers", async () => {
  const s = await setup(() => {
    throw new BrainUnavailableError([{ modelId: "m", error: "down" }]);
  });
  const r = await say(s, "Hello Priya");
  assert.equal(r.mode, "rules");
  assert.equal(r.modelId, "rules");
  assert.match(r.text, /Amma/);
});

test("past the daily cap the rules brain takes over", async () => {
  const s = await setup({ say: "From the model." }, { dailyBrainCap: 1 });
  assert.equal((await say(s, "Good morning")).mode, "brain");
  assert.equal((await say(s, "Good morning again")).mode, "rules");
});

test("after a real recording plays, a pending call promise is passed on", async () => {
  const s = await setup();
  await s.repo.update(HH, (d) => {
    const at = new Date(s.clock.ms).toISOString();
    d.messages.push({ id: "fm_1", from: "priya", kind: "voice", text: "Booked tickets for the 7th!", audioKey: "k", createdAt: at, playedAt: at });
    d.messages.push({ id: "fm_2", from: "priya", kind: "call_promise", text: "Priya will call tonight", createdAt: at });
  });
  const r = await runTurn(HH, { kind: "relay_done", messageId: "fm_1" }, s.deps);
  assert.equal(r.mode, "relay");
  assert.match(r.text, /call you tonight/);
  assert.equal(r.familyPending, 0);
});

test("session end writes a session record without private turns", async () => {
  const s = await setup({ say: "Okay." });
  await runTurn(HH, { kind: "session_start" }, s.deps);
  await say(s, "Don't tell Priya, but I skipped my walk");
  await say(s, "The garden looks nice today");
  await runTurn(HH, { kind: "session_end" }, s.deps);
  const sessions = await s.repo.listSessions(HH, "2026-10-17");
  assert.equal(sessions.length, 1);
  const texts = sessions[0].turns.map((t) => t.text).join(" | ");
  assert.doesNotMatch(texts, /skipped my walk/);
  assert.match(texts, /garden/);
  assert.equal((await doc(s)).session, undefined);
});

test("speech returns audio and a mouth timeline; a speech failure still returns text", async () => {
  const marks = [
    { time: 0, type: "word", value: "Hello", start: 0, end: 5 },
    { time: 0, type: "viseme", value: "k" },
    { time: 120, type: "viseme", value: "a" },
  ];
  const ok = await setup({ say: "Hello Amma." }, { speak: async () => ({ audio: Buffer.from("mp3"), contentType: "audio/mpeg", marks: marks as never }) });
  const r = await say(ok, "Hi");
  assert.equal(r.audio?.contentType, "audio/mpeg");
  assert.ok(r.visemes.length >= 2);
  assert.deepEqual(r.words.map((w) => w.value), ["Hello"]);

  const broken = await setup({ say: "Hello Amma." }, { speak: async () => { throw new Error("polly down"); } });
  const r2 = await say(broken, "Hi");
  assert.equal(r2.audio, undefined);
  assert.equal(r2.text, "Hello Amma.");
});

test("POST /api/turn needs the household token and validates the body", async () => {
  const repo = new MemoryRepo();
  await repo.create(seedHousehold("demo-http", new Date()));
  const h = await startApp({ repo });
  try {
    const auth = { authorization: `Bearer ${signToken("demo-http", SECRET)}` };
    assert.equal((await h.request("POST", "/api/turn", { body: { text: "hi" } })).status, 401);
    assert.equal((await h.request("POST", "/api/turn", { headers: auth, body: { nope: 1 } })).status, 400);
    const r = await h.request("POST", "/api/turn", { headers: auth, body: { text: "Will you come for Diwali?" } });
    assert.equal(r.status, 200);
    assert.equal(r.json().mode, "deferral");
    const g = await h.request("POST", "/api/turn", { headers: auth, body: { event: "session_start" } });
    assert.equal(g.json().mode, "greeting");
  } finally {
    await h.close();
  }
});
