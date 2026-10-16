import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { PollyClient, SynthesizeSpeechCommandInput } from "@aws-sdk/client-polly";
import {
  MAX_TEXT_CHARS,
  clearSpeechCache,
  escapeXml,
  parseMarks,
  speak,
  toSsml,
  voiceNote,
  type SpeechCache,
  type SpeechResult,
} from "../src/voice/polly.js";

type Call = SynthesizeSpeechCommandInput;

const MARKS = [
  '{"time":6,"type":"word","start":27,"end":29,"value":"Hi"}',
  '{"time":6,"type":"viseme","value":"k"}',
  "",
  '{"time":80,"type":"viseme","value":"a"}',
  "not json",
  '{"time":150,"type":"viseme","value":"sil"}',
].join("\n");

const stream = (bytes: Uint8Array) => ({ transformToByteArray: async () => bytes });

// Fake Polly: records each SynthesizeSpeech input and answers by OutputFormat.
function fakePolly(opts: { gate?: Promise<void>; marks?: string } = {}) {
  const calls: Call[] = [];
  const client = {
    async send(cmd: { input: Call }) {
      calls.push(cmd.input);
      if (opts.gate) await opts.gate;
      const f = cmd.input.OutputFormat;
      const body = f === "json" ? new TextEncoder().encode(opts.marks ?? MARKS) : new Uint8Array([f === "ogg_opus" ? 0x4f : 0xff, 0xf3, 1, 2]);
      return { AudioStream: stream(body), ContentType: f === "json" ? "application/x-json-stream" : "audio/mpeg" };
    },
  };
  return { client: client as unknown as PollyClient, calls };
}

let n = 0;
const unique = (s: string) => `${s} ${++n}`;

beforeEach(() => {
  clearSpeechCache();
  delete process.env.POLLY_VOICE_PRIYA;
});

test("escapes the five XML special characters", () => {
  assert.equal(escapeXml(`Tom & "Jerry" <3 it's >`), "Tom &amp; &quot;Jerry&quot; &lt;3 it&apos;s &gt;");
  assert.equal(
    toSsml(`Rice & dal, it's "ready" <now>`, 90).ssml,
    `<speak><prosody rate="90%">Rice &amp; dal, it&apos;s &quot;ready&quot; &lt;now&gt;</prosody></speak>`,
  );
});

test("speak issues the mp3 and speech-mark requests in parallel with the right params", async () => {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  const { client, calls } = fakePolly({ gate });
  const text = unique("Achha Amma, <Ninnindale> & tea?");
  const pending = speak(text, { client });
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 2, "both requests are in flight before either finishes");
  open();
  const out = await pending;

  const mp3 = calls.find((c) => c.OutputFormat === "mp3")!;
  const json = calls.find((c) => c.OutputFormat === "json")!;
  const ssml = `<speak><prosody rate="90%">${escapeXml(text)}</prosody></speak>`;
  assert.deepEqual(mp3, { Engine: "neural", VoiceId: "Kajal", LanguageCode: "en-IN", Text: ssml, TextType: "ssml", OutputFormat: "mp3", SampleRate: "24000" });
  assert.deepEqual(json, { Engine: "neural", VoiceId: "Kajal", LanguageCode: "en-IN", Text: ssml, TextType: "ssml", OutputFormat: "json", SpeechMarkTypes: ["viseme", "word"] });
  assert.equal(out.contentType, "audio/mpeg");
  assert.ok(Buffer.isBuffer(out.audio));
  assert.deepEqual([...out.audio], [0xff, 0xf3, 1, 2]);
});

test("options and POLLY_VOICE_PRIYA override voice, language and rate", async () => {
  process.env.POLLY_VOICE_PRIYA = "Aditi";
  const { client, calls } = fakePolly();
  await speak(unique("Namaste"), { client, languageCode: "hi-IN", ratePercent: 100 });
  assert.ok(calls.every((c) => c.VoiceId === "Aditi" && c.LanguageCode === "hi-IN"));
  assert.ok(calls.every((c) => c.Text!.startsWith('<speak><prosody rate="100%">')));
  await speak(unique("Hello"), { client, voiceId: "Kajal", engine: "standard" });
  assert.ok(calls.slice(2).every((c) => c.VoiceId === "Kajal" && c.Engine === "standard"));
});

test("parses line-delimited speech marks, skipping blank and malformed lines", async () => {
  const { client } = fakePolly();
  const out = await speak("Hi", { client });
  assert.deepEqual(
    out.marks.map((m) => [m.time, m.type, m.value]),
    [
      [6, "word", "Hi"],
      [6, "viseme", "k"],
      [80, "viseme", "a"],
      [150, "viseme", "sil"],
    ],
  );
  // Byte offsets 27..29 in the SSML are the word "Hi" at 0..2 in the original text.
  assert.deepEqual([out.marks[0].start, out.marks[0].end], [0, 2]);
  assert.deepEqual(parseMarks('{"time":"x","type":"viseme","value":"a"}\n{"time":1,"type":"bogus","value":"a"}'), []);
});

