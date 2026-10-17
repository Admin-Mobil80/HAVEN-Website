import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type Tool,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import { MEMORY_TYPES, type MemoryType } from "../domain/types.js";

// The LLM brain for one elder turn: a single Bedrock Converse call with a forced "respond" tool.
// It only proposes; the host decides what actually happens (guard, consent, MCP tools). Safety
// escalation never depends on this module: the rules path runs before it and without it.

export const CONCERNS = ["none", "not_eating", "poor_sleep", "low_mood", "lonely", "pain", "confused"] as const;
export type Concern = Exclude<(typeof CONCERNS)[number], "none">;

export const LIMITS = {
  sayChars: 300,
  saySentences: 2,
  rememberItems: 3,
  memoryChars: 200,
  sendChars: 280,
  turns: 8,
  turnChars: 300,
  contextChars: 4000,
  elderChars: 1000,
} as const;

export type BrainInput = {
  persona: string;
  context: string;
  turns: { speaker: "elder" | "avatar"; text: string }[];
  elderText: string;
};

export type BrainResult = {
  say: string;
  remember: { type: MemoryType; content: string; private?: boolean }[];
  send_to_priya?: string;
  concern?: Concern; // "none" is normalised to undefined
  modelId: string;
  latencyMs: number; // wall time of think(), including failed attempts
};

export type ThinkOptions = { client?: BedrockRuntimeClient; modelIds?: string[]; timeoutMs?: number };

export class BrainUnavailableError extends Error {
  constructor(readonly attempts: { modelId: string; error: string }[]) {
    super(`brain_unavailable: ${attempts.map((a) => `${a.modelId}: ${a.error}`).join("; ") || "no models configured"}`);
    this.name = "BrainUnavailableError";
  }
}

export function defaultModelIds() {
  return [
    process.env.BEDROCK_MODEL_ID ?? "openai.gpt-oss-120b-1:0",
    process.env.BEDROCK_FALLBACK_MODEL_ID ?? "apac.amazon.nova-lite-v1:0",
  ];
}

const clients = new Map<string, BedrockRuntimeClient>();
export function defaultClient() {
  const region = process.env.AWS_REGION ?? "ap-south-1";
  let c = clients.get(region);
  // One SDK attempt: a throttled or failing model should hand over to the fallback model quickly.
  if (!c) clients.set(region, (c = new BedrockRuntimeClient({ region, maxAttempts: 1 })));
  return c;
}

export const RESPOND_TOOL: Tool = {
  toolSpec: {
    name: "respond",
    description: "Your reply to the elder for this turn. Always call this tool exactly once.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          say: {
            type: "string",
            maxLength: LIMITS.sayChars,
            description: "What you say aloud to the elder: at most 2 short, warm sentences in your persona's style.",
          },
          remember: {
            type: "array",
            maxItems: LIMITS.rememberItems,
            description: "New facts about the elder's life worth remembering (people, events, preferences, stories, routines). Empty if nothing new.",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: [...MEMORY_TYPES] },
                content: { type: "string", maxLength: LIMITS.memoryChars },
                private: { type: "boolean", description: "true if the elder asked to keep this from the family (\"don't tell my son\")." },
              },
              required: ["type", "content"],
            },
          },
          send_to_priya: {
            type: "string",
            maxLength: LIMITS.sendChars,
            description: "Only when the elder explicitly asks you to tell or send the real family member something: that message, in the elder's words. Otherwise omit.",
          },
          concern: {
            type: "string",
            enum: [...CONCERNS],
            description: "A wellbeing concern heard in the elder's own words, else none. Never a diagnosis.",
          },
        },
        required: ["say", "remember"],
      },
    },
  },
};

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

// Cut at a word boundary when one is reasonably close, never mid-way through a long word salad.
export function clip(s: string, max: number) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
}

export function firstSentences(s: string, n: number) {
  const parts = s.split(/(?<=[.!?।])\s+/u).filter(Boolean);
  return parts.slice(0, n).join(" ");
}

const stripReasoning = (s: string) =>
  s.replace(/<(thinking|reasoning)>[\s\S]*?<\/\1>/gi, "").replace(/<\/?(thinking|reasoning|response)>/gi, "");

