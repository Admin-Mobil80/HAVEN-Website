import { test } from "node:test";
import assert from "node:assert/strict";
import { signToken } from "../src/http/households.js";
import { MemoryRepo } from "../src/store/memoryRepo.js";
import { newHousehold } from "../src/store/seed.js";
import type { Anam } from "../src/voice/anam.js";
import { charsToMouths, type ElevenLabs } from "../src/voice/eleven.js";
import { SECRET, startApp } from "./helpers/httpHarness.js";

const setup = { userName: "Fazil", userPronouns: "he" as const, userRelation: "son", elderName: "Jesy", relationToUser: "mother", calledBy: "Ummi", elderPronouns: "she" as const };

async function app() {
  const repo = new MemoryRepo();
  await repo.create(newHousehold("demo-lk", new Date(), setup, { demo: true }));
  const calls: string[] = [];
  const eleven = {
    libraryVoices: async () => [{ voiceId: "lib1", publicOwnerId: "own1", name: "Aarti", accent: "indian" }],
    addLibraryVoice: async () => (calls.push("add"), "acct-lib1"),
    cloneVoice: async () => (calls.push("clone"), { voiceId: "clone1", requiresVerification: false }),
    deleteVoice: async () => void calls.push("delete"),
    recycleDemoClones: async () => (calls.push("recycle"), []),
    pcm: async () => (calls.push("pcm"), Buffer.alloc(3200)),
  } as unknown as ElevenLabs;
  const anam = { createAvatar: async () => (calls.push("avatar"), "av1"), sessionToken: async () => "tok123" } as unknown as Anam;
  const h = await startApp({ repo, likeness: { eleven: async () => eleven, anam: async () => anam, pollyPcm: async () => Buffer.alloc(1600), limits: { avatarSessionsPerDay: 5 } } });
  const auth = { authorization: `Bearer ${signToken("demo-lk", SECRET)}` };
  return { h, repo, calls, auth };
}

