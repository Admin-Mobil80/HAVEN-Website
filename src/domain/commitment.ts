import type { DeferTopic } from "./types.js";
import { normalize } from "./safety.js";

// Defer, don't decide: a request aimed at the child ("Will you come for Diwali?") becomes a deferral
// for the real child instead of an answer from Digital Priya. It fires only when the sentence is
// addressed to the child (you / aap / tum / the child's name, or a second-person Hindi verb) AND
// carries a commitment verb, so narration ("Priya came last year") and ordinary requests
// ("can you play a song") pass through to the brain.

export type Commitment = { topic: DeferTopic; question: string };

const MAX_QUESTION = 200;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function buildRules(childName: string): [DeferTopic, RegExp][] {
  const name = normalize(childName);
  const who = `(?:you|u|aap|tum|tu${name ? `|${escape(name)}` : ""})`;
  const adv =
    "(?: (?:please|really|ever|still|also|even|definitely|surely|maybe|at least|not|be able to|manage to|try to|going to|gonna|planning to|plan to|want to|like to|able to|promise to))*";
  // "do you" only counts with intent ("do you want to come"), so "do you visit the temple?" stays out.
  const ask = `(?:(?:will|would|can|could|wont|cant|shall|are|arent|r|is) ${who}${adv}|(?:do|dont) ${who}(?: (?:really|still|not))* (?:want|plan|intend|promise|have time) to)`;
  const tell = `(?:youll|youre|${who} (?:will|are|r|shall|must|should|have to|need to|better))${adv}`;
  const lead = "(?<=^ )(?:(?:" + (name ? `${escape(name)}|` : "") + "beta|beti|bitiya|achha|accha|arre|oh|ok|okay|so|and|amma|ji|dear) )*(?:please |pls |do )?";

  // "make it" only as a visit ("make it for Diwali"), not "make it louder".
  const visitVerb =
    "(?:come(?! up)|coming(?! down with| up| across)|visit|visiting|be (?:here|home|there|back|with me|with us|coming|visiting)|fly (?:down|home|in)|make it(?= for| to| home| this| next| on| by| $)|drop by)";
  const moneyWord = "(?:money|rupees|rs|cash|paisa|paise|amount|funds|lakhs?|thousand)";
  const moneyVerb = `(?:(?:send|give|lend|deposit)(?: [\\p{L}\\p{N}]+)*? ${moneyWord}|transfer(?! the call)|pay(?! attention)|paytm|gpay)`;
  // Assistant commands are not plans: "bring the volume down", "book a reminder", "get me the news".
  const plansVerb =
    "(?:buy|purchase|bring(?! up| down| back| the volume)|book(?! a reminder| an? alarm| a timer)|get me(?! the (?:news|weather|time|score|song))|take me(?! through| back to the))";

  const visit = [
    `${ask} ${visitVerb}`,
    `${tell} ${visitVerb}`,
    // "come on, tell me a story", "come here and listen", "come let us sing" are not visit requests.
    `${lead}(?:come(?! up| on| here and| let| lets| and (?:listen|sit|look|sing)| tell)|visit (?:me|us)|come home|come back)`,
    // "le aaogi" is "will you bring", which belongs to plans.
    "(?<! le | la )(?:aaogi|aaoge|aogi|aoge|aayogi|aa (?:rahi|rahe|rhi|rhe) ho|aa jaogi|aa jaoge|aa jao|aa jaao|zaroor aana|aana zaroor|aa jaiye|aaiye)",
    "(?<! ले )(?:आओगी|आओगे|आ रही हो|आ रहे हो|आ जाओ|आ जाओगी|आ जाओगे|जरूर आना|आइए)",
    ...(name ? [`${escape(name)} (?:kab |bhi |zaroor )?(?:aayegi|aayega|aaegi|aaega|aa rahi hai|aa raha hai)`] : []),
  ];
  const money = [
    `${ask} ${moneyVerb}`,
    `${tell} ${moneyVerb}`,
    `${lead}(?:send|give|lend|transfer)(?: me| us)?(?: some)? ${moneyWord}`,
    `${lead}pay (?:the|my|for)`,
    "(?:paise|paisa|pese|rupaye|rupay|rupees|money)(?: [\\p{L}\\p{N}]+)? (?:bhejo|bhejna|bhejogi|bhejoge|bhej do|bhej dogi|bhej doge|bhej dena|de do|dedo|dogi|doge|de dena|chahiye)",
    "(?:पैसे|पैसा|रुपये)(?: [\\p{L}\\p{M}\\p{N}]+)? (?:भेजो|भेजोगी|भेजोगे|भेज दो|भेज दोगी|दे दो|दोगी|दोगे|चाहिए)",
  ];
  const plans = [
    `${ask} ${plansVerb}`,
    `${tell} ${plansVerb}`,
    "(?:can|could|will|shall|should) we (?:please |really |ever |also )*(?:go|travel|take a trip)",
    "(?:le aaogi|le aaoge|le aana|laogi|laoge|la dogi|la doge|kharid dogi|kharid doge|khareed dogi|khareed doge|dila dogi|dila doge|book kar dogi|book kar doge|book karogi|book karoge|le chalogi|le chaloge|chalogi|chaloge)",
    "(?:ले आओगी|ले आओगे|लाओगी|लाओगे|ला दोगी|खरीद दोगी|दिला दोगी|ले चलोगी|ले चलोगे|चलोगी|चलोगे)",
  ];
  const promise = [
    "promise me",
    `(?:do|will|can|would|wont) ${who} promise`,
    `${who} promised?`,
    `(?<!i )promise (?:that )?(?:you|u)`,
    "pakka promise",
    "(?:vaada|vada|wada|wadaa|promise) (?:karo|karogi|karoge|kijiye)",
    "वादा (?:करो|करोगी|करोगे)",
  ];
  const compile = (alts: string[]) => new RegExp(`(?<= )(?:${alts.join("|")})(?= )`, "u");
  return [
    ["visit", compile(visit)],
    ["money", compile(money)],
    ["plans", compile(plans)],
    ["promise", compile(promise)],
  ];
}

const cache = new Map<string, [DeferTopic, RegExp][]>();
function rulesFor(childName: string) {
  let rules = cache.get(childName);
  if (!rules) {
    rules = buildRules(childName);
    if (cache.size > 50) cache.clear();
    cache.set(childName, rules);
  }
  return rules;
}

function clean(sentence: string) {
  const s = sentence.replace(/\s+/g, " ").trim();
  return s.length <= MAX_QUESTION ? s : `${s.slice(0, MAX_QUESTION - 3).trimEnd()}...`;
}

export function detectCommitment(text: string, childName = ""): Commitment | null {
  const rules = rulesFor(childName);
  for (const sentence of text.match(/[^.!?।\n]+[.!?।]*/g) ?? []) {
    const padded = ` ${normalize(sentence)} `;
    if (padded.length <= 2) continue;
    for (const [topic, re] of rules) {
      if (re.test(padded)) return { topic, question: clean(sentence) };
    }
  }
  return null;
}