const maybeJson = (v: unknown) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

const RememberItem = z.object({
  type: z.enum(MEMORY_TYPES).catch("other"),
  content: z.string(),
  private: z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean().optional()).catch(undefined),
});

const RawOutput = z.object({
  say: z.string().catch(""),
  remember: z.preprocess(maybeJson, z.array(z.unknown())).catch([]),
  send_to_priya: z.string().nullish().catch(undefined),
  concern: z.string().nullish().catch(undefined),
});

// The bounds every caller may rely on, whatever the model produced.
export const BrainActions = z.object({
  say: z.string().min(1).max(LIMITS.sayChars),
  remember: z
    .array(z.object({ type: z.enum(MEMORY_TYPES), content: z.string().min(1).max(LIMITS.memoryChars), private: z.boolean().optional() }))
    .max(LIMITS.rememberItems),
  send_to_priya: z.string().min(1).max(LIMITS.sendChars).optional(),
  concern: z.enum(CONCERNS).exclude(["none"]).optional(),
});
export type BrainActions = z.infer<typeof BrainActions>;

const EMPTY_VALUE = /^(none|null|n\/?a|no|nothing|-)?$/i;

export function normalizeActions(input: unknown): BrainActions {
  const raw = RawOutput.parse(input && typeof input === "object" ? input : {});
  const say = clip(firstSentences(oneLine(stripReasoning(raw.say)), LIMITS.saySentences), LIMITS.sayChars);
  if (!say) throw new Error("empty_say");

  const seen = new Set<string>();
  const remember: BrainActions["remember"] = [];
  for (const item of raw.remember) {
    const r = RememberItem.safeParse(item);
    if (!r.success) continue;
    const content = clip(oneLine(r.data.content), LIMITS.memoryChars);
    if (!content || seen.has(content.toLowerCase())) continue;
    seen.add(content.toLowerCase());
    remember.push(r.data.private === undefined ? { type: r.data.type, content } : { type: r.data.type, content, private: r.data.private });
    if (remember.length === LIMITS.rememberItems) break;
  }

  const send = clip(oneLine(raw.send_to_priya ?? ""), LIMITS.sendChars);
  const concern = (raw.concern ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return BrainActions.parse({
    say,
    remember,
    send_to_priya: EMPTY_VALUE.test(send) ? undefined : send,
    concern: (CONCERNS as readonly string[]).includes(concern) && concern !== "none" ? concern : undefined,
  });
}

// Models sometimes wrap the arguments ({"respond": {...}}, {"name": ..., "arguments": "{...}"}).
function findArgs(v: unknown, depth = 0): Record<string, unknown> | undefined {
  const obj = maybeJson(v);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return undefined;
  const rec = obj as Record<string, unknown>;
  if (typeof rec.say === "string") return rec;
  if (depth >= 2) return undefined;
  for (const inner of Object.values(rec)) {
    const found = findArgs(inner, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export function parseJsonText(text: string): Record<string, unknown> | undefined {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  const candidates = [t];
  const open = t.indexOf("{");
  const close = t.lastIndexOf("}");
  if (open >= 0 && close > open) candidates.push(t.slice(open, close + 1));
  for (const c of candidates) {
    try {
      const found = findArgs(JSON.parse(c));
      if (found) return found;
    } catch {
      // not JSON; try the next candidate
    }
  }
  return undefined;
}

export function parseResponse(out: ConverseCommandOutput): BrainActions {
  const blocks: ContentBlock[] = out.output?.message?.content ?? [];
  const toolUses = blocks.flatMap((b) => (b.toolUse ? [b.toolUse] : []));
  const toolUse = toolUses.find((t) => t.name === "respond") ?? toolUses[0];
  if (toolUse) return normalizeActions(findArgs(toolUse.input) ?? toolUse.input);

  // Some models ignore toolChoice and answer in text: accept JSON, else treat the text as speech.
  const text = stripReasoning(blocks.map((b) => b.text ?? "").join("\n")).trim();
  // A reasoning model that ran out of tokens returns only reasoningContent: say so ("max_tokens").
  if (!text) throw new Error(`empty_response${out.stopReason ? `:${out.stopReason}` : ""}`);
  return normalizeActions(parseJsonText(text) ?? { say: text, remember: [] });
}

export function buildUserMessage(input: Omit<BrainInput, "persona">) {
  const turns = input.turns
    .slice(-LIMITS.turns)
    .map((t) => `${t.speaker === "elder" ? "Elder" : "You"}: ${clip(oneLine(t.text), LIMITS.turnChars)}`)
    .join("\n");
  return [
    "## Context",
    clip(input.context.trim(), LIMITS.contextChars) || "(none)",
    "",
    "## Recent conversation",
    turns || "(this is the start of the conversation)",
    "",
    "## The elder just said",
    clip(oneLine(input.elderText), LIMITS.elderChars),
    "",
    "Reply by calling the respond tool. If you cannot call tools, reply with only a JSON object with the fields say, remember, send_to_priya and concern.",
  ].join("\n");
}

// gpt-oss is a reasoning model: its reasoning tokens count against maxTokens, so 300 can run out
// before it calls respond. It gets a larger budget and low effort. Nova rejects reasoning_effort
// with a ValidationException, so that field goes only to gpt-oss.
export function inferenceFor(modelId: string): Pick<ConverseCommandInput, "inferenceConfig" | "additionalModelRequestFields"> {
  if (/(?:^|\.)openai\.gpt-oss/.test(modelId)) {
    return { inferenceConfig: { maxTokens: 1000, temperature: 0.4 }, additionalModelRequestFields: { reasoning_effort: "low" } };
  }
  return { inferenceConfig: { maxTokens: 300, temperature: 0.4 } };
}

// Models that rejected toolChoice once are called without it from then on (per warm process).
const noToolChoice = new Set<string>();

function isToolChoiceUnsupported(err: unknown) {
  const e = err as { name?: string; message?: string };
  return e?.name === "ValidationException" && /tool.?choice/i.test(e.message ?? "");
}

export async function converse(client: BedrockRuntimeClient, input: ConverseCommandInput, timeoutMs: number) {
  const ac = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  // The race guarantees the deadline even if a client ignores the abort signal.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Reject first so the race reports the timeout rather than the abort it causes.
      reject(new Error(`timeout_${timeoutMs}ms`));
      ac.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([client.send(new ConverseCommand(input), { abortSignal: ac.signal }), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function think(input: BrainInput, opts: ThinkOptions = {}): Promise<BrainResult> {
  const t0 = performance.now();
  const client = opts.client ?? defaultClient();
  const timeoutMs = opts.timeoutMs ?? 6000;
  const modelIds = (opts.modelIds ?? defaultModelIds()).filter(Boolean);
  const userText = buildUserMessage(input);
  const attempts: { modelId: string; error: string }[] = [];

  for (const modelId of modelIds) {
    const request = (withChoice: boolean): ConverseCommandInput => ({
      modelId,
      system: [{ text: input.persona }],
      messages: [{ role: "user", content: [{ text: userText }] }],
      toolConfig: { tools: [RESPOND_TOOL], ...(withChoice ? { toolChoice: { tool: { name: "respond" } } } : {}) },
      ...inferenceFor(modelId),
    });
    try {
      let out: ConverseCommandOutput;
      try {
        out = await converse(client, request(!noToolChoice.has(modelId)), timeoutMs);
      } catch (err) {
        if (!isToolChoiceUnsupported(err) || noToolChoice.has(modelId)) throw err;
        noToolChoice.add(modelId);
        out = await converse(client, request(false), timeoutMs);
      }
      const actions = parseResponse(out);
      return { ...actions, modelId, latencyMs: Math.round(performance.now() - t0) };
    } catch (err) {
      attempts.push({ modelId, error: errorText(err) });
    }
  }
  throw new BrainUnavailableError(attempts);
}

function errorText(err: unknown) {
  const e = err as { name?: string; message?: string };
  const msg = `${e?.name && e.name !== "Error" ? `${e.name}: ` : ""}${e?.message ?? String(err)}`;
  return msg.slice(0, 200);
}

// Test hook: forget which models rejected toolChoice.
export function resetModelQuirks() {
  noToolChoice.clear();
}
