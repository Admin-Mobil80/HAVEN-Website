import type { Household } from "../domain/types.js";
import type { BrainResult, Concern } from "./brain.js";

// Deterministic stand-in for the LLM: used when Bedrock is unavailable, over the daily cap, or
// switched off (HAVEN_BRAIN=rules, the no-keys local demo). Same output shape as think(), so the
// rest of the turn pipeline (guard, consent, MCP tools) is identical. Templates only: it never
// invents facts about the family and never gives advice.

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();

const CONCERNS: [RegExp, Concern, string][] = [
  [/\b(didn'?t|did not|haven'?t|have not|not) (eat|eaten|had (my )?(food|lunch|dinner|breakfast))\b|\bnot hungry\b|khana nahi/, "not_eating", "Please try to eat a little something, {calledBy}. Shall I tell {child}?"],
  [/\b(couldn'?t|could not|can'?t|cannot|didn'?t) sleep\b|\bno sleep\b|kept waking|neend nahi/, "poor_sleep", "Oh no, a bad night. Maybe a short rest this afternoon, {calledBy}?"],
  [/\b(lonely|alone|nobody (visits|comes|talks)|no one (visits|comes|talks)|akel[ia])\b/, "lonely", "I'm here with you, {calledBy}. And {child} will love to hear your voice when she calls."],
  [/\b(sad|low|upset|crying|udaas)\b/, "low_mood", "I'm sorry you feel low today, {calledBy}. Do you want to tell me about it?"],
  [/\b(pain|hurts|aching|dard)\b/, "pain", "I'm sorry it hurts, {calledBy}. Please tell your doctor about the pain, and I'll let {child} know."],
];

const TELL_CHILD = (child: string) =>
  new RegExp(String.raw`^(?:please |can you |could you )?(?:tell|let|ask|message|inform) (?:${child}|her|my daughter|beti)(?: know)?(?: that)?[ ,:]+(.{3,200})$`, "i");

const GREETING = /^(hi|hello|hey|namaste|namaskara|good (morning|afternoon|evening))\b/;
const BYE = /\b(bye|good night|goodnight|talk later|that'?s all|see you)\b/;
const THANKS = /\b(thank|thanks|dhanyavaad|shukriya)\b/;

export function rulesBrain(doc: Household, elderText: string): BrainResult {
  const started = Date.now();
  const child = doc.members.find((m) => m.id === doc.persona.childMemberId)?.name ?? "your family";
  const calledBy = doc.elder.calledBy;
  const fill = (t: string) => t.replaceAll("{calledBy}", calledBy).replaceAll("{child}", child);
  const s = norm(elderText);
  const out = (say: string, extra: Partial<BrainResult> = {}): BrainResult => ({
    say: fill(say),
    remember: [],
    modelId: "rules",
    latencyMs: Date.now() - started,
    ...extra,
  });

  const tell = elderText.trim().match(TELL_CHILD(child.toLowerCase()));
  if (tell) return out("Of course.", { send_to_priya: tell[1].trim().replace(/[.!]+$/, "") });

  for (const [re, concern, say] of CONCERNS) if (re.test(s)) return out(say, { concern });

  if (BYE.test(s)) return out("Bye {calledBy}, take care. Talk to you soon!");
  if (THANKS.test(s)) return out("Anytime, {calledBy}. I like our chats.");
  if (GREETING.test(s)) return out("Hello {calledBy}! How are you feeling today?");

  if (/\?$/.test(elderText.trim())) return out("Hmm, that's a good question, {calledBy}. I'll ask {child} and tell you.");
  // Steer towards something she loves (from Priya's style card), rotating so it does not repeat.
  const topics = doc.persona.style.topicsSheLoves;
  const topic = topics.length ? topics[doc.turns.length % topics.length].split(" (")[0] : undefined;
  return out(topic ? `Achha, {calledBy}. And tell me, how is ${topic} these days?` : "Achha, {calledBy}. Tell me more.");
}
