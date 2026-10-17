// Deterministic matchers for short elder replies. Used where a wrong guess by an LLM would be
// unsafe: consent ("yes, send it") and AI-honesty questions ("are you real?").
// Word boundaries are written as (?<=^|\s) / (?=\s|$) because \b is ASCII-only and breaks on
// Devanagari; norm() keeps combining marks (\p{M}) so "हाँ" survives normalisation.

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const words = (list: string) => new Set(list.split(" ").map(norm));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const END = String.raw`(?=\s|$)`;
const YES = new RegExp(
  String.raw`^(yes please|yes send it|ok send it|send it|bhej do|bhej dijiye|भेज दो|भेज दीजिए|please do|go ahead|do it|ji haan|theek hai|thik hai|ठीक है|जी हाँ|yes|yeah|yep|yup|ok|okay|sure|haan|haa|han|hanji|haanji|ji|हाँ|हां|जी)` + END,
);
// A reply that opens with a decline. "no problem" / "no worries" are not declines.
const NO = new RegExp(
  String.raw`^(?!no (problem|worries|doubt|issue)(\s|$))(no|nope|nah|nahi|nahin|na|mat|don't|dont|do not|wait|stop|cancel|not now|not yet|later|baad mein|never mind|nevermind|forget it|leave it|rehne do|rahne do|ruko|hold on|नहीं|ना|मत|अभी नहीं|रहने दो|रुको)` +
    END,
);
const BENIGN_NO = /(?<=^|\s)no (problem|worries|doubt|issue)(?=\s|$)/gu;
const withoutBenignNo = (s: string) => s.replace(BENIGN_NO, " ").replace(/\s+/g, " ").trim();

// A negation anywhere in the reply means it is not consent: "Okay, never mind", "haan, mat bhejo",
// "Sure, no need", "ok forget it". Bare "na" is left out: "bhej do na" is Hinglish for "please send".
const NEGATION = words(
  "no nope nah nahi nahin never mat don't dont not cancel stop wait forget mind need leave rehne rahne chhodo chodo chhod मत नहीं रहने छोड़ो छोडो",
);
// A "yes" followed by any of these is not consent either: "yes wait", "haan lekin", "Haan kya?".
const HESITATION = words(
  "but hold later yet ruko ruk rukiye rukna lekin magar baad what kya huh pardon sorry repeat dobara " +
    "रुको रुकिए रुक लेकिन मगर बाद क्या",
);
// After the opening yes only these may follow ("yes, send it to her please", "haan beta bhej do").
// Anything else makes the reply about something else, so it is not a clear yes.
const YES_TAIL = words(
  "yes yeah yep yup ok okay sure please pls plz send it this that message to her him go ahead do ji haan haanji hanji han haa " +
    "bhej bhejo bhejiye bhejna de dena dijiye dijie beta beti kar karo theek thik hai abhi jaldi now right away of course " +
    "definitely absolutely thing call ask tell the a " +
    "जी हाँ हां ठीक है भेज भेजो भेजिए दो दीजिए दे बेटा बेटी अभी",
);

// True only for a short, clear "yes". Anything ambiguous, hesitant, questioning or long is not-yes.
// names: the household's family names, which may follow the yes ("yes, send it to Priya").
export function isAffirmative(text: string, names: readonly string[] = []) {
  if (/[?？]\s*$/.test(text.trim())) return false; // "Haan?" is "pardon?"
  const s = withoutBenignNo(norm(text));
  if (!s) return false;
  const tokens = s.split(" ");
  if (tokens.length > 6) return false;
  if (NO.test(s) || tokens.some((t) => NEGATION.has(t) || HESITATION.has(t))) return false;
  const m = YES.exec(s);
  if (!m) return false;
  const known = new Set(names.flatMap((n) => norm(n).split(" ")));
  const rest = s.slice(m[0].length).trim();
  return rest === "" || rest.split(" ").every((t) => YES_TAIL.has(t) || known.has(t));
}

// A short reply that opens with a decline ("no", "rehne do", "not now").
export function isNegative(text: string) {
  const s = norm(text);
  return Boolean(s) && s.split(" ").length <= 6 && NO.test(s);
}

// Any decline or negation, however long: "No no, do not send it to Priya, she is busy today".
// Consent uses this so a long "no" still blocks a later, unrelated "yes".
export function declines(text: string) {
  const s = withoutBenignNo(norm(text));
  if (!s) return false;
  return NO.test(s) || s.split(" ").some((t) => NEGATION.has(t));
}

const W = (alts: string) => String.raw`(?<=^|\s)(${alts})(?=\s|$)`;

// "Are you real?", "Are you really Priya?", "Is this really Priya?", "Am I talking to a computer?"
export function asksIfReal(text: string, childName = "") {
  const s = norm(text);
  const name = escape(norm(childName)) || "(?!)";
  const who = `you|${name}|a person|a real person|human|a human`;
  const kin = "my (daughter|son|grandson|granddaughter|child|beti|beta)";
  return (
    new RegExp(W(String.raw`(are|r) (you|u) (real|a real person|human|a human|a robot|a bot|a computer|an ai|ai|a machine)`)).test(s) ||
    new RegExp(W(String.raw`(are|r) (you|u) (really |actually |truly )?(${name}|${kin})`)).test(s) ||
    new RegExp(W(String.raw`is (this |it )?(really|actually|the real) (${who})`)).test(s) ||
    new RegExp(W(String.raw`is (this|that|it) (really |actually )?(you|${name})( ${name})?$`)).test(s) ||
    new RegExp(W(String.raw`(am i|i am|i'm) (talking|speaking) (to|with) (a )?(computer|robot|machine|ai|real person|the real (${who})|${name}|my (daughter|son))`)).test(s) ||
    new RegExp(W(String.raw`(sach mein|asli) (tum|aap|ho)`)).test(s) ||
    new RegExp(W(String.raw`(tum|aap) (sach mein|sachmuch|sach me|asli) (${name} )?(ho|hain|hai)`)).test(s) ||
    new RegExp(W(String.raw`(tum|aap) (robot|computer|machine|ai) (ho|hain)`)).test(s) ||
    /(क्या तुम असली हो|क्या आप असली हैं)/.test(s) ||
    /(तुम|आप) (असली|सच में)|(तुम|आप) (रोबोट|कंप्यूटर|मशीन) (हो|हैं)/.test(s)
  );
}
