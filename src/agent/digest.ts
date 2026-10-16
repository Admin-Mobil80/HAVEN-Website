import type { BedrockRuntimeClient, ConverseCommandInput, Tool } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import { MOODS, type Household, type Mood, type SessionRecord, type Tier } from "../domain/types.js";
import { istDate } from "../domain/util.js";
import { converse, defaultClient, defaultModelIds, inferenceFor } from "./brain.js";

// The evening digest: what Priya needs before she calls. Only facts that may be shared go in;
// private memories, private turns and private wellbeing never reach the model or the message.
// The tier comes from the server's own records, never from the model.

export type DigestFacts = {
  date: string;
  elder: string; // "Kamala"
  calledBy: string; // "Amma"
  child: string; // "Priya"
  lines: string[]; // today's conversation, "Amma: ..." / "Digital Priya: ..."
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
  const child = doc.members.find((m) => m.id === doc.persona.childMemberId)?.name ?? "your family";
  const avatar = doc.persona.mode === "neutral" ? "Haven" : doc.persona.displayName;

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
    calledBy: doc.elder.calledBy,
    child,
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
          summary: { type: "string", description: "One or two warm, plain sentences about her day. Facts only from the notes. No diagnosis, no medical terms, no alarm." },
          mood: { type: "string", enum: [...MOODS] },
          topics: { type: "array", items: { type: "string" }, maxItems: 5, description: "Short topic words she talked about." },
          starters: { type: "array", items: { type: "string" }, maxItems: 3, description: "2-3 questions the child could ask her when calling, about her own life, e.g. 'Ask her which song she sang with Saroja.' Never her own questions to the child." },
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

const SYSTEM = [
  "You write a short evening update about an older mother for her adult child, who lives far away.",
  "Use only the notes given. Never invent events, never diagnose, never use medical language, never alarm.",
  "Alerts are handled separately; mention them only as 'there was a moment today when she felt unwell' if listed.",
  "Conversation starters are questions the child can ask HER about her own life (her day, friends, garden, stories), taken from what she said or her stories. Never repeat her questions to the child as starters; those are listed separately. Address the child as 'you'.",
  "Write in the third person about her ('Amma met ...'), never as 'I' or 'me'.",
].join(" ");

export async function writeDigest(facts: DigestFacts, opts: { client?: BedrockRuntimeClient; modelIds?: string[]; timeoutMs?: number } = {}): Promise<DigestContent> {
  if (facts.lines.length === 0 && facts.questions.length === 0) return fallbackDigest(facts);
  const client = opts.client ?? defaultClient();
  const notes = [
    `Date: ${facts.date}. Mother: ${facts.elder} (called ${facts.calledBy}). Child: ${facts.child}.`,
    `Today's conversation with her AI companion:\n${facts.lines.join("\n") || "(none)"}`,
    `Questions she asked that only ${facts.child} can answer:\n${facts.questions.map((q) => `- ${q}`).join("\n") || "(none)"}`,
    `Moods noted: ${facts.moods.join(", ") || "none"}. Mentions: ${facts.concerns.join(", ") || "none"}.`,
    `Alerts today: ${facts.alerts.join("; ") || "none"}.`,
    `Her stories (for starters):\n${facts.stories.map((s) => `- ${s}`).join("\n") || "(none)"}`,
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
  if (f.questions.length) parts.push(`She asked something only you can answer: ${f.questions[0]}`);
  const starters = f.stories.slice(-2).map((s) => s.replace(/[.;]+$/, ""));
  return { summary: parts.join(" ").slice(0, 300), mood: f.moods.at(-1), topics: f.concerns.slice(0, 5), starters, modelId: "rules" };
}

// Spoken by Polly as the WhatsApp voice note (30-60 s).
export function voiceScript(f: DigestFacts, c: DigestContent) {
  const ask = c.starters.length ? ` When you call, you could ask her: ${c.starters.slice(0, 2).join(" Or, ")}` : "";
  const q = f.questions.length && !c.summary.includes(f.questions[0]) ? ` She also asked: ${f.questions[0]} Haven told her you'd answer.` : "";
  return `Hi ${f.child}, here is today's update about ${f.calledBy}. ${c.summary}${q}${ask} Haven is an AI companion and can be wrong.`.slice(0, 2400);
}

// The text body the family dashboard mirrors and WhatsApp sends inside the 24 h window.
export function digestBody(f: DigestFacts, c: DigestContent) {
  const lines = [`Today's update about ${f.calledBy}: ${c.summary}`];
  if (f.questions.length && !c.summary.includes(f.questions[0])) lines.push(`She asked: ${f.questions[0]}`);
  if (c.starters.length) lines.push(`When you call, ask about: ${c.starters.slice(0, 2).join("; ")}`);
  return lines.join("\n");
}
