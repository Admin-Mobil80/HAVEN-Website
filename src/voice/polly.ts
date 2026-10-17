import { createHash } from "node:crypto";
import {
  PollyClient,
  SynthesizeSpeechCommand,
  type Engine,
  type LanguageCode,
  type SynthesizeSpeechCommandInput,
  type VoiceId,
} from "@aws-sdk/client-polly";
import type { SpeechMark } from "./visemes.js";

export type { SpeechMark } from "./visemes.js";

// Polly bills at most 3000 characters per request (SSML tags excluded); escaping and the prosody
// wrapper need headroom, so plain text is capped lower.
export const MAX_TEXT_CHARS = 2500;

export type SpeechResult = { audio: Buffer; contentType: "audio/mpeg"; marks: SpeechMark[] };

// Optional second-level cache (S3 later). Failures are treated as misses: a broken cache must
// never take speech down with it.
export type SpeechCache = {
  get(key: string): Promise<SpeechResult | undefined>;
  put(key: string, value: SpeechResult): Promise<void>;
};

export type SpeakOptions = {
  voiceId?: string;
  engine?: Engine;
  languageCode?: string;
  ratePercent?: number;
  client?: PollyClient;
  cache?: SpeechCache;
};

const clients = new Map<string, PollyClient>();
function defaultClient() {
  const region = process.env.AWS_REGION ?? "ap-south-1";
  let c = clients.get(region);
  if (!c) clients.set(region, (c = new PollyClient({ region })));
  return c;
}

function resolve(opts: SpeakOptions) {
  const rate = Math.round(opts.ratePercent ?? 90);
  return {
    voiceId: opts.voiceId ?? process.env.POLLY_VOICE_PRIYA ?? "Kajal",
    engine: opts.engine ?? "neural",
    languageCode: opts.languageCode ?? "en-IN",
    ratePercent: Math.min(200, Math.max(20, Number.isFinite(rate) ? rate : 90)),
    client: opts.client ?? defaultClient(),
  };
}

function checkText(text: string) {
  const t = text.trim();
  if (!t) throw new Error("polly_empty_text");
  if (t.length > MAX_TEXT_CHARS) throw new Error("polly_text_too_long");
  return t;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

export function escapeXml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// Builds the SSML and, for every UTF-16 index of the original text, the UTF-8 byte offset where
// that character starts inside the SSML. Polly reports word offsets as SSML byte offsets.
export function toSsml(text: string, ratePercent: number) {
  const prefix = `<speak><prosody rate="${ratePercent}%">`;
  const byteAt: number[] = [];
  let bytes = Buffer.byteLength(prefix);
  let body = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isHighSurrogate = code >= 0xd800 && code <= 0xdbff && i + 1 < text.length;
    const ch = isHighSurrogate ? text.slice(i, i + 2) : text[i];
    const out = ESCAPES[ch] ?? ch;
    byteAt[i] = bytes;
    if (isHighSurrogate) byteAt[++i] = bytes;
    body += out;
    bytes += Buffer.byteLength(out);
  }
  byteAt[text.length] = bytes;
  return { ssml: `${prefix}${body}</prosody></speak>`, byteAt };
}

