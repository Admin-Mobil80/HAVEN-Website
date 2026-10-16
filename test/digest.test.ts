import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbackDigest, gatherFacts, voiceScript } from "../src/agent/digest.js";
import { signToken } from "../src/http/households.js";
import { runDigest, type DigestDeps } from "../src/jobs/digest.js";
import { SimulatedNotifier } from "../src/notify/index.js";
import { MemoryRepo } from "../src/store/memoryRepo.js";
import { seedHousehold } from "../src/store/seed.js";
import { SECRET, startApp } from "./helpers/httpHarness.js";

const NOW = new Date("2026-10-17T15:30:00.000Z"); // 21:00 IST

async function household(id = "hh-dg") {
  const repo = new MemoryRepo();
  const doc = seedHousehold(id, new Date(NOW.getTime() - 3600_000));
  const at = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
  doc.turns = [
    { id: "t1", at: at(50), speaker: "elder", text: "I met Saroja at the temple" },
    { id: "t2", at: at(49), speaker: "avatar", text: "How lovely, Amma!" },
    { id: "t3", at: at(40), speaker: "elder", text: "Don't tell Priya, I skipped my walk", private: true },
  ];
  doc.memories.push({ id: "m_p", type: "routine", content: "Skipped her walk", private: true, source: "conversation", createdAt: at(40) });
  doc.deferrals.push({ id: "d_1", topic: "visit", question: "Will you come for Diwali?", context: "", status: "open", createdAt: at(45) });
  await repo.create(doc);
  return repo;
}

test("facts never include private turns or memories, and the tier comes from records", async () => {
  const repo = await household();
  const f = gatherFacts((await repo.get("hh-dg"))!, [], NOW);
  const all = JSON.stringify(f);
  assert.doesNotMatch(all, /skipped/i);
  assert.match(all, /Saroja/);
  assert.deepEqual(f.questions, ["Will you come for Diwali?"]);
  assert.equal(f.tier, "worth_knowing");
});

test("the fallback digest and voice script are plain and labelled as AI", async () => {
  const repo = await household();
  const f = gatherFacts((await repo.get("hh-dg"))!, [], NOW);
  const c = fallbackDigest(f);
  assert.match(c.summary, /Diwali/);
  assert.match(voiceScript(f, c), /Haven is an AI companion/);
});

const deps = (repo: MemoryRepo, over: Partial<DigestDeps> = {}): DigestDeps => ({
  repo,
  notifier: new SimulatedNotifier(),
  now: () => NOW,
  write: async (f) => ({ summary: "A calm day; she met Saroja at the temple.", topics: ["temple"], starters: ["Ask about Saroja"], modelId: "fake", ...(f ? {} : {}) }),
  ...over,
});

test("runDigest stores the record, audio and an outbox entry", async () => {
  const repo = await household();
  const stored = new Map<string, string>();
  const r = await runDigest(
    "hh-dg",
    deps(repo, { voiceNote: async () => Buffer.from("ogg"), mp3: async () => Buffer.from("mp3"), media: { put: async (k, _d, t) => void stored.set(k, t) } }),
  );
  assert.equal(r.status, "done");
  if (r.status !== "done") return;
  assert.ok(r.digest.voiceNoteKey && stored.get(r.digest.voiceNoteKey) === "audio/ogg");
  assert.ok(r.digest.audioKey && stored.get(r.digest.audioKey) === "audio/mpeg");
  assert.deepEqual(r.digest.openDeferrals, ["d_1"]);
  const doc = (await repo.get("hh-dg"))!;
  assert.equal(doc.digests.length, 1);
  assert.equal(doc.outbox.at(-1)?.kind, "digest");
  assert.match(doc.outbox.at(-1)!.body, /Saroja/);
});

test("without Amma's consent to share summaries nothing is sent", async () => {
  const repo = await household();
  await repo.update("hh-dg", (d) => void (d.consents.shareSummaries = undefined));
  const r = await runDigest("hh-dg", deps(repo));
  assert.deepEqual(r, { status: "skipped", reason: "no_summary_consent" });
  assert.equal((await repo.get("hh-dg"))!.outbox.length, 0);
});

test("/events: Function URL callers are refused; warm and digest run for scheduler events", async () => {
  const repo = await household("owner");
  const h = await startApp({ repo, now: () => NOW, liveHouseholds: ["owner"], digest: { write: deps(repo).write } });
  try {
    assert.equal((await h.request("POST", "/events", { headers: { "x-amzn-request-context": "{}" }, body: { type: "digest" } })).status, 404);
    assert.equal((await h.request("POST", "/events", { body: { type: "warm" } })).json().ok, true);
    const r = await h.request("POST", "/events", { body: { type: "digest" } });
    assert.equal(r.json().results[0].status, "done");
    assert.equal((await repo.get("owner"))!.digests.length, 1);
  } finally {
    await h.close();
  }
});

test("POST /api/digest/run sends now for the caller's household, with a daily cap", async () => {
  const repo = await household("demo-dg");
  const h = await startApp({ repo, now: () => NOW, digest: { write: deps(repo).write } });
  try {
    const auth = { authorization: `Bearer ${signToken("demo-dg", SECRET)}` };
    const r = await h.request("POST", "/api/digest/run", { headers: auth });
    assert.equal(r.status, 201);
    assert.equal(r.json().delivery.status, "simulated");
    assert.equal((await h.request("POST", "/api/digest/run")).status, 401);
  } finally {
    await h.close();
  }
});
