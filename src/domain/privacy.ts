import { callStats, type CallStats } from "./metrics.js";
import type {
  DeferTopic,
  DigestRecord,
  FamilyMessage,
  Household,
  Incident,
  IncidentEvent,
  Memory,
  OutboxEntry,
  Reminder,
  Wellbeing,
} from "./types.js";

// Projections are the only shapes that leave the server for the two screens. They are built
// field by field (never by spreading the document) so a new field on Household cannot leak
// by default.

const CALLING_WINDOW_MS = 15 * 60 * 1000;
const ACTIVE_INCIDENT = new Set(["open", "acknowledged"]);

export type ElderProjection = {
  householdId: string;
  demo: boolean;
  configured: boolean;
  persona: { displayName: string; mode: "child" | "neutral"; isAI: true; badge: string; childName?: string; childPronouns?: string };
  elder: { name: string; calledBy: string; pronouns: string; language: "en-IN" | "hi-IN" };
  pendingFamilyMessages: number;
  reminders: { id: string; text: string; due: string; source: Reminder["source"] }[];
  openIncident: { id: string; tier: Incident["tier"]; emergency: boolean; state: Incident["state"]; openedAt: string } | null;
  familyCalling: { by: string; at: string } | null; // a family member tapped "Call" moments ago
};

// What Amma's tablet needs. No phone numbers, no other members' details, no family-side data.
export function elderProjection(doc: Household, now: Date = new Date()): ElderProjection {
  const neutral = doc.persona.mode === "neutral";
  const displayName = neutral ? "Haven" : doc.persona.displayName;
  const child = doc.members.find((m) => m.id === doc.persona.childMemberId);
  const incident = [...doc.incidents].reverse().find((i) => ACTIVE_INCIDENT.has(i.state));
  const lastCall = [...doc.contacts].reverse().find((c) => c.type === "call" && !c.demoSeed);
  const calling = lastCall && now.getTime() - Date.parse(lastCall.at) <= CALLING_WINDOW_MS && Date.parse(lastCall.at) <= now.getTime();
  return {
    householdId: doc.id,
    demo: doc.demo,
    configured: doc.configured,
    persona: { displayName, mode: doc.persona.mode, isAI: true, badge: `${displayName} · AI`, childName: neutral ? undefined : child?.name, childPronouns: neutral ? undefined : child?.pronouns },
    elder: { name: doc.elder.name, calledBy: doc.elder.calledBy, pronouns: doc.elder.pronouns, language: doc.elder.language },
    pendingFamilyMessages: doc.messages.filter((m) => !m.playedAt).length,
    reminders: [...doc.reminders]
      .sort((a, b) => a.due.localeCompare(b.due))
      .map((r) => ({ id: r.id, text: r.text, due: r.due, source: r.source })),
    openIncident: incident
      ? { id: incident.id, tier: incident.tier, emergency: incident.emergency, state: incident.state, openedAt: incident.openedAt }
      : null,
    familyCalling: calling && lastCall ? { by: memberName(doc, lastCall.by), at: lastCall.at } : null,
  };
}

