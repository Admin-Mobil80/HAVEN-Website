import type { BedrockRuntimeClient, ConverseCommandInput, Tool } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import { MOODS, type Household, type Mood, type SessionRecord, type Tier } from "../domain/types.js";
import { istDate } from "../domain/util.js";
import { forms, people, type Forms } from "../domain/people.js";
import { converse, defaultClient, defaultModelIds, inferenceFor } from "./brain.js";

// The evening digest: what the family member needs before they call. Only facts that may be shared go in;
// private memories, private turns and private wellbeing never reach the model or the message.
// The tier comes from the server's own records, never from the model.

export type DigestFacts = {
  date: string;
  elder: string; // their name
  calledBy: string; // what the main user calls them
  relation: string; // "mother", "father", "grandmother", ...
  child: string; // the main user's name
  E: Forms; // the elder's pronouns
  lines: string[]; // today's conversation, "<calledBy>: ..." / "Digital <name>: ..."
  questions: string[]; // open deferrals: things only the real child can answer
  moods: Mood[];
  concerns: string[];
  alerts: string[]; // incidents opened today, by tier and reason
  stories: string[]; // shareable memories to build conversation starters from
  tier: Tier;
  openDeferralIds: string[];
};

export type DigestContent = { summary: string; mood?: Mood; topics: string[]; starters: string[]; modelId: string };

export function gatherFacts(doc: Household, sessions: SessionRecord[], now: Date): DigestFacts {
  const date = istDate(now);
  const today = (iso: string) => istDate(new Date(iso)) === date;
  const p = people(doc);
  const child = p.user;
  const avatar = p.companion;

  // Closed sessions plus the one still open, without duplicates and without private turns.
  const seen = new Set<string>();
  const turns = [...sessions.flatMap((s) => s.turns), ...doc.turns.filter((t) => today(t.at))]
    .filter((t) => !t.private && t.speaker !== "system" && !seen.has(t.id) && seen.add(t.id))
    .sort((a, b) => a.at.localeCompare(b.at));

  const wellbeing = doc.wellbeing.filter((w) => !w.private && today(w.at));
  const incidents = doc.incidents.filter((i) => today(i.openedAt));
  const open = doc.deferrals.filter((d) => d.status === "open");
  const tier: Tier = incidents.some((i) => i.tier === "urgent")
    ? "urgent"
    : incidents.length > 0 || wellbeing.some((w) => w.tier === "important")
      ? "important"
      : "worth_knowing";

  return {
    date,
    elder: doc.elder.name,
    calledBy: p.calledBy,
    relation: p.relation,
    child,
    E: forms(doc.elder.pronouns),
    lines: turns.slice(-40).map((t) => `${t.speaker === "elder" ? doc.elder.calledBy : avatar}: ${t.text.slice(0, 200)}`),
    questions: open.map((d) => d.question),
    moods: wellbeing.map((w) => w.mood),
    concerns: [...new Set(wellbeing.flatMap((w) => w.mentions))].slice(0, 6),
    alerts: incidents.map((i) => `${i.tier}${i.emergency ? " (emergency)" : ""}: ${i.reason.replace(/_/g, " ")}, ${i.state}`),
    stories: doc.memories.filter((m) => !m.private).slice(-15).map((m) => m.content),
    tier,
    openDeferralIds: open.map((d) => d.id),
  };
}

const WRITE_TOOL: Tool = {
  toolSpec: {
    name: "write_digest",
    description: "Write the evening update for the adult child.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          summary: { type: "string", description: "One or two warm, plain sentences about their day. Facts only from the notes. No diagnosis, no medical terms, no alarm." },
          mood: { type: "string", enum: [...MOODS] },
          topics: { type: "array", items: { type: "string" }, maxItems: 5, description: "Short topic words they talked about." },
          starters: { type: "array", items: { type: "string" }, maxItems: 3, description: "2-3 things the family member could ask about when calling, about the elder's own life, e.g. 'Ask which song they sang with their friend at the temple.' Never the elder's own questions to the family." },
        },
        required: ["summary", "starters"],
      },
    },
  },
};

const Output = z.object({
  summary: z.string().trim().min(1).transform((s) => s.slice(0, 300)),
  mood: z.enum(MOODS).optional().catch(undefined),
  topics: z.array(z.string().trim().min(1).max(40)).max(5).catch([]),
  starters: z.array(z.string().trim().min(1).max(160)).max(3).catch([]),
});

