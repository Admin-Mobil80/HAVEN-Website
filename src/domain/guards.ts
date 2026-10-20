import { normalize } from "./safety.js";

// Last check on what Digital Priya is about to say. The persona prompt already forbids these, but a
// model can still slip, so the rewrite is deterministic: no promises on the child's behalf, no claim
// to be human or the real child, no medicine advice, no claim that emergency services were called.
// Words the real family recorded (attribution "real_family_member") are relayed untouched.

export type GuardOptions = { childName: string; calledBy: string; emergency?: string; attribution?: "real_family_member" };
export type GuardResult = { text: string; rewritten: boolean; reason?: string };

type Reason = "human_claim" | "emergency_claim" | "medication_advice" | "commitment";

const set = (words: string) => new Set(words.split(" "));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const compile = (alts: string[]) => new RegExp(`(?<= )(?:${alts.join("|")})(?= )`, "u");

// Expand contractions first so "I'll" never collides with "ill" and "I'm" reads as "i am".
function prepare(sentence: string) {
  const s = sentence
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bcan't\b/g, "can not")
    .replace(/n't\b/g, " not")
    .replace(/\bi'm\b/g, "i am")
    .replace(/'ll\b/g, " will")
    .replace(/'re\b/g, " are")
    .replace(/'ve\b/g, " have")
    .replace(/\b(i|we|you)'d\b/g, "$1 would")
    .replace(/\b(it|that|this)'s\b/g, "$1 is");
  return ` ${normalize(s)} `;
}

const MEDS = "(?:tablets?|medicines?|medications?|meds|pills?|doses?|dosage|insulin|drugs?|goli|goliyan|dawai|dawa)";
const DRUG_NAMES = "(?:paracetamol|crocin|dolo|aspirin|ibuprofen|painkillers?|antibiotics?|disprin|combiflam|antacids?|cough syrup|sleeping pills?)";
// Common prescriptions for older Indian patients; "stop metformin" is as dangerous as "stop your tablets".
const RX_NAMES = "(?:metformin|amlodipine|telmisartan|atorvastatin|ecosprin|thyronorm|glimepiride|losartan)";
const ANY_MED = `(?:${MEDS}|${DRUG_NAMES}|${RX_NAMES})`;
const MED_RE = compile([
  `(?<!do not |never )(?:stop|skip|increase|reduce|double|halve|lower|raise|change|adjust|cut down on|cut back on|cut)(?: taking| having)?(?: \\p{L}+){0,2} ${ANY_MED}`,
  `(?:take|have)(?: an?)? (?:extra|another|more|less|double|half|two|three|one more)(?: \\p{L}+){0,2} ${MEDS}`,
  `(?:take|have)(?: \\p{L}+){0,2} ${MEDS} (?:twice|thrice)`,
  `(?:do not|never) take(?: \\p{L}+){0,2} ${MEDS}`,
  // Telling her she can go without: "No need to take your tablets today", "It's okay to miss one dose".
  `no need to (?:take|have)(?: \\p{L}+){0,2} ${ANY_MED}`,
  `(?:you )?do not need (?:to (?:take|have) )?(?:your |the |any )?(?:\\p{L}+ )?${ANY_MED}`,
  `(?:okay|ok|fine|alright|safe) to (?:skip|miss|stop|leave)(?: \\p{L}+){0,2} ${ANY_MED}`,
  `(?:skipping|missing|stopping)(?: \\p{L}+){0,2} ${ANY_MED}(?: is)? (?:fine|okay|ok|alright)`,
  `(?:take|have|try)(?: (?:a|an|some|one|two))? ${DRUG_NAMES}`,
  `(?:take|have|inject|use|put)(?: \\p{L}+){0,2} \\p{N}+ units?`,
  `(?:dawai|dawa|goli|tablet|medicine)(?: \\p{L}+)? (?:band kar do|band karo|chhod do|mat lo|mat khao|kam kar do|kam karo|badha do|double kar do|skip kar do|(?:aadhi|aadha|adhi|adha|half) (?:kar do|karo|kar lo))`,
  "(?:do|teen|ek aur|extra) (?:goli|goliyan|tablet|tablets) (?:le lo|lo|kha lo|khao)",
  `(?:ek|do|aadhi) ${DRUG_NAMES} (?:le lo|lo|kha lo|khao)`,
  "(?:दवाई|दवा|गोली)(?: [\\p{L}\\p{M}]+)? (?:बंद कर दो|बंद करो|छोड दो|मत लो|मत खाओ|कम कर दो|बढा दो)",
]);

const EMERGENCY_CLAIM_RE = compile([
  "(?:i|we) (?:have |already |just )*(?:called|contacted|phoned|alerted|informed|rung) (?:an? |the )?(?:ambulance|112|108|911|emergency services|emergency|police|hospital)",
  "(?:the |an )?(?:ambulance|police|paramedics|help) (?:is|are) (?:on (?:the|its|their) way|coming)",
  // Passive, third-person and Hindi forms: "The ambulance has been called", "Maine ambulance bula li hai".
  "(?:the |an )?(?:ambulance|police|paramedics|help|emergency services|112|108) (?:has|have) been (?:called|contacted|informed|sent|alerted)",
  "(?:i|we) (?:have |already |just )*(?:sent|called for) help",
  "(?:someone|somebody) (?:is|are) (?:on (?:the|their|his|her) way|coming to help)",
  "(?:the )?doctor is on (?:the|his|her) way",
  "(?:maine|hamne) (?:ambulance|112|108|police)(?: \\p{L}+){0,2} (?:bula|call kar|phone kar)",
  "(?:ambulance|madad) (?:aa rahi|aa raha|aane wali)",
]);

function humanClaimRe(name: string) {
  const n = escape(name);
  return compile([
    "i am not (?:an? )?(?:ai|bot|robot|computer|machine|program|chatbot|artificial|digital|virtual|avatar)",
    `i am (?:the )?real ${n}`,
    `i am really ${n}`,
    `(?:this|it) is (?:really |actually )?the real ${n}`,
    "it is (?:really|actually|truly) me",
    "it is the real me",
    "i am (?:a )?(?:real )?(?:person|human|human being)",
    "i am real(?= $| \\p{L}+ $)",
    // Claiming to be the real child: "It's me, Priya!", "I'm your daughter", "Main Priya hoon".
    // "I'm Digital Priya" and "This is Priya's song" (normalised to "priyas") do not match.
    `(?:it is(?: me)?|this is|i am)(?: your)? ${n}(?= )`,
    "i am your (?:daughter|son|beti|beta|child|bitiya)",
    `(?:main|mai) (?:aapki |tumhari )?(?:${n}|beti|beta) (?:hoon|hun|hu)`,
    "(?:main|mai) hi (?:hoon|hun|hu)",
    `main (?:ai|robot) ${"(?:nahi|nahin|nhi)"} (?:hoon|hun|hu)`,
    `main (?:sach mein |asli )(?:${n} )?(?:hoon|hun|hu)`,
    "मैं असली",
    "मैं (?:एआई|रोबोट) नहीं",
  ]);
}

const MARKER_RE =
  /(?<= )(?:i will|i shall|i am going to|i am gonna|i would (?:love|like) to|i promise|we will|we shall|we are going to|we promise|i can|we can)(?= )/gu;
const PROGRESSIVE_RE =
  /(?<= )(?:i am|we are) (?:definitely |surely |really |also )?(?:coming|visiting|flying|sending|bringing|buying|booking|paying|transferring|driving|travelling|traveling)(?= )/u;
const HINDI_COMMIT_RE = compile([
  "(?:aa|bhej|le aa|la|kharid|book kar|transfer kar|pay kar) (?:rahi|raha|rhi|rha) (?:hoon|hun|hu)",
  "(?:bhej|de|le aa|kharid) (?:deti|deta) (?:hoon|hun|hu)",
  "(?:आ|भेज|ले आ) (?:रही|रहा) हूं",
  "(?:aaungi|aaunga|aaoongi|aaoonga|aungi|aunga|aa jaungi|aa jaunga|aayenge|aaenge|bhej dungi|bhej dunga|bhejungi|bhejunga|bhej denge|de dungi|de dunga|de denge|le aaungi|le aaunga|laungi|launga|kharid dungi|kharid dunga|khareed dungi|book kar dungi|book kar dunga|book karungi|pay kar dungi|transfer kar dungi)",
  "(?:promise|vaada|vada|wada) (?:karti|karta) (?:hoon|hun|hu)",
  "(?:आऊंगी|आऊंगा|आ जाऊंगी|आ जाऊंगा|आएंगे|भेज दूंगी|भेज दूंगा|भेजूंगी|भेजूंगा|दे दूंगी|दे दूंगा|ले आऊंगी|लाऊंगी|लाऊंगा|खरीद दूंगी|बुक कर दूंगी)",
  "वादा (?:करती|करता) हूं",
]);

const FILLER = set("definitely surely certainly really also just totally absolutely of course try to make sure so then both all soon");
const PROMISE_SKIP = set("you that i we will shall am are going");
const COMMIT_VERBS = set(
  "come coming visit visiting send sending pay paying buy buying bring bringing book booking transfer transferring fly flying drive driving travel travelling traveling reach arrive",
);
const BE_COMMIT = set("there home back with visiting coming flying");
const TAKE_YOU = set("to for");
const GET_YOU = set("a an some new");
const HARMLESS = set(
  "ask remind let tell check pass note remember keep find look think play sing read listen talk be stay wait share mention write save sit hum chat explain help",
);
const DATE_RE =
  / (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|this evening|weekend|next (?:week|month|year)|january|february|march|april|may|june|july|august|september|october|november|december|\p{N}{1,2}(?:st|nd|rd|th)|diwali|deepavali|holi|pongal|onam|eid|christmas|dussehra|dasara|navratri|rakhi|sankranti|ugadi|new year) /u;

// Reading her own message back before record_reply sends it ("I'll send it to Priya", "I'm sending
// your voice note to Priya") is the consent flow, not a promise made on the child's behalf.
function relayToChild(s: string, name: string) {
  const n = escape(name);
  return new RegExp(
    `(?<= )(?:(?:it|this|that|your (?:message|words|note|voice note|reply)|a message) (?:to ${n}|to her)|${n} a message)(?= )`,
    "u",
  ).test(s);
}

const SEND_VERBS = set("send sending");
const ABILITY = new Set(["i can", "we can"]);

function makesCommitment(s: string, childName: string) {
  const relay = relayToChild(s, childName);
  const progressive = PROGRESSIVE_RE.exec(s);
  if (progressive && !(relay && progressive[0].endsWith(" sending"))) return true;
  if (HINDI_COMMIT_RE.test(s)) return true;
  const toks = s.trim().split(" ");
  for (const m of s.matchAll(MARKER_RE)) {
    let i = (s.slice(0, m.index).match(/ /g)?.length ?? 1) - 1 + m[0].split(" ").length;
    const promise = m[0].endsWith("promise");
    while (i < toks.length && (FILLER.has(toks[i]) || (promise && PROMISE_SKIP.has(toks[i])))) i++;
    const verb = toks[i];
    if (verb === undefined) {
      if (promise) return true;
      continue;
    }
    if (SEND_VERBS.has(verb) && relay) continue;
    // "I can" only counts with a commitment verb: "I can come next month", not "I can play a song".
    if (ABILITY.has(m[0])) {
      if (COMMIT_VERBS.has(verb)) return true;
      continue;
    }
    // Only the first verb counts: "I'll ask her if she can come" is a harmless "ask".
    if (verb === "be") {
      if (BE_COMMIT.has(toks[i + 1])) return true;
      continue;
    }
    if (COMMIT_VERBS.has(verb)) return true;
    // "I'll take you to Tirupati", "I'll get you a new phone".
    if (verb === "take" && toks[i + 1] === "you" && TAKE_YOU.has(toks[i + 2])) return true;
    if (verb === "get" && toks[i + 1] === "you" && GET_YOU.has(toks[i + 2])) return true;
    if (HARMLESS.has(verb)) continue;
    if (promise || DATE_RE.test(s)) return true;
  }
  return false;
}

function lines(o: GuardOptions): Record<Reason, string> {
  return {
    human_claim: `I'm Digital ${o.childName}, an AI version of ${o.childName}. The real ${o.childName} reads a summary every evening.`,
    emergency_claim: `I can't call emergency services myself, ${o.calledBy}. If you are in danger, please call ${o.emergency ?? "112"} now.`,
    medication_advice: `I can't advise on medicines, ${o.calledBy}. Please check with your doctor; I'll let ${o.childName} know.`,
    commitment: `That one's for the real ${o.childName}, ${o.calledBy}. I can't promise that, but I'll ask ${o.childName} tonight.`,
  };
}

export function guardReply(text: string, opts: GuardOptions): GuardResult {
  if (opts.attribution === "real_family_member") return { text, rewritten: false };
  const child = normalize(opts.childName);
  const humanRe = humanClaimRe(child);
  const out: string[] = [];
  const reasons: Reason[] = [];
  for (const sentence of text.match(/[^.!?।]+(?:[.!?।]+|$)\s*/g) ?? []) {
    const s = prepare(sentence);
    const reason: Reason | undefined = humanRe.test(s)
      ? "human_claim"
      : EMERGENCY_CLAIM_RE.test(s)
        ? "emergency_claim"
        : MED_RE.test(s)
          ? "medication_advice"
          : makesCommitment(s, child)
            ? "commitment"
            : undefined;
    if (!reason) {
      out.push(sentence.trim());
      continue;
    }
    if (!reasons.includes(reason)) {
      reasons.push(reason);
      out.push(lines(opts)[reason]);
    }
  }
  if (!reasons.length) return { text, rewritten: false };
  return { text: out.filter(Boolean).join(" "), rewritten: true, reason: reasons.join(",") };
}
