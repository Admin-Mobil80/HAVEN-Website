import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CAPS, MEMORY_TYPES, type Household, type Memory } from "../../domain/types.js";
import { capPush, nextId } from "../../domain/util.js";
import type { ToolContext } from "../context.js";
import { declaredOutput, guard, loadDoc, normalize, sameWord, tokens, trace } from "../result.js";

const MemoryOut = z.object({
  id: z.string(),
  type: z.enum(MEMORY_TYPES),
  content: z.string(),
  private: z.boolean().describe("True if she asked to keep it from her family. Fine to use with her; never repeat it to anyone else."),
  at: z.string(),
});
export const RecallOutput = z.object({ memories: z.array(MemoryOut), matched: z.number().int() });

export const RememberOutput = z.object({
  status: z.enum(["stored", "duplicate", "blocked_by_boundary"]),
  memory_id: z.string().nullable(),
  private: z.boolean(),
  note: z.string().describe("Guidance for you; do not read it aloud."),
});

const recency = (m: Memory) => m.lastMentionedAt ?? m.createdAt;

// Keyword overlap, most recent first among equal scores. No query means most recent first.
export function rankMemories(memories: Memory[], query?: string): Memory[] {
  const byRecency = [...memories].sort((a, b) => recency(b).localeCompare(recency(a)));
  const q = query ? tokens(query) : [];
  if (q.length === 0) return byRecency;
  return byRecency
    .map((m) => {
      const words = tokens(m.content);
      return { m, score: q.filter((w) => words.some((x) => sameWord(w, x))).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
}

// A memory mentions an avoid-topic if it contains the phrase, or (for 3+ key words) all but one
// of its key words. Erring towards blocking only loses a harmless memory.
export function mentionsTopic(content: string, topic: string) {
  const phrase = normalize(topic);
  if (!phrase) return false;
  if (` ${normalize(content)} `.includes(` ${phrase} `)) return true;
  const key = tokens(topic);
  if (key.length === 0) return false;
  const words = tokens(content);
  const hits = key.filter((k) => words.some((w) => sameWord(w, k))).length;
  return hits >= (key.length >= 3 ? key.length - 1 : key.length);
}

const SECRET =
  /\b(don'?t|dont|do not|never|please don'?t)\s+(tell|mention|say|share|let)\b|\bkeep (this|it|that) (a )?(secret|private|between)|\bbetween (you and me|us)\b|\b(mat|na) (batana|bataana|batao|bataao|bolna|kehna|kahna|kehnaa)\b|\bkisi ko (mat|na)\b/;
// \b is ASCII-only, so Devanagari words are bounded by "not a letter or vowel sign" instead.
const SECRET_HI =
  /(?<![\p{L}\p{M}])(?:(?:मत|ना)\s+(?:बताना|बताओ|बताइए|बताइये|बोलना|कहना)|किसी\s+को\s+(?:मत|ना))(?![\p{L}\p{M}])/u;

// Elder speech may be Hinglish or Devanagari (hi-IN): "Priya se mat kehna", "प्रिया को मत बताना".
export function soundsPrivate(text: string) {
  const s = text.normalize("NFKC").toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ");
  return SECRET.test(s) || SECRET_HI.test(s);
}

// The host writes the elder's turn before calling tools, and the model may drop the
// "don't tell Priya" part from the content, so the latest elder turns count too.
const RECENT_TURN_MS = 10 * 60 * 1000;
function elderAskedPrivacy(doc: Household, now: Date) {
  return doc.turns
    .filter((t) => t.speaker === "elder" && now.getTime() - Date.parse(t.at) <= RECENT_TURN_MS)
    .slice(-2)
    .some((t) => soundsPrivate(t.text));
}

function isNearDuplicate(a: string, b: string) {
  if (normalize(a) === normalize(b)) return true;
  const x = new Set(tokens(a));
  const y = new Set(tokens(b));
  if (x.size === 0 || y.size === 0) return false;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared) >= 0.8;
}

export function registerMemoryTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "recall_memory",
    {
      title: "Recall memories",
      description:
        "Look up things the elder has shared before (people, events, preferences, stories, routines) so you can bring them up naturally. " +
        "Use a short keyword query, a type, or neither for the most recent. Memories marked private may be used with her but must never be passed on to family.",
      inputSchema: {
        query: z.string().max(80).optional().describe("A few keywords, e.g. 'Lalitha' or 'Diwali sweets'."),
        about: z.enum(MEMORY_TYPES).optional(),
        limit: z.number().int().min(1).max(5).default(5),
      },
      outputSchema: declaredOutput(RecallOutput),
      annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
    },
    ({ query, about, limit }) =>
      guard(ctx, "recall_memory", async () => {
        const doc = await loadDoc(ctx);
        const pool = about ? doc.memories.filter((m) => m.type === about) : doc.memories;
        const ranked = rankMemories(pool, query);
        trace(ctx, "recall_memory", `recall_memory: ${ranked.length} matched`);
        return {
          memories: ranked.slice(0, limit).map((m) => ({ id: m.id, type: m.type, content: m.content, private: m.private, at: recency(m) })),
          matched: ranked.length,
        };
      }),
  );

  server.registerTool(
    "remember",
    {
      title: "Remember something",
      description:
        "Save one short fact the elder shared so you can recall it later (a person, event, preference, story or routine). " +
        "Set private when she asks to keep it from her family (for example 'don't tell Priya'); the server also detects this. " +
        "Do not save health details, money matters, or anything she did not say herself. Saving is silent: do not announce it.",
      inputSchema: {
        type: z.enum(MEMORY_TYPES),
        content: z.string().trim().min(1).max(200).describe("One short sentence in the third person, e.g. 'Lalitha visited on Sunday'."),
        private: z.boolean().optional(),
      },
      outputSchema: declaredOutput(RememberOutput),
      annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false },
    },
    (args) =>
      guard(ctx, "remember", async () => {
        const now = ctx.now();
        const out = await ctx.repo.update(ctx.householdId, (doc) => {
          if (doc.persona.avoidTopics.some((t) => mentionsTopic(args.content, t))) {
            return { status: "blocked_by_boundary" as const, memory_id: null, private: false, note: "Her family asked that this topic is not kept or raised. Do not store it; gently move the conversation on." };
          }
          const isPrivate = args.private === true || soundsPrivate(args.content) || elderAskedPrivacy(doc, now);
          const existing = doc.memories.find((m) => isNearDuplicate(m.content, args.content));
          if (existing) {
            existing.lastMentionedAt = now.toISOString();
            if (isPrivate) existing.private = true; // a later "don't tell" applies to what we already hold
            return { status: "duplicate" as const, memory_id: existing.id, private: existing.private, note: "Already remembered." };
          }
          const memory: Memory = {
            id: nextId(doc, "m"),
            type: args.type,
            content: args.content,
            private: isPrivate,
            source: "conversation",
            createdAt: now.toISOString(),
          };
          capPush(doc.memories, memory, CAPS.memories);
          return { status: "stored" as const, memory_id: memory.id, private: isPrivate, note: isPrivate ? "Saved as private: never pass it on to family." : "Saved." };
        });
        trace(ctx, "remember", `remember: ${out.status}${out.private ? " (private)" : ""}`);
        return out;
      }),
  );
}
