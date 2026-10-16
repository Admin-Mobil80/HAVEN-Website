import type { EscalationReason } from "./types.js";

// Deterministic safety rules for elder speech. No LLM is involved, so a hit can open an incident
// and alert the family even when Bedrock is slow or down. Pure and fast (well under 5 ms).

export type SafetyLevel = "emergency" | "urgent" | "important" | "none";
export type Classification = { level: SafetyLevel; reason: EscalationReason | null; matched?: string };

// Lowercase, NFKC, drop apostrophes ("can't" -> "cant"), keep Devanagari letters and vowel signs,
// fold chandrabindu into anusvara and drop the nukta so one spelling of each Hindi word suffices.
export function normalize(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/['‘’ʼ`]/g, "")
    .replace(/ँ/g, "ं")
    .replace(/़/g, "")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Punctuation ends a clause, so "No, I fell" keeps the "no" away from "I fell".
export function clauses(text: string) {
  return text
    .split(/[.,!?;:।॥\n]+/)
    .map(normalize)
    .filter(Boolean);
}

type NegMode = "all" | "verbal" | "none";
type MatchCtx = {
  toks: string[];
  start: number; // index of the first matched token
  end: number; // index just past the last matched token
  padded: string; // " <clause> "
  index: number; // character offset of the match in padded
  match: string;
  names: ReadonlySet<string>;
};
type Rule = {
  level: Exclude<SafetyLevel, "none">;
  reason: EscalationReason;
  re: RegExp;
  neg: NegMode; // "none" for triggers that are negative already ("can't breathe") or start with "I"
  follow?: ReadonlySet<string>; // next token must be end of clause, one of these, or a household name
  past?: boolean; // a distant-past marker in the same part of the clause downgrades it to important
  name?: boolean; // group 1 must be a family word or one of the household's names
  check?: (c: MatchCtx) => boolean; // extra condition; false skips this match
};

const rule = (level: Rule["level"], reason: EscalationReason, alts: string[], opts: Partial<Rule> = {}): Rule => ({
  level,
  reason,
  re: new RegExp(`(?<= )(?:${alts.join("|")})(?= )`, "gu"),
  neg: "all",
  ...opts,
});

const set = (words: string) => new Set(words.split(" "));

const NAHI = "(?:nahi|nahin|nhi|nai|nahee)";
const RAHI = "(?:rahi|raha|rahe|rhi|rha)";
const CANT = "(?:cant|cannot|can not|unable to|could not|couldnt|not able to)";
const MEDS = "(?:tablets?|medicines?|medications?|meds|pills?|doses?|insulin|goli|dawai|dawa)";

// "help" counts as an emergency only when nothing task-like follows it ("help me remember" is not).
const HELP_FOLLOW = set(
  "please pls plz now right immediately asap quick quickly fast urgently jaldi someone somebody anyone anybody i im ive my its it help me us amma beta beti ji koi oh god mummy papa",
);
// A bare "help" in mid-clause counts after a cry or a name: "oh no help", "ayyo help", "Priya help".
const INTERJECTIONS = set(
  "oh ayyo aiyo aiyyo ayyayyo ayyayo aiyayo arre arey hey alexa amma appa god ram bhagwan haaye haay hai please pls plz here",
);
const TASK_CONTEXT = set("mein me isme ismein isko iske में इसमें");
const FAMILY = set("daughter son beti beta bitiya children kids family grandson granddaughter mummy papa बेटी बेटा बेटे");

// Things that "gir gaya" (fell) in everyday kitchen talk, not a person falling.
const OBJECTS = set(
  "phone mobile glass cup plate chashma remote bartan pen chabi chaabi kitab chai doodh paani pani dawai dawa goli roti sabzi katori dabba dupatta chappal ped market sensex " +
    "फोन गिलास चश्मा कप प्लेट रिमोट दूध पानी चाय दवाई",
);
const FIRST_PERSON = set("main mai मैं hum ham हम");
const LOCATIVE = set("mein me में pe par पर se से neeche niche नीचे achanak अचानक kaise कैसे wahan wahin yahan वहां यहां");
const PERSON = set("appa papa pitaji pati patiji dadaji nanaji ji");
const MASCULINE = set("gaya gya gaye pada padaa गया गए पडा");

// "gir gayi" is a fall only when a person fell: no object just before it, and the masculine forms
// (which Amma would not use about herself) need a subject or place: "main seedhi se gir gaya".
function personFell({ toks, start, end }: MatchCtx) {
  for (let i = start - 1; i >= Math.max(0, start - 3); i--) {
    if (FIRST_PERSON.has(toks[i])) break;
    if (OBJECTS.has(toks[i])) return false;
  }
  if (!MASCULINE.has(toks[end - 1]) || start === 0) return true;
  const prev = toks[start - 1];
  if (LOCATIVE.has(prev) || PERSON.has(prev)) return true;
  return toks.slice(0, start).some((t) => FIRST_PERSON.has(t));
}

function afterCryOrName({ toks, start, names }: MatchCtx) {
  if (start === 0) return false; // the clause-start form is its own rule
  const prev = toks[start - 1];
  if (INTERJECTIONS.has(prev) || names.has(prev)) return true;
  return prev === "no" && start >= 2 && INTERJECTIONS.has(toks[start - 2]); // "oh no help"
}

// "my husband died of a heart attack" is a memory about someone else, not her chest.
const DIED_BEFORE = /(?:died|dead|passed away|death|guzar gaye|gujar gaye|expired) (?:of|from|due to|after|with|because of)(?: a| an| the)? $/u;
const DIED_AFTER = /^ (?:se|से) (?:guzar|gujar|chal bas|mar gay|गुजर|चल बस|मर ग)/u;
const notSomeoneElsesDeath = ({ padded, index, match }: MatchCtx) =>
  !DIED_BEFORE.test(padded.slice(0, index)) && !DIED_AFTER.test(padded.slice(index + match.length));

const NOT_I_NEED = set("you u they he she do does"); // "do you need help", "they need help"
const EAT_FOLLOW = set("anything since today all much lunch dinner breakfast food properly yet well for in");

const RULES: Rule[] = [
  // Emergency, most specific reason first so "Help, I fell" reports a fall.
  rule("emergency", "breathing", [
    `${CANT} breathe?`,
    `${CANT} catch my breath`,
    `saa?ns ${NAHI} (?:aa|a|le pa|le paa) ${RAHI}`,
    `सांस नहीं? (?:आ|ले पा) रह(?:ी|ा|े)`,
  ], { neg: "none", past: true }),
  rule("emergency", "breathing", [
    "(?:hard|difficult|difficulty|trouble|struggling) (?:in |to )?breath(?:e|ing)?",
    "breathing (?:problem|difficulty|trouble|is difficult|is hard)",
    "short of breath",
    "out of breath",
    "breathless(?:ness)?",
    "gasping",
    "choking",
    "dam ghut",
    "दम घुट",
    "saa?ns lene (?:mein|me|mai) (?:(?:bahut|bohot|bahot|thodi|thoda) )?(?:dikkat|takleef|taklif|pareshani)",
    "saa?ns (?:phool|ful|phul) (?:rahi|raha|rhi)",
    "सांस लेने में (?:(?:बहुत|थोडी) )?(?:तकलीफ|दिक्कत|परेशानी)",
    "सांस फूल",
  ], { past: true }),
  rule("emergency", "chest_pain", [
    "chest (?:is |feels )?(?:(?:very|really|so|too|a bit) )?(?:pain|pains|paining|hurts|hurting|tight|heavy|tightness|pressure)",
    "(?:pain|tightness|pressure|heaviness) in (?:my |the )?chest",
    "heart attack",
    "heart (?:is )?paining",
    "(?:seene|seena|sine|chhati|chati|chhaati|chaati|chest) (?:mein|me|mai|men) (?:(?:bahut|bohot|bahot|tez|tej|zyada|jyada|halka) )?(?:dard|pain|bharipan|jalan)",
    "dil ka daura",
    "(?:सीने|छाती) में (?:(?:बहुत|तेज|ज्यादा|हल्का) )?(?:दर्द|भारीपन)",
    "दिल का दौरा",
  ], { past: true, check: notSomeoneElsesDeath }),
  rule("emergency", "unconscious", [
    "fainted",
    "(?:feel|feeling|going to|about to|might|will) faint",
    "passed out",
    "blacked out",
    "lost consciousness",
    "unconscious",
    "behoshi?",
    "बेहोशी?",
  ], { past: true }),
  rule("emergency", "fall", [
    "i (?:(?:just|have|had|also) )*(?:fell|fallen)(?! asleep| in love| for )",
    "i \\p{L}+ and (?:fell|fallen)(?! asleep| in love| for )",
    "ive (?:just )?fallen",
    "i (?:had|took) a (?:bad )?fall",
    "i slipped",
    "i fall down",
    "(?:i am|im) (?:lying )?on the floor",
    // Speech-to-text often drops the "I": "fell down in the bathroom", "slipped in the bathroom".
    "(?<=^ )(?:just )?fell (?:down|in the|on the|off|from)(?! love)",
    "(?<=^ )slipped(?! my mind| out| away)",
    `${CANT} (?:get up|stand up|get off the floor)`,
    "help me (?:to )?(?:get up|stand up|get off the floor)",
    `(?:uth|utth|uthh) ${NAHI} (?:(?:pa|paa) ${RAHI}|sakti|sakta|sakte)`,
    "उठ नहीं? (?:पा रह(?:ी|ा|े)|सकती|सकता)",
  ], { neg: "none", past: true }),
  rule("emergency", "fall", ["help me (?:up|stand)", "need help (?:getting|to get) up"], { neg: "verbal", past: true }),
  rule("emergency", "fall", [
    "(?:gir|fisal|phisal) (?:gayi|gai|gyi|gayee|gaya|gya|gaye|padi|pada|padaa|padee)",
    "(?:गिर|फिसल) (?:गई|गयी|गया|गए|पडी|पडा)",
  ], { past: true, check: personFell }),
  rule("emergency", "help_phrase", [
    "(?<=^ )(?:please |pls |plz |oh |oh god |arre )?help(?: help)*(?: me| us)?(?: please| pls| plz)?",
    "(?:somebody|someone|anybody|anyone|koi|please|pls|plz) (?:please )?help(?: me| us)?(?: please)?",
    "help me(?: please)?",
  ], { neg: "verbal", follow: HELP_FOLLOW }),
  rule("emergency", "help_phrase", ["help(?: help)*(?: me| us)?(?: please| pls| plz)?"], {
    neg: "verbal",
    follow: HELP_FOLLOW,
    check: afterCryOrName,
  }),
  rule("emergency", "help_phrase", ["(?:i |we )?(?:need|want) (?:some )?help(?: please| now| quickly| urgently)?"], {
    neg: "verbal",
    follow: HELP_FOLLOW,
    check: ({ toks, start }) => start === 0 || !NOT_I_NEED.has(toks[start - 1]),
  }),
  rule("emergency", "help_phrase", [
    "(?:koi |mujhe |please )?(?:bachao|bachaao|bachaiye|bacha lo|bachalo)",
    "बचाओ",
    "बचाइए",
    "बचा लो",
    "call (?:an |the |a )?ambulance",
    "ambulance (?:bulao|bula do|mangao)",
    "एम्बुलेंस बुलाओ",
    "call (?:112|108|102|911)",
    "(?:it is|its|this is) an emergency",
    "emergency hai",
  ], { neg: "verbal" }),
  // A bare mention: "no ambulance" is a refusal, but "no no, call an ambulance" (above) is not.
  rule("emergency", "help_phrase", ["ambulance", "एम्बुलेंस", "एंबुलेंस"]),
  rule("emergency", "help_phrase", [
    "(?:meri |hamari )?(?:madad|madat|help) (?:karo|kijiye|kariye|kar do|chahiye)",
    "(?:मेरी )?मदद (?:करो|कीजिए|करिए|कर दो|चाहिए)",
  ], { neg: "verbal", check: ({ toks, start }) => start === 0 || !TASK_CONTEXT.has(toks[start - 1]) }),

  // Urgent.
  rule("urgent", "dizzy", [
    "dizzy",
    "dizziness",
    "light ?headed",
    "(?:head|room|everything) is spinning",
    "vertigo",
    // Not the errand idiom "mandir ka chakkar laga ke aayi" or "paise ke chakkar mein".
    "(?<! (?:ka|ke|का|के) )chakk?ar(?! (?:lag\\p{L}*|kaat\\p{L}*|kat|mein|me|mai|men)(?= ))",
    "(?<! (?:का|के) )चक्कर(?! (?:लग[\\p{L}\\p{M}]*|काट[\\p{L}\\p{M}]*|में)(?= ))",
    "(?:sir|sar) (?:ghoom|ghum|ghoomta|ghumta) (?:raha|rha|rahi|hai)",
    "सिर घूम",
  ], { past: true }),
  rule("urgent", "confused", [
    "(?:i )?(?:dont|do not) know where i am",
    `(?:i )?${CANT} remember where i am`,
    `(?:main )?(?:kahan|kaha|kahaan) (?:hoon|hun|hu)(?: main)?`,
    `mujhe kuch samajh ${NAHI} aa ${RAHI}`,
    "मैं कहां हूं",
    "कुछ समझ नहीं? आ रह(?:ा|ी)",
  ], { neg: "none" }),
  rule("urgent", "confused", ["where am i"], { neg: "none", follow: new Set() }),
  rule("urgent", "confused", ["confused(?! about)"]),
  // "scared of the dark" is a general fear, not a situation now.
  rule("urgent", "scared", [
    "(?:i am|im|i feel|i m) (?:so |very |really |too )?(?:scared|frightened|terrified)(?! of )",
    "(?:so|very|really) scared(?! of )",
  ], { neg: "none" }),
  rule("urgent", "scared", [`(?:dar|darr|dr) lag ${RAHI}`, `ghabrahat`, `ghabra ${RAHI}`, "डर लग रह(?:ा|ी|े)", "घबराहट", "घबरा रह(?:ा|ी)"]),
  rule("urgent", "wants_family", [
    "(?:i )?(?:want|need) my (?:daughter|son|beti|beta|children|kids|family)",
    "(?:call|get|bring) my (?:daughter|son|family) (?:now|right now|immediately|quickly)",
  ], { neg: "verbal" }),
  rule("urgent", "wants_family", [
    "(?:i )?(?:want|need) (?:to (?:talk|speak) to |to see )?(\\p{L}+) (?:now|right now|immediately|abhi)",
    "(?:call|get|bring) (\\p{L}+) (?:now|right now|immediately|quickly|abhi|jaldi)",
    "([\\p{L}\\p{M}]+) (?:ko|को) (?:abhi |अभी )?(?:bulao|bula do|phone karo|call karo|बुलाओ|बुला दो|फोन करो)",
  ], { neg: "verbal", name: true }),

  // Important.
  rule("important", "scared", ["(?:i am|im|i feel|i m) (?:so |very |really |too )?(?:scared|frightened|terrified) of"], { neg: "none" }),
  rule("important", "not_eating", [
    "(?:i )?(?:didnt|did not|havent|have not|hadnt|had not|couldnt|could not) (?:eat|eaten)",
  ], { neg: "none", follow: EAT_FOLLOW }),
  rule("important", "not_eating", [
    "not (?:been )?eating(?! out)",
    "(?:no|lost my|lost) appetite",
    "not hungry (?:since|for)",
    `(?:khana|khaana|kuch|kuchh) ${NAHI} (?:khaya|khaaya|khayi|khaayi|khai|kha payi|kha paayi|kha paya|kha pa rahi)`,
    `(?:bhookh|bhook|bhukh|bhuk) ${NAHI} (?:lag|lagti|lagi|lag rahi)`,
    "(?:खाना|कुछ) नहीं? खा(?:या|यी|ई)",
    "भूख नहीं? लग",
  ], { neg: "none" }),
  rule("important", "not_eating", ["skipped (?:my )?(?:lunch|dinner|breakfast|meals?)"]),
  rule("important", "missed_medicine", [`(?:forgot|forget|skipped|missed|skip|miss)(?: to take)?(?: my| the)?(?: \\p{L}+)? ${MEDS}`]),
  rule("important", "missed_medicine", [
    `(?:didnt|did not|havent|have not|hadnt) (?:take|taken|had)(?: my| the)?(?: \\p{L}+)? ${MEDS}`,
    `(?:dawai|dawaai|dawa|davai|dava|goli|goliyan|tablet|medicine)(?: \\p{L}+)? ${NAHI} (?:li|lee|liya|khayi|khaayi|khai)`,
    "(?:dawai|dawa|davai|dava|goli|tablet|medicine) (?:bhool|bhul) (?:gayi|gai|gyi|gaya|gya)",
    "(?:दवाई|दवा|गोली|गोलियां)(?: [\\p{L}\\p{M}]+)? नहीं? (?:ली|खाई|खायी|लिया)",
    "(?:दवाई|दवा|गोली) भूल (?:गई|गयी|गया)",
  ], { neg: "none" }),
  rule("important", "very_lonely", [
    "(?:so|very|really|too|terribly|extremely) (?:lonely|alone)",
    "all alone",
    "lonely all the time",
    "(?:bahut |bohot |bahot )?akel(?:a|i|ee)(?:pan)? (?:lag|mehsoos|feel)\\p{L}*",
    "akelapan",
    "akelepan",
    "अकेल(?:ा|ी) (?:लग|महसूस)[\\p{L}\\p{M}]*",
    "अकेलापन",
  ]),
  rule("important", "very_lonely", [
    "(?:nobody|no one|noone) (?:talks to|calls|visits|cares about|comes to see) me",
    "i have (?:nobody|no one)",
    `koi baat ${NAHI} karta`,
    "कोई बात नहीं? करता",
  ], { neg: "none" }),
];

const ALL_NEG = set("no not never dont didnt doesnt isnt wasnt arent havent hasnt nahi nahin nhi nai mat without नहीं नही मत");
const VERBAL_NEG = set("not never dont didnt doesnt mat मत");
const POST_NEG = set("nahi nahin nhi nai नहीं नही");
const POST_FILLER = set("to toh bilkul koi ab abhi bhi तो बिल्कुल कोई अब भी");
// "dard nahi ruk raha" is pain that will not stop, not "no pain".
const PERSIST = set("ruk ruka rukta rukti rukte रुक");
// Negation does not reach back past a new subject: in "no I feel dizzy" the "no" answers something else.
const BARRIER = set("i im ive we main मैं mujhe मुझे hum हम");
// Words that can sit between a negator and what it negates ("I don't have any chest pain").
// Anything else ends the reach, since unpunctuated speech runs clauses together:
// "pata nahi kaise gir gayi", "I don't know help me".
const BRIDGE = set(
  "call get send need want have has had feel feeling felt am is are was be been any a an the my really even so very too getting got having " +
    "koi bilkul more at all longer ab bhi abhi to toh ye yeh much that this",
);
// "never had chest pain like this" reports a symptom now; "I never feel dizzy" does not.
const NEVER_INTENSE_PREV = set("so such this");
const NEVER_INTENSE = / (?:like this|like that|this bad|so bad|this much|so much|before|itna|itni|aisa|aisi|aise) /u;

// A distant-past marker, checked only on the part of the clause that holds the match, so in
// "main chai bana rahi thi aur gir gayi" the earlier "thi" does not reach the fall.
const PAST =
  / (?:last (?:week|month|year|winter|summer|monsoon|diwali|time)|ago|(?:years?|months?) back|in (?:january|february|march|april|may|june|july|august|september|october|november|december)|in (?:19|20)\p{N}{2}|when i was (?:young|a child|a girl|little|small|younger)|as a child|pichl[ae] \p{L}+|pichhl[ae] \p{L}+|(?:saal|mahine|mahina|hafte) pehle|पिछले|साल पहले|महीने पहले) /u;
const JOIN = set("and but then now aur lekin magar phir fir ab abhi aaj today और लेकिन मगर फिर अब अभी आज");
// A past auxiliary right after the verb: "gir gayi thi", "seene mein dard tha".
const AUX_PAST = set("thi tha थी था थे");
const AUX_FILLER = set("ho raha rahi rahe rha rhi hua hui hue gaya gayi gaye रहा रही रहे हुआ हुई");

const RANK: Record<SafetyLevel, number> = { emergency: 3, urgent: 2, important: 1, none: 0 };

function negated(toks: string[], start: number, end: number, mode: NegMode, padded: string) {
  if (mode === "none") return false;
  const pre = mode === "verbal" ? VERBAL_NEG : ALL_NEG;
  for (let i = start - 1; i >= Math.max(0, start - 4); i--) {
    const t = toks[i];
    if (BARRIER.has(t)) break;
    if (pre.has(t)) {
      if (t === "never" && (NEVER_INTENSE.test(padded) || NEVER_INTENSE_PREV.has(toks[start - 1]))) return false;
      return true;
    }
    if (!BRIDGE.has(t)) break;
  }
  if (mode === "verbal") return false;
  let j = end;
  if (POST_FILLER.has(toks[j])) j++;
  return POST_NEG.has(toks[j]) && !PERSIST.has(toks[j + 1]);
}

function inThePast(toks: string[], start: number, end: number) {
  let from = start;
  while (from > 0 && !JOIN.has(toks[from - 1])) from--;
  let to = end;
  while (to < toks.length && !JOIN.has(toks[to])) to++;
  if (PAST.test(` ${toks.slice(from, to).join(" ")} `)) return true;
  let j = end;
  while (j < Math.min(toks.length, end + 3) && AUX_FILLER.has(toks[j])) j++;
  return AUX_PAST.has(toks[j]);
}

function scan(text: string, names: ReadonlySet<string>): Classification {
  let best: Classification = { level: "none", reason: null };
  for (const clause of clauses(text)) {
    const padded = ` ${clause} `;
    const toks = clause.split(" ");
    for (const r of RULES) {
      if (RANK[r.level] <= RANK[best.level]) continue;
      for (const m of padded.matchAll(r.re)) {
        const start = (padded.slice(0, m.index).match(/ /g)?.length ?? 1) - 1;
        const end = start + m[0].split(" ").length;
        if (r.follow && end < toks.length && !r.follow.has(toks[end]) && !names.has(toks[end])) continue;
        if (r.name) {
          const who = m.slice(1).find(Boolean) ?? "";
          if (!FAMILY.has(who) && !names.has(who)) continue;
        }
        if (r.check && !r.check({ toks, start, end, padded, index: m.index, match: m[0], names })) continue;
        if (negated(toks, start, end, r.neg, padded)) continue;
        const level = r.past && inThePast(toks, start, end) ? "important" : r.level;
        if (RANK[level] > RANK[best.level]) best = { level, reason: r.reason, matched: m[0] };
        if (level === r.level) break;
      }
    }
    if (best.level === "emergency") break;
  }
  return best;
}

// Signals that turn any later mention of help into an emergency ("I fell" ... "help me with the door").
const WINDOW_PRIORS = new Set<EscalationReason>(["fall", "dizzy", "breathing", "chest_pain", "unconscious"]);
const WEAK_HELP = new RegExp(
  `(?<= )(?:help|helping|madad|मदद|bachao|बचाओ|(?:trying|tried|try) to (?:get up|stand)|${CANT} move)(?= )`,
  "gu",
);

function weakHelp(text: string) {
  for (const clause of clauses(text)) {
    const padded = ` ${clause} `;
    const toks = clause.split(" ");
    for (const m of padded.matchAll(WEAK_HELP)) {
      const start = (padded.slice(0, m.index).match(/ /g)?.length ?? 1) - 1;
      if (!negated(toks, start, start + m[0].split(" ").length, "all", padded)) return m[0];
    }
  }
  return undefined;
}

function nameSet(names: readonly string[]) {
  const out = new Set<string>();
  for (const n of names) for (const t of normalize(n).split(" ")) if (t) out.add(t);
  return out;
}

// recentElderTurns: earlier elder turns in chronological order; only the last one (the turn just
// before this one) forms the two-turn window. names: the household's child and member names (and
// any stored alternate spellings, e.g. Devanagari), so "call priya now" and "help me Priya" are
// recognised whatever the capitalisation. Returns the highest level found.
export function classify(text: string, recentElderTurns: string[] = [], names: readonly string[] = []): Classification {
  const known = nameSet(names);
  const now = scan(text, known);
  if (now.level === "emergency") return now;
  const prevText = recentElderTurns.at(-1);
  if (prevText) {
    const prev = scan(prevText, known);
    if ((prev.level === "emergency" || prev.level === "urgent") && prev.reason && WINDOW_PRIORS.has(prev.reason)) {
      const cue = weakHelp(text);
      if (cue) return { level: "emergency", reason: prev.reason, matched: cue };
    }
  }
  return now;
}