test("word offsets are remapped from SSML bytes to the original text, across escapes and Devanagari", () => {
  const text = "नमस्ते Amma & Tom's tea";
  const { ssml, byteAt } = toSsml(text, 90);
  const bytes = Buffer.from(ssml);
  const mark = (word: string) => {
    // Locate the word in the SSML the way Polly reports it: UTF-8 byte offsets.
    const startByte = bytes.indexOf(Buffer.from(escapeXml(word)));
    return JSON.stringify({ time: 1, type: "word", start: startByte, end: startByte + Buffer.byteLength(escapeXml(word)), value: word });
  };
  const marks = parseMarks([mark("नमस्ते"), mark("Amma"), mark("Tom's"), mark("tea")].join("\n"), byteAt);
  for (const m of marks) assert.equal(text.slice(m.start, m.end), m.value);
});

test("a cache hit avoids calling Polly again", async () => {
  const { client, calls } = fakePolly();
  const text = unique("Let me check with the real me, Amma.");
  const a = await speak(text, { client });
  const b = await speak(`  ${text} `, { client });
  assert.equal(calls.length, 2, "only the first speak() reached Polly");
  assert.deepEqual(b, a);
  b.marks[0].value = "mutated";
  assert.notEqual((await speak(text, { client })).marks[0].value, "mutated", "cached marks are copied out");
  await speak(text, { client, ratePercent: 100 });
  assert.equal(calls.length, 4, "a different rate is a different cache key");
});

test("concurrent identical requests share one synthesis", async () => {
  const { client, calls } = fakePolly();
  const text = unique("Hello Amma");
  await Promise.all([speak(text, { client }), speak(text, { client }), speak(text, { client })]);
  assert.equal(calls.length, 2);
});

test("the optional async cache is read before Polly and written after", async () => {
  const store = new Map<string, SpeechResult>();
  const puts: string[] = [];
  const cache: SpeechCache = {
    async get(k) {
      return store.get(k);
    },
    async put(k, v) {
      puts.push(k);
      store.set(k, v);
    },
  };
  const { client, calls } = fakePolly();
  const text = unique("Jasmine has bloomed");
  await speak(text, { client, cache });
  assert.equal(calls.length, 2);
  assert.equal(puts.length, 1);
  clearSpeechCache(); // a cold Lambda: only the external cache survives
  const again = await speak(text, { client, cache });
  assert.equal(calls.length, 2, "served from the external cache");
  assert.equal(again.marks.length, 4);
});

test("a failing external cache does not break speech", async () => {
  const cache: SpeechCache = {
    get: async () => {
      throw new Error("s3 down");
    },
    put: () => {
      throw new Error("s3 down");
    },
  };
  const { client, calls } = fakePolly();
  const out = await speak(unique("Still talking"), { client, cache });
  assert.equal(calls.length, 2);
  assert.equal(out.marks.length, 4);
});

test("rejects empty and over-long text before calling Polly", async () => {
  const { client, calls } = fakePolly();
  await assert.rejects(speak("   ", { client }), /polly_empty_text/);
  await assert.rejects(speak("a".repeat(MAX_TEXT_CHARS + 1), { client }), /polly_text_too_long/);
  await assert.rejects(voiceNote("a".repeat(MAX_TEXT_CHARS + 1), { client }), /polly_text_too_long/);
  assert.equal(calls.length, 0);
  await speak("a".repeat(MAX_TEXT_CHARS), { client });
  assert.equal(calls.length, 2);
});

test("a missing audio stream is an error, not an empty clip", async () => {
  const client = { send: async () => ({}) } as unknown as PollyClient;
  await assert.rejects(speak(unique("Hi"), { client }), /polly_empty_audio/);
});

test("voiceNote asks for 48 kHz Ogg Opus with the same SSML and returns a Buffer", async () => {
  const { client, calls } = fakePolly();
  const out = await voiceNote("Today Amma talked about Saroja & the temple.", { client });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    Engine: "neural",
    VoiceId: "Kajal",
    LanguageCode: "en-IN",
    Text: '<speak><prosody rate="90%">Today Amma talked about Saroja &amp; the temple.</prosody></speak>',
    TextType: "ssml",
    OutputFormat: "ogg_opus",
    SampleRate: "48000",
  });
  assert.ok(Buffer.isBuffer(out));
  assert.equal(out[0], 0x4f);
});