export type FamilyProjection = {
  householdId: string;
  demo: boolean;
  elder: { name: string; calledBy: string; relationToUser: string; pronouns: string; age?: number; city: string; phone: string };
  configured: boolean;
  members: { id: string; name: string; relation: string; role: "primary" | "backup"; waOptIn: boolean }[];
  persona: { displayName: string; mode: "child" | "neutral" };
  consents: { conversationStorage: boolean; shareSummaries: boolean; healthNotes: boolean };
  digests: Pick<DigestRecord, "id" | "date" | "createdAt" | "summary" | "mood" | "topics" | "starters" | "openDeferrals" | "tier" | "audioKey">[];
  deferrals: { id: string; topic: DeferTopic; question: string; status: "open" | "answered" | "relayed"; createdAt: string; answeredAt?: string; relayedAt?: string }[];
  messages: Pick<FamilyMessage, "id" | "from" | "kind" | "text" | "audioKey" | "inReplyTo" | "createdAt" | "playedAt">[];
  outbox: Pick<OutboxEntry, "id" | "at" | "to" | "kind" | "body" | "channel" | "status" | "refId">[];
  incidents: (Pick<Incident, "id" | "tier" | "emergency" | "source" | "reason" | "state" | "openedAt" | "lastAlertAt" | "ackBy" | "closedBy" | "closedAt"> & { timeline: IncidentEvent[] })[];
  avatarLines: { at: string; text: string }[];
  wellbeing: Omit<Wellbeing, "private">[];
  memories: Pick<Memory, "id" | "type" | "content" | "source" | "createdAt">[];
  reminders: Reminder[];
  callStats: CallStats;
  goals: { baselineCallsPerWeek: number; goalCallsPerWeek: number };
};

// What Priya's phone and the judge view see. Never raw elder turns, private memories or
// private wellbeing, never confirmation ids. Free text is passed through the redactor as a
// second line of defence in case private words were copied into a summary upstream.
export function familyProjection(doc: Household, now: Date): FamilyProjection {
  const r = (s: string) => redactLogSummary(s, doc);
  const ro = (s: string | undefined) => (s === undefined ? undefined : r(s));
  const confirmationIds = new Set(doc.confirmations.map((c) => c.id));
  return {
    householdId: doc.id,
    demo: doc.demo,
    configured: doc.configured,
    elder: { name: doc.elder.name, calledBy: doc.elder.calledBy, relationToUser: doc.elder.relationToUser, pronouns: doc.elder.pronouns, age: doc.elder.age, city: doc.elder.city, phone: doc.elder.phone },
    members: doc.members.map((m) => ({ id: m.id, name: m.name, relation: m.relation, role: m.role, waOptIn: Boolean(m.waOptIn && !m.waOptIn.revokedAt) })),
    persona: { displayName: doc.persona.displayName, mode: doc.persona.mode },
    consents: {
      conversationStorage: active(doc.consents.conversationStorage),
      shareSummaries: active(doc.consents.shareSummaries),
      healthNotes: active(doc.consents.healthNotes),
    },
    digests: doc.digests.map((d) => ({
      id: d.id,
      date: d.date,
      createdAt: d.createdAt,
      summary: r(d.summary),
      mood: d.mood,
      topics: d.topics.map(r),
      starters: d.starters.map(r),
      openDeferrals: d.openDeferrals,
      tier: d.tier,
      audioKey: d.audioKey,
    })),
    deferrals: doc.deferrals.map((d) => ({
      id: d.id,
      topic: d.topic,
      question: r(d.question),
      status: d.status,
      createdAt: d.createdAt,
      answeredAt: d.answeredAt,
      relayedAt: d.relayedAt,
    })),
    messages: doc.messages.map((m) => ({ id: m.id, from: m.from, kind: m.kind, text: m.text, audioKey: m.audioKey, inReplyTo: m.inReplyTo, createdAt: m.createdAt, playedAt: m.playedAt })),
    outbox: doc.outbox.map((o) => ({
      id: o.id,
      at: o.at,
      to: o.to,
      kind: o.kind,
      body: r(o.body),
      channel: o.channel,
      status: o.status,
      refId: o.refId && !confirmationIds.has(o.refId) ? o.refId : undefined,
    })),
    incidents: doc.incidents.map((i) => ({
      id: i.id,
      tier: i.tier,
      emergency: i.emergency,
      source: i.source,
      reason: i.reason,
      state: i.state,
      openedAt: i.openedAt,
      lastAlertAt: i.lastAlertAt,
      ackBy: i.ackBy,
      closedBy: i.closedBy,
      closedAt: i.closedAt,
      timeline: i.timeline.map((e) => ({ at: e.at, event: e.event, detail: ro(e.detail) })),
    })),
    avatarLines: doc.turns.filter((t) => t.speaker === "avatar" && !t.private).map((t) => ({ at: t.at, text: r(t.text) })),
    wellbeing: doc.wellbeing
      .filter((w) => !w.private)
      .map((w) => ({ id: w.id, at: w.at, mood: w.mood, energy: w.energy, sleep: w.sleep, appetite: w.appetite, mentions: w.mentions.map(r), note: ro(w.note), tier: w.tier })),
    memories: doc.memories.filter((m) => !m.private).map((m) => ({ id: m.id, type: m.type, content: r(m.content), source: m.source, createdAt: m.createdAt })),
    reminders: doc.reminders.map((x) => ({ id: x.id, text: x.text, due: x.due, source: x.source, confirmedBy: x.confirmedBy })),
    callStats: callStats(doc, now),
    goals: { baselineCallsPerWeek: doc.goals.baselineCallsPerWeek, goalCallsPerWeek: doc.goals.goalCallsPerWeek },
  };
}