// Names, relationship and pronouns come from the notes, so the same prompt works for a mother,
// a father, a grandparent or a friend.
const SYSTEM = [
  "You write a short evening update about an older person who lives alone, for a family member who lives far away.",
  "Use only the notes given. Never invent events, never diagnose, never use medical language, never alarm.",
  "Alerts are handled separately; mention them only as 'there was a moment today when they felt unwell' if listed.",
  "Conversation starters are questions the family member can ask the older person about their own life (their day, friends, hobbies, stories), taken from what they said or their stories. Never repeat the older person's questions to the family as starters; those are listed separately. Address the family member as 'you'.",
  "Write in the third person, using the name and pronouns given in the notes (e.g. 'Ummi met ...'), never as 'I' or 'me'.",
].join(" ");

export async function writeDigest(facts: DigestFacts, opts: { client?: BedrockRuntimeClient; modelIds?: string[]; timeoutMs?: number } = {}): Promise<DigestContent> {
  if (facts.lines.length === 0 && facts.questions.length === 0) return fallbackDigest(facts);
  const client = opts.client ?? defaultClient();
  const notes = [
    `Date: ${facts.date}. Older person: ${facts.elder}, ${facts.child}'s ${facts.relation}; ${facts.child} calls ${facts.E.obj} "${facts.calledBy}". Pronouns: ${facts.E.subj}/${facts.E.obj}. Family member reading this: ${facts.child}.`,
    `Today's conversation with ${facts.E.poss} AI companion:\n${facts.lines.join("\n") || "(none)"}`,
    `Questions ${facts.E.subj} asked that only ${facts.child} can answer:\n${facts.questions.map((q) => `- ${q}`).join("\n") || "(none)"}`,
    `Moods noted: ${facts.moods.join(", ") || "none"}. Mentions: ${facts.concerns.join(", ") || "none"}.`,
    `Alerts today: ${facts.alerts.join("; ") || "none"}.`,
    `${facts.E.Poss} stories (for starters):\n${facts.stories.map((s) => `- ${s}`).join("\n") || "(none)"}`,
  ].join("\n\n");
  for (const modelId of opts.modelIds ?? defaultModelIds()) {
    const input: ConverseCommandInput = {
      modelId,
      system: [{ text: SYSTEM }],
      messages: [{ role: "user", content: [{ text: notes }] }],
      toolConfig: { tools: [WRITE_TOOL], toolChoice: { tool: { name: "write_digest" } } },
      ...inferenceFor(modelId),
    };
    try {
      const out = await converse(client, input, opts.timeoutMs ?? 15000);
      const block = out.output?.message?.content?.find((c) => c.toolUse)?.toolUse;
      const parsed = Output.safeParse(block?.input);
      if (parsed.success) return { ...parsed.data, modelId };
    } catch (err) {
      console.warn(JSON.stringify({ msg: "digest_model_failed", modelId, error: (err as Error).message?.slice(0, 200) }));
    }
  }
  return fallbackDigest(facts);
}

// Deterministic digest from the records alone (no model available, or a quiet day).
export function fallbackDigest(f: DigestFacts): DigestContent {
  const parts: string[] = [];
  if (f.lines.length === 0) parts.push(`${f.calledBy} didn't chat with Haven today.`);
  else parts.push(`${f.calledBy} chatted with Haven today${f.concerns.length ? ` and mentioned ${f.concerns.slice(0, 2).join(" and ")}` : ""}.`);
  if (f.questions.length) parts.push(`${f.E.Subj} asked something only you can answer: ${f.questions[0]}`);
  const starters = f.stories.slice(-2).map((s) => s.replace(/[.;]+$/, ""));
  return { summary: parts.join(" ").slice(0, 300), mood: f.moods.at(-1), topics: f.concerns.slice(0, 5), starters, modelId: "rules" };
}

// Spoken by Polly as the WhatsApp voice note (30-60 s).
export function voiceScript(f: DigestFacts, c: DigestContent) {
  const ask = c.starters.length ? ` When you call, you could ask about: ${c.starters.slice(0, 2).join(" Or, ")}` : "";
  const q = f.questions.length && !c.summary.includes(f.questions[0]) ? ` ${f.E.Subj} also asked: ${f.questions[0]} Haven said you'd answer.` : "";
  return `Hi ${f.child}, here is today's update about ${f.calledBy}. ${c.summary}${q}${ask} Haven is an AI companion and can be wrong.`.slice(0, 2400);
}

// The text body the family dashboard mirrors and WhatsApp sends inside the 24 h window.
export function digestBody(f: DigestFacts, c: DigestContent) {
  const lines = [`Today's update about ${f.calledBy}: ${c.summary}`];
  if (f.questions.length && !c.summary.includes(f.questions[0])) lines.push(`${f.E.Subj} asked: ${f.questions[0]}`);
  if (c.starters.length) lines.push(`When you call, ask about: ${c.starters.slice(0, 2).join("; ")}`);
  return lines.join("\n");
}
