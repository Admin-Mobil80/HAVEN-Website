import { detectCommitment } from "../domain/commitment.js";
import { guardReply } from "../domain/guards.js";
import { asksIfReal, declines, isAffirmative } from "../domain/matchers.js";
import { compilePersona } from "../domain/persona.js";
import { emergencyNumber, people, pollyVoice } from "../domain/people.js";
import { classify } from "../domain/safety.js";
import { CAPS, MOODS, type ActiveSession, type Household, type LogEntry, type SessionRecord, type VoiceChoice } from "../domain/types.js";
import { capPush, HOUR, istDate, nextId } from "../domain/util.js";
import type { Notifier } from "../notify/index.js";
import { NotFoundError, type Repo } from "../store/repo.js";
import { toMouthTimeline, type Mouth, type SpeechMark } from "../voice/visemes.js";
import { BrainUnavailableError, think, type BrainInput, type BrainResult, type Concern } from "./brain.js";
import { localMcp, type LocalMcp } from "./mcpLocal.js";
import { rulesBrain } from "./rulesBrain.js";

// One elder turn on the tablet. Order matters and is the product's safety story:
//   1. the host writes her words (only the host writes elder turns, so consent checks can trust them)
//   2. deterministic safety rules (no LLM on the alert path)
//   3. deterministic honesty answer ("are you real?")
//   4. a pending "shall I send this?" resolved by a deterministic yes/no matcher
//   5. deterministic commitment detector -> create_deferral ("let me check with the real Priya")
//   6. the LLM brain (or the rules brain), then the output guard
//   7. the brain's proposals carried out as MCP tool calls (remember, record_reply phase 1, log_wellbeing)
//   8. speech (Polly mp3 + visemes) for the reply
// Every outbound effect is awaited before the response: Lambda freezes once it has responded.

// Audio for one reply in the household's chosen voice. marks (Polly visemes) or mouths (from
// ElevenLabs character timings) drive the illustrated avatar's lips.
export type SpeakFn = (
  text: string,
  voice?: VoiceChoice,
  fallback?: { voiceId: string; languageCode: string }, // the Polly voice to use without (or after) a custom one
) => Promise<{ audio: Buffer; contentType: string; marks?: SpeechMark[]; mouths?: { t: number; mouth: Mouth }[] }>;

export type TurnDeps = {
  repo: Repo;
  notifier: Notifier;
  now: () => Date;
  mediaUrl: (key: string) => string;
  brain: "bedrock" | "rules";
  think?: (input: BrainInput) => Promise<BrainResult>;
  speak?: SpeakFn; // absent: no server speech, the tablet falls back to browser speech
  dailyBrainCap?: number; // Bedrock turns per household per day before the rules brain takes over
};

// speech "none": the photo avatar speaks the reply itself (it fetches /api/tts), so no server audio.
export type TurnInput = (
  | { kind: "text"; text: string }
  | { kind: "session_start" }
  | { kind: "relay_done"; messageId: string }
  | { kind: "session_end" }
) & { speech?: "server" | "none" };

export type TurnMode = "greeting" | "safety" | "honesty" | "consent" | "deferral" | "brain" | "rules" | "relay" | "goodbye";

export type TurnResponse = {
  text: string;
  mode: TurnMode;
  speaker: string; // "Digital Priya" (or "Haven" in neutral mode)
  audio?: { base64: string; contentType: string };
  visemes: { t: number; mouth: Mouth }[];
  words: { time: number; value: string }[];
  mcpTrace: LogEntry[];
  familyPending: number;
  incident?: { id: string; tier: string; emergency: boolean; state: string };
  awaitingConfirmation?: { to: string; message: string };
  modelId?: string;
  latencyMs: number;
};

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const REDISCLOSE_MS = 3 * HOUR;
const DEFAULT_BRAIN_CAP = 300;

// A request in her own words to pass something on: "tell Priya ...", "Priya ko bolo ...".
const ASKS_TO_SEND = (child: string) =>
  new RegExp(String.raw`\b(tell|let|ask|message|inform|send)\b.{0,40}\b(${child}|her|him|them|my (daughter|son|grandson|granddaughter|child)|beti|beta)\b|\b(${child}|beti|beta)\s+(ko|se)\b.{0,40}\b(bolo|bol do|batao|bata do|kaho|keh do)\b`, "i");