test("voices: list, pick a library voice, clone own voice only with consent", async () => {
  const { h, repo, calls, auth } = await app();
  try {
    const list = (await h.request("GET", "/api/voices", { headers: auth })).json();
    assert.equal(list.available, true);
    assert.equal(list.library[0].name, "Aarti");
    await h.request("POST", "/api/voice/select", { headers: auth, body: { voiceId: "lib1", publicOwnerId: "own1", name: "Aarti" } });
    assert.equal((await repo.get("demo-lk"))!.persona.voice?.voiceId, "acct-lib1");

    const rec = Buffer.alloc(30_000, 1);
    const noConsent = await h.request("POST", "/api/voice/clone", { headers: { ...auth, "content-type": "audio/webm" }, body: rec.toString("latin1") });
    assert.equal(noConsent.status, 400);
    const r = await h.request("POST", "/api/voice/clone?consent=yes", { headers: { ...auth, "content-type": "audio/webm" }, body: rec.toString("latin1") });
    assert.equal(r.status, 201);
    const v = (await repo.get("demo-lk"))!.persona.voice!;
    assert.equal(v.source, "cloned");
    assert.ok(v.consent, "consent recorded");
    assert.match(v.name, /Fazil's voice \(AI\)/);
    assert.ok(calls.includes("clone"));
    assert.ok(calls.indexOf("recycle") < calls.indexOf("clone"), "a demo household frees a voice slot before cloning");
  } finally {
    await h.close();
  }
});

test("photo avatar: needs consent, then the tablet can get a session token", async () => {
  const { h, repo, auth } = await app();
  try {
    assert.equal((await h.request("POST", "/api/avatar/session", { headers: auth })).status, 409);
    const img = Buffer.alloc(20_000, 7).toString("latin1");
    assert.equal((await h.request("POST", "/api/avatar/photo", { headers: { ...auth, "content-type": "image/jpeg" }, body: img })).status, 400);
    assert.equal((await h.request("POST", "/api/avatar/photo?consent=yes", { headers: { ...auth, "content-type": "image/jpeg" }, body: img })).status, 201);
    assert.equal((await repo.get("demo-lk"))!.persona.avatar?.avatarId, "av1");
    assert.equal((await h.request("GET", "/api/state/elder", { headers: auth })).json().photoAvatar, true);
    assert.equal((await h.request("POST", "/api/avatar/session", { headers: auth })).json().sessionToken, "tok123");
    // Sessions are billed per minute: a daily cap per household stops a runaway reconnect.
    for (let i = 0; i < 4; i++) await h.request("POST", "/api/avatar/session", { headers: auth });
    const over = await h.request("POST", "/api/avatar/session", { headers: auth });
    assert.equal(over.status, 429);
    assert.equal(over.json().error, "daily_avatar_session_limit");
  } finally {
    await h.close();
  }
});

test("/api/tts returns PCM in the chosen voice, Polly otherwise, with a daily cap", async () => {
  const { h, repo, calls, auth } = await app();
  try {
    const r = await h.request("POST", "/api/tts", { headers: auth, body: { text: "Hello Ummi" } });
    assert.equal(r.status, 200);
    assert.match(String(r.headers["x-audio-format"]), /pcm_s16le;rate=16000/);
    assert.ok(!calls.includes("pcm"), "no voice chosen: Polly");
    await repo.update("demo-lk", (d) => void (d.persona.voice = { provider: "elevenlabs", voiceId: "v", name: "x", source: "library" }));
    await h.request("POST", "/api/tts", { headers: auth, body: { text: "Hello again" } });
    assert.ok(calls.includes("pcm"));
  } finally {
    await h.close();
  }
});

test("character timings become mouth shapes", () => {
  const m = charsToMouths(["H", "e", "l", "l", "o", " ", "m", "a"], [0, 60, 120, 180, 240, 300, 360, 420]);
  assert.deepEqual(m.map((x) => x.mouth), ["rest", "narrow", "open", "narrow", "round", "rest", "closed", "open", "rest"]);
});

test("Start demo: a fictional household with a stock face and voice, and its still on the tablet", async () => {
  const { h, repo, auth } = await app();
  try {
    const view = (await h.request("POST", "/api/setup/demo", { headers: auth })).json();
    assert.equal(view.user.name, "David");
    assert.equal(view.elder.calledBy, "Mom");
    const doc = (await repo.get("demo-lk"))!;
    assert.equal(doc.persona.voice?.source, "library");
    assert.ok(doc.persona.avatar?.avatarId && !doc.persona.avatar.photoKey);
    const elder = (await h.request("GET", "/api/state/elder", { headers: auth })).json();
    assert.equal(elder.photoAvatar, true);
    assert.equal(elder.photoUrl, "/demo/digital-david.webp");
  } finally {
    await h.close();
  }
});

test("ElevenLabs: library voices are reused, and only old demo clones are recycled", async () => {
  const deleted: string[] = [];
  const added: string[] = [];
  const voices = [
    { voice_id: "own", category: "cloned", created_at_unix: 1, labels: {} },
    { voice_id: "d1", category: "cloned", created_at_unix: 2, labels: { demo: "yes" } },
    { voice_id: "d2", category: "cloned", created_at_unix: 3, labels: { demo: "yes" } },
    { voice_id: "d3", category: "cloned", created_at_unix: 4, labels: { demo: "yes" } },
    { voice_id: "lib1", category: "professional", created_at_unix: 5, labels: {} },
    { voice_id: "rachel", category: "premade", created_at_unix: 0, labels: {} },
  ];
  const f = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === "DELETE") return deleted.push(u.split("/").pop()!), new Response("{}");
    if (u.includes("/v1/voices/add/")) return added.push(u), new Response(JSON.stringify({ voice_id: "lib2" }));
    return new Response(JSON.stringify({ voices }));
  }) as typeof fetch;
  const { ElevenLabs } = await import("../src/voice/eleven.js");
  const e = new ElevenLabs("k", f);
  assert.equal(await e.addLibraryVoice("o", "lib1", "x"), "lib1");
  assert.equal(added.length, 0, "already in the account: not added again");
  assert.equal(await e.addLibraryVoice("o", "lib2", "x"), "lib2");
  assert.equal(added.length, 1);
  assert.deepEqual(await e.recycleDemoClones(1), ["d1", "d2"]);
  assert.deepEqual(deleted, ["d1", "d2"], "the owner's own clone is never touched");
});