// Largest original index whose SSML byte offset is <= `byte`, clamped to the text.
function toTextIndex(byteAt: number[], byte: number) {
  let lo = 0;
  let hi = byteAt.length - 1;
  if (byte <= byteAt[0]) return 0;
  if (byte >= byteAt[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (byteAt[mid] <= byte) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function parseMarks(raw: string, byteAt?: number[]): SpeechMark[] {
  const marks: SpeechMark[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let m: unknown;
    try {
      m = JSON.parse(line);
    } catch {
      continue;
    }
    if (!m || typeof m !== "object") continue;
    const { time, type, value, start, end } = m as Record<string, unknown>;
    if (typeof time !== "number" || typeof value !== "string") continue;
    if (type !== "viseme" && type !== "word" && type !== "sentence" && type !== "ssml") continue;
    const mark: SpeechMark = { time, type, value };
    if (typeof start === "number" && typeof end === "number") {
      mark.start = byteAt ? toTextIndex(byteAt, start) : start;
      mark.end = byteAt ? toTextIndex(byteAt, end) : end;
    }
    marks.push(mark);
  }
  return marks.sort((a, b) => a.time - b.time);
}

async function synth(client: PollyClient, input: SynthesizeSpeechCommandInput) {
  const out = await client.send(new SynthesizeSpeechCommand(input));
  if (!out.AudioStream) throw new Error("polly_empty_audio");
  return Buffer.from(await out.AudioStream.transformToByteArray());
}

export function cacheKey(parts: { voiceId: string; engine: string; languageCode: string; ratePercent: number; text: string }) {
  const { voiceId, engine, languageCode, ratePercent, text } = parts;
  return createHash("sha256").update(`${voiceId}|${engine}|${languageCode}|${ratePercent}|${text}`).digest("hex");
}

// Small in-process LRU: a warm Lambda replays the same scripted lines (disclosure, deferral,
// safety) many times a day.
const LRU_MAX_ENTRIES = 100;
const lru = new Map<string, SpeechResult>();
const inflight = new Map<string, Promise<SpeechResult>>();

function lruGet(key: string) {
  const hit = lru.get(key);
  if (hit) {
    lru.delete(key);
    lru.set(key, hit);
  }
  return hit;
}

function lruSet(key: string, value: SpeechResult) {
  lru.delete(key);
  lru.set(key, value);
  while (lru.size > LRU_MAX_ENTRIES) lru.delete(lru.keys().next().value as string);
}

export function clearSpeechCache() {
  lru.clear();
}

const copy = (r: SpeechResult): SpeechResult => ({ audio: r.audio, contentType: r.contentType, marks: r.marks.map((m) => ({ ...m })) });

// mp3 + viseme/word marks for one avatar line. Both requests run in parallel; results are cached
// by voice, engine, language, rate and text.
export async function speak(text: string, opts: SpeakOptions = {}): Promise<SpeechResult> {
  const clean = checkText(text);
  const o = resolve(opts);
  const key = cacheKey({ ...o, text: clean });

  const hit = lruGet(key);
  if (hit) return copy(hit);
  const pending = inflight.get(key);
  if (pending) return copy(await pending);

  const work = (async () => {
    if (opts.cache) {
      const cache = opts.cache;
      const stored = await Promise.resolve()
        .then(() => cache.get(key))
        .catch(() => undefined);
      if (stored) {
        lruSet(key, stored);
        return stored;
      }
    }
    const { ssml, byteAt } = toSsml(clean, o.ratePercent);
    const base = { Engine: o.engine, VoiceId: o.voiceId as VoiceId, LanguageCode: o.languageCode as LanguageCode, Text: ssml, TextType: "ssml" as const };
    const [audio, marksRaw] = await Promise.all([
      synth(o.client, { ...base, OutputFormat: "mp3", SampleRate: "24000" }),
      synth(o.client, { ...base, OutputFormat: "json", SpeechMarkTypes: ["viseme", "word"] }),
    ]);
    const result: SpeechResult = { audio, contentType: "audio/mpeg", marks: parseMarks(marksRaw.toString("utf8"), byteAt) };
    lruSet(key, result);
    const cache = opts.cache;
    if (cache) {
      await Promise.resolve()
        .then(() => cache.put(key, result))
        .catch(() => undefined);
    }
    return result;
  })();

  inflight.set(key, work);
  try {
    return copy(await work);
  } finally {
    inflight.delete(key);
  }
}

// WhatsApp/Telegram-style voice note: Ogg Opus at 48 kHz (WhatsApp shows the inline play icon
// only for Opus audio).
export async function voiceNote(text: string, opts: Omit<SpeakOptions, "cache"> = {}): Promise<Buffer> {
  const clean = checkText(text);
  const o = resolve(opts);
  const { ssml } = toSsml(clean, o.ratePercent);
  return synth(o.client, {
    Engine: o.engine,
    VoiceId: o.voiceId as VoiceId,
    LanguageCode: o.languageCode as LanguageCode,
    Text: ssml,
    TextType: "ssml",
    OutputFormat: "ogg_opus",
    SampleRate: "48000",
  });
}

// Raw 16 kHz 16-bit mono PCM for the photo avatar's audio passthrough (default voice).
export async function pcm16(text: string, opts: Omit<SpeakOptions, "cache"> = {}): Promise<Buffer> {
  const clean = checkText(text);
  const o = resolve(opts);
  const { ssml } = toSsml(clean, o.ratePercent);
  return synth(o.client, {
    Engine: o.engine,
    VoiceId: o.voiceId as VoiceId,
    LanguageCode: o.languageCode as LanguageCode,
    Text: ssml,
    TextType: "ssml",
    OutputFormat: "pcm",
    SampleRate: "16000",
  });
}