const ASKS_FOR_CALL = /\b(call me|ring me|phone me|give me a call|mujhe (call|phone) kar)/i;
const SOUNDS_PRIVATE = /\b(don'?t|do not|never)\s+(tell|mention|say|share)\b|\b(mat|na) (batana|bataana|batao|bolna|kehna)\b/i;

const CONCERN_TO_WELLBEING: Record<Concern, { mood: (typeof MOODS)[number]; sleep?: "poor"; appetite?: "poor" }> = {
  not_eating: { mood: "okay", appetite: "poor" },
  poor_sleep: { mood: "okay", sleep: "poor" },
  low_mood: { mood: "low" },
  lonely: { mood: "low" },
  pain: { mood: "okay" },
  confused: { mood: "anxious" },
};

export async function runTurn(householdId: string, input: TurnInput, deps: TurnDeps): Promise<TurnResponse> {
  const started = Date.now();
  const now = deps.now();
  const mcp = localMcp({ repo: deps.repo, householdId, now: deps.now, notifier: deps.notifier, mediaUrl: deps.mediaUrl });

  const reply = await route(householdId, input, deps, mcp, now);
  const { text, mode } = reply;

  // Record the avatar's line and the session bookkeeping in one write.
  const after = await deps.repo.update(householdId, (doc) => {
    const session = doc.session;
    if (session) {
      session.lastTurnAt = now.toISOString();
      if (reply.disclosed) session.disclosedAt = now.toISOString();
      for (const c of mcp.calls) if (!session.toolsCalled.includes(c.name)) session.toolsCalled.push(c.name);
      if (reply.ruleEvent) session.ruleEvents.push(reply.ruleEvent);
      if (reply.deferralId) session.deferralIds.push(reply.deferralId);
      if (reply.pendingReply !== undefined) session.pendingReply = reply.pendingReply ?? undefined;
    }
    if (text) capPush(doc.turns, { id: nextId(doc, "t"), at: now.toISOString(), speaker: "avatar", text }, CAPS.turns);
    return { familyPending: doc.messages.filter((m) => !m.playedAt).length, speaker: displayName(doc), voice: doc.persona.voice, fallback: pollyVoice(doc) };
  });

  const speech = text && input.speech !== "none" ? await speakSafely(deps.speak, text, after.voice, after.fallback) : undefined;
  return {
    text,
    mode,
    speaker: after.speaker,
    audio: speech ? { base64: speech.audio.toString("base64"), contentType: speech.contentType } : undefined,
    visemes: speech ? (speech.mouths ?? toMouthTimeline(speech.marks ?? [])) : [],
    words: speech?.marks ? speech.marks.filter((m) => m.type === "word").map((m) => ({ time: m.time, value: m.value })) : [],
    mcpTrace: mcp.trace,
    familyPending: after.familyPending,
    incident: reply.incident,
    awaitingConfirmation: reply.awaiting,
    modelId: reply.modelId,
    latencyMs: Date.now() - started,
  };
}

type Routed = {
  text: string;
  mode: TurnMode;
  disclosed?: boolean;
  ruleEvent?: string;
  deferralId?: string;
  pendingReply?: ActiveSession["pendingReply"] | null; // null clears it
  incident?: TurnResponse["incident"];
  awaiting?: TurnResponse["awaitingConfirmation"];
  modelId?: string;
};

async function route(hh: string, input: TurnInput, deps: TurnDeps, mcp: LocalMcp, now: Date): Promise<Routed> {
  switch (input.kind) {
    case "session_start":
      return startSession(hh, deps, now);
    case "session_end":
      return endSession(hh, deps, now);
    case "relay_done":
      return relayDone(hh, input.messageId, deps, now);
    case "text":
      return textTurn(hh, input.text, deps, mcp, now);
  }
}

async function startSession(hh: string, deps: TurnDeps, now: Date): Promise<Routed> {
  const stale = await deps.repo.update(hh, (doc) => {
    const old = doc.session && now.getTime() - Date.parse(doc.session.lastTurnAt) > SESSION_IDLE_MS ? closeSession(doc, now) : undefined;
    ensureSession(doc, now);
    return old;
  });
  if (stale) await deps.repo.putSession(hh, stale);
  const doc = await load(deps.repo, hh);
  const child = childName(doc);
  const pending = doc.messages.some((m) => !m.playedAt);
  const intro = doc.persona.mode === "neutral" ? `Hello ${doc.elder.calledBy}, it's Haven, your AI companion.` : `Hello ${doc.elder.calledBy}! It's ${displayName(doc)}, the AI version of ${child}.`;
  const next = pending ? ` ${child} has sent you something. Shall we listen?` : " How are you feeling today?";
  return { text: intro + next, mode: "greeting", disclosed: true };
}

async function endSession(hh: string, deps: TurnDeps, now: Date): Promise<Routed> {
  const record = await deps.repo.update(hh, (doc) => (doc.session ? closeSession(doc, now) : undefined));
  if (record) await deps.repo.putSession(hh, record);
  const doc = await load(deps.repo, hh);
  return { text: `Bye ${doc.elder.calledBy}, take care. Talk to you soon!`, mode: "goodbye" };
}

// After the tablet has played a real family recording (via play_family_message), say a templated
// follow-up. No LLM: these words are attributed to the real family member.
async function relayDone(hh: string, messageId: string, deps: TurnDeps, now: Date): Promise<Routed> {
  const out = await deps.repo.update(hh, (doc) => {
    ensureSession(doc, now);
    const played = doc.messages.find((m) => m.id === messageId);
    if (!played || !played.playedAt) return { kind: undefined, promise: false };
    const promise = doc.messages.find((m) => m.kind === "call_promise" && !m.playedAt);
    if (promise) promise.playedAt = now.toISOString();
    return { kind: played.kind, promise: Boolean(promise) };
  });
  const doc = await load(deps.repo, hh);
  const child = childName(doc);
  if (!out.kind) return { text: "", mode: "relay" };
  const U = people(doc).userP;
  if (out.promise) return { text: `And ${child} says ${U.subj}'ll call you tonight, ${doc.elder.calledBy}!`, mode: "relay" };
  if (out.kind === "voice" || out.kind === "deferral_answer") return { text: `That was the real ${child}, in ${U.poss} own voice.`, mode: "relay" };
  return { text: "", mode: "relay" };
}

async function textTurn(hh: string, raw: string, deps: TurnDeps, mcp: LocalMcp, now: Date): Promise<Routed> {
  const text = raw.trim().slice(0, 500);
  // 1. The host writes her words.
  const { doc, previous } = await deps.repo.update(hh, (d) => {
    const previous = d.turns.filter((t) => t.speaker === "elder").map((t) => t.text).slice(-2);
    ensureSession(d, now);
    capPush(d.turns, { id: nextId(d, "t"), at: now.toISOString(), speaker: "elder", text, private: SOUNDS_PRIVATE.test(text) || undefined }, CAPS.turns);
    return { doc: structuredClone(d), previous };
  });
  const child = childName(doc);
  const names = [child, ...doc.members.map((m) => m.name), "beti", "beta"];
  const session = doc.session!;
  const redisclose = now.getTime() - Date.parse(session.disclosedAt) > REDISCLOSE_MS;
  const withDisclosure = (r: Routed): Routed =>
    redisclose && r.mode !== "safety" ? { ...r, text: `(${displayName(doc)} here, ${child}'s AI companion.) ${r.text}`, disclosed: true } : r;

  // 2. Safety rules, before anything else and without the LLM.
  const safety = classify(text, previous, names);
  let incident: Routed["incident"];
  let ruleEvent: string | undefined;
  if (safety.level === "emergency" || safety.level === "urgent" || safety.level === "important") {
    const tier = safety.level === "important" ? "important" : "urgent";
    const r = await mcp.call("rule", "start_escalation", {
      tier,
      reason: safety.reason ?? "other",
      elder_words: text.slice(0, 200),
      emergency: safety.level === "emergency",
    });
    ruleEvent = `${safety.level}:${safety.reason ?? "other"}`;
    if (r.ok) incident = { id: String(r.data.incident_id), tier: String(r.data.tier), emergency: Boolean(r.data.emergency), state: String(r.data.state) };
    if (tier === "urgent") {
      const say = typeof r.data.say === "string" ? r.data.say : `I'm letting ${child} know right now. If you are in danger, call ${emergencyNumber(doc.elder)}.`;
      return { text: say, mode: "safety", ruleEvent, incident };
    }
  }

  // 3. Honesty: a fixed answer, never the model's improvisation.
  if (asksIfReal(text, child)) {
    const name = displayName(doc);
    const say =
      doc.persona.mode === "neutral"
        ? `I'm Haven, an AI companion, not a person. Your family reads a short summary every evening.`
        : `I'm ${name}, an AI version of ${child}, made with ${people(doc).userP.poss} permission. I'm not the real ${child}. The real ${child} reads a short summary every evening and calls you in person.`;
    return { text: say, mode: "honesty", disclosed: true, ruleEvent, incident };
  }

  // 4. A preview waiting for her yes.
  const pending = session.pendingReply;
  if (pending) {
    if (isAffirmative(text, names)) {
      const r = await mcp.call("agent", "record_reply", { message: pending.message, kind: pending.kind, confirmation_id: pending.confirmationId });
      const say = r.ok
        ? typeof r.data.say === "string" ? r.data.say : `Done, ${child} will see it.`
        : r.data.code === "confirmation_expired"
          ? `That took a while, so I didn't send it. Tell me again if you'd like me to.`
          : `Sorry, I couldn't send that. Shall we try again later?`;
      return withDisclosure({ text: say, mode: "consent", pendingReply: null, ruleEvent, incident });
    }
    if (declines(text)) return withDisclosure({ text: `Okay ${doc.elder.calledBy}, I won't send it.`, mode: "consent", pendingReply: null, ruleEvent, incident });
  }
  const clearPending = pending ? null : undefined; // she moved on: the preview lapses

  // 5. Commitments only the real child can make.
  const commitment = detectCommitment(text, child);
  if (commitment) {
    const r = await mcp.call("agent", "create_deferral", { topic: commitment.topic, question: commitment.question, context: "" });
    const say = r.ok && typeof r.data.say === "string" ? r.data.say : `That one's for the real ${child}. I'll ask ${people(doc).userP.obj} tonight.`;
    return withDisclosure({ text: say, mode: "deferral", deferralId: r.ok ? String(r.data.deferral_id) : undefined, pendingReply: clearPending, ruleEvent, incident });
  }

  // 6. The brain proposes; the guard and the server decide.
  const brain = await runBrain(hh, doc, text, deps, now);
  let say = guardReply(brain.say, { childName: child, calledBy: doc.elder.calledBy, emergency: emergencyNumber(doc.elder) }).text;

  // 7. Carry out the proposals over MCP.
  for (const m of brain.remember) await mcp.call("agent", "remember", { type: m.type, content: m.content, private: m.private ?? false });
  if (brain.concern) {
    const w = CONCERN_TO_WELLBEING[brain.concern];
    await mcp.call("agent", "log_wellbeing", { mood: w.mood, sleep: w.sleep, appetite: w.appetite, mentions: [brain.concern.replace("_", " ")] });
  }
  let pendingReply: Routed["pendingReply"] = clearPending;
  let awaiting: Routed["awaiting"];
  if (brain.send_to_priya && ASKS_TO_SEND(child).test(text)) {
    const kind = ASKS_FOR_CALL.test(text) ? "call_request" : "reply";
    const r = await mcp.call("agent", "record_reply", { message: brain.send_to_priya, kind });
    if (r.ok && r.data.status === "needs_confirmation") {
      pendingReply = { confirmationId: String(r.data.confirmation_id), message: brain.send_to_priya, kind };
      awaiting = { to: String(r.data.to ?? child), message: brain.send_to_priya };
      // Ask instead of announcing: nothing is sent until she says yes.
      say = typeof r.data.say === "string" ? r.data.say : `Shall I send that to ${child}?`;
    }
  }
  return withDisclosure({ text: say, mode: brain.modelId === "rules" ? "rules" : "brain", pendingReply, awaiting, ruleEvent, incident, modelId: brain.modelId });
}

async function runBrain(hh: string, doc: Household, text: string, deps: TurnDeps, now: Date): Promise<BrainResult> {
  if (deps.brain !== "bedrock") return rulesBrain(doc, text);
  const used = await deps.repo.incrCounter(`BRAIN#${hh}#${istDate(now)}`, 1, 2 * 24 * 3600);
  if (used > (deps.dailyBrainCap ?? DEFAULT_BRAIN_CAP)) return rulesBrain(doc, text);
  const turns = doc.turns
    .filter((t) => t.speaker !== "system")
    .slice(0, -1) // the current elder turn goes in elderText
    .slice(-8)
    .map((t) => ({ speaker: t.speaker as "elder" | "avatar", text: t.text }));
  try {
    return await (deps.think ?? think)({ persona: compilePersona(doc), context: contextFor(doc, now), turns, elderText: text });
  } catch (err) {
    if (!(err instanceof BrainUnavailableError)) console.warn("brain failed:", (err as Error).message);
    else console.warn(err.message);
    return rulesBrain(doc, text);
  }
}

// What the model may know this turn. Private memories are included (usable with her, never
// passed on); the guard and the server keep them out of anything family-facing.
function contextFor(doc: Household, now: Date) {
  const memories = doc.memories.slice(-30).map((m) => `- (${m.type}${m.private ? ", private: never pass on" : ""}) ${m.content}`);
  const reminders = doc.reminders.map((r) => `- ${r.text} (due ${r.due})`);
  const open = doc.deferrals.filter((d) => d.status === "open").map((d) => `- ${d.question}`);
  return [
    `Today (IST): ${istDate(now)}`,
    `Elder: ${doc.elder.name}${doc.elder.age ? `, ${doc.elder.age}` : ""}${doc.elder.city ? `, ${doc.elder.city}` : ""} (${childName(doc)}'s ${doc.elder.relationToUser}); always call ${people(doc).elderP.obj} "${doc.elder.calledBy}".`,
    `Known memories:\n${memories.join("\n") || "- none"}`,
    `Reminders from family:\n${reminders.join("\n") || "- none"}`,
    `Questions already passed to the real family (do not answer them yourself):\n${open.join("\n") || "- none"}`,
  ].join("\n");
}

function ensureSession(doc: Household, now: Date): ActiveSession {
  if (!doc.session) {
    const at = now.toISOString();
    doc.session = { id: nextId(doc, "s"), startedAt: at, lastTurnAt: at, disclosedAt: at, deferralIds: [], toolsCalled: [], ruleEvents: [] };
  }
  return doc.session;
}

// Turns the open session into a SessionRecord (private turns removed) and clears it.
function closeSession(doc: Household, now: Date): SessionRecord | undefined {
  const s = doc.session;
  if (!s) return undefined;
  doc.session = undefined;
  return {
    id: s.id,
    date: istDate(new Date(s.startedAt)),
    startedAt: s.startedAt,
    endedAt: now.toISOString(),
    turns: doc.turns.filter((t) => t.at >= s.startedAt && !t.private).map((t) => ({ ...t })),
    deferralIds: [...s.deferralIds],
    toolsCalled: [...s.toolsCalled],
    ruleEvents: [...s.ruleEvents],
  };
}

async function load(repo: Repo, hh: string) {
  const doc = await repo.get(hh);
  if (!doc) throw new NotFoundError(hh);
  return doc;
}

const childName = (doc: Household) => doc.members.find((m) => m.id === doc.persona.childMemberId)?.name ?? "your family";
const displayName = (doc: Household) => (doc.persona.mode === "neutral" ? "Haven" : doc.persona.displayName);

async function speakSafely(speak: SpeakFn | undefined, text: string, voice?: VoiceChoice, fallback?: { voiceId: string; languageCode: string }) {
  if (!speak) return undefined;
  try {
    return await speak(text, voice, fallback);
  } catch (err) {
    console.warn("speech failed, tablet will use browser speech:", (err as Error).message);
    return undefined;
  }
}