type Tok = { word: string; start: number; end: number };

// \p{M} keeps Devanagari vowel signs inside their word.
function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  for (const m of s.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    out.push({ word: m[0].normalize("NFKC").toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function privateTexts(doc: Household): string[] {
  return [
    ...doc.memories.filter((m) => m.private).map((m) => m.content),
    ...doc.wellbeing.filter((w) => w.private && w.note).map((w) => w.note as string),
    ...doc.turns.filter((t) => t.private).map((t) => t.text),
  ];
}

// Replaces any run of words copied from private text with "[private]". A run matches when it
// shares 3 consecutive words with a private text (or the whole text when it is shorter), and it
// is then widened over neighbouring words of the same text, including a word cut short by
// truncation ("...borrowed 50,00"). Over-redaction is the intended failure mode.
export function redactLogSummary(summary: string, doc: Household): string {
  const secrets = privateTexts(doc);
  if (!summary || secrets.length === 0) return summary;
  const toks = tokenize(summary);
  const hit = new Array<boolean>(toks.length).fill(false);

  for (const secret of secrets) {
    const words = tokenize(secret).map((t) => t.word);
    if (words.length === 0) continue;
    const n = Math.min(3, words.length);
    const grams = new Set<string>();
    for (let i = 0; i + n <= words.length; i++) grams.add(words.slice(i, i + n).join(" "));

    const local = new Array<boolean>(toks.length).fill(false);
    let any = false;
    for (let i = 0; i + n <= toks.length; i++) {
      if (!grams.has(toks.slice(i, i + n).map((t) => t.word).join(" "))) continue;
      for (let j = i; j < i + n; j++) local[j] = true;
      any = true;
    }
    if (!any) continue;

    const vocab = new Set(words);
    for (let i = 1; i < toks.length; i++) {
      const w = toks[i].word;
      if (local[i - 1] && !local[i] && (vocab.has(w) || words.some((v) => v.startsWith(w)))) local[i] = true;
    }
    for (let i = toks.length - 2; i >= 0; i--) {
      const w = toks[i].word;
      if (local[i + 1] && !local[i] && (vocab.has(w) || words.some((v) => v.endsWith(w)))) local[i] = true;
    }
    local.forEach((v, i) => {
      if (v) hit[i] = true;
    });
  }

  let out = "";
  let cursor = 0;
  for (let i = 0; i < toks.length; i++) {
    if (!hit[i]) continue;
    let j = i;
    while (j + 1 < toks.length && hit[j + 1]) j++;
    out += summary.slice(cursor, toks[i].start) + "[private]";
    cursor = toks[j].end;
    i = j;
  }
  return out + summary.slice(cursor);
}

function active(c: { revokedAt?: string } | undefined) {
  return Boolean(c && !c.revokedAt);
}

function memberName(doc: Household, id: string) {
  return doc.members.find((m) => m.id === id)?.name ?? id;
}
