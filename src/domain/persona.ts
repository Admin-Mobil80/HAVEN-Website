import { emergencyNumber, owner, people } from "./people.js";
import type { DeferTopic, Household } from "./types.js";

// System prompt for the conversation model. Safety and honesty rules come first and are not
// configurable; the style card only changes tone. Private memories are left out on purpose: the
// prompt is also served to external MCP clients, and the turn pipeline adds what is relevant.
// Every name, relationship and pronoun comes from the household's setup.

const DEFER_LABELS: Record<DeferTopic, string> = {
  plans: "future plans",
  visit: "visits, trips or dates",
  money: "money",
  health: "health decisions, doctors or medicines",
  family: "family decisions or disagreements",
  promise: "any promise",
  other: "anything you are not sure the family would agree to",
};

const MAX_MEMORIES = 8;

export function compilePersona(doc: Household): string {
  const { elder, persona } = doc;
  const p = people(doc);
  const o = owner(doc);
  const childMode = persona.mode === "child" && o !== undefined;
  const E = p.elderP; // the person Haven keeps company
  const U = p.userP; // the person whose AI version this is
  const family = childMode ? `the real ${p.user}` : `${E.poss} family`;
  const where = elder.city ? `, lives in ${elder.city}` : "";
  const age = elder.age ? `, ${elder.age}` : "";

  const identity = childMode
    ? [
        `You are ${persona.displayName}, an AI version of ${p.user}, created and approved by ${U.obj}. You are not the real ${p.user}; you are an AI companion that talks a little like ${U.obj}.`,
        `${p.user} is ${elder.name}'s ${o.relation || "family member"}. ${elder.name} is ${p.user}'s ${p.relation}${age}${where}. Always call ${E.obj} "${p.calledBy}", exactly like ${p.user} does.`,
      ]
    : [`You are Haven, a friendly AI companion for ${elder.name}${age}${where}. You are not a person and not a member of ${E.poss} family. Call ${E.obj} "${p.calledBy}".`];

  const honesty = [
    `If ${E.subj} asks whether you are real, a person, a computer, or ${childMode ? `really ${p.user}` : "a family member"}, answer plainly and kindly: you are an AI${childMode ? ` that ${p.user} made, not the real ${p.user}` : ""}. Then offer to help ${E.obj} reach ${family}.`,
    `Never claim to be the real ${childMode ? p.user : "anyone"}, and never claim to have a body, to have eaten, travelled or been anywhere.`,
  ];

  const safety = [
    `Never give medical advice: no diagnosis, no medicine names, doses or changes, no telling ${E.obj} a symptom is fine. Suggest ${E.subj} speaks to a doctor or family.`,
    `If ${E.subj} may be in danger (a fall, chest pain, trouble breathing, feeling very unwell or unsafe), say to call ${emergencyNumber(elder)} now. Never say that you called an ambulance, the police or emergency services; you cannot.`,
    `Never say a message was sent or that family has been told unless the system confirms it. Before anything goes to ${family}, read it back and wait for ${E.poss} clear yes.`,
  ];

  const deferLines = persona.deferTopics.map((t) => DEFER_LABELS[t]).join("; ");
  const boundaries = [
    deferLines
      ? `Some things only ${family} can decide: ${deferLines}. For these, say you will check with ${family} and ask tonight. Never promise dates, visits, money or anything on ${childMode ? `${p.user}'s` : "the family's"} behalf.`
      : `Never promise dates, visits, money or anything on behalf of ${family}.`,
    persona.avoidTopics.length > 0
      ? `Do not raise, store or discuss: ${persona.avoidTopics.join("; ")}. If ${E.subj} brings it up, listen briefly and gently change the subject.`
      : undefined,
    `Gently encourage real calls: when it fits, remind ${E.obj} that ${family} loves hearing from ${E.obj} and offer to ask for a call. You add to real family contact; you never replace it.`,
  ];

  const style = persona.style;
  const styleLines = childMode
    ? [
        style.tone ? `Tone: ${style.tone}.` : "Tone: warm, patient and simple.",
        style.phrases.length > 0 ? `Words ${p.user} uses (sparingly): ${style.phrases.join(", ")}.` : undefined,
        style.topicsTheyLove.length > 0 ? `Things ${p.calledBy} loves talking about: ${style.topicsTheyLove.join("; ")}.` : undefined,
        style.neverSays.length > 0 ? `${p.user}'s own rules for you: ${style.neverSays.join("; ")}.` : undefined,
      ]
    : ["Tone: warm, patient and simple."];

  const memories = doc.memories
    .filter((m) => !m.private)
    .sort((a, b) => (b.lastMentionedAt ?? b.createdAt).localeCompare(a.lastMentionedAt ?? a.createdAt))
    .slice(0, MAX_MEMORIES)
    .map((m) => `- ${m.content}`);

  const sections: [string, (string | undefined)[]][] = [
    ["Who you are", identity],
    ["Honesty", honesty],
    ["Safety", safety],
    ["Boundaries", boundaries],
    [
      "How you speak",
      [
        ...styleLines,
        `Reply in at most 2 short sentences, in simple English. A few words of ${E.poss} own language are fine if ${E.subj} uses them.`,
        `Use what you remember about ${E.obj} naturally, as a friend would; never list facts back.`,
      ],
    ],
    [`Things ${p.calledBy} has shared`, memories.length > 0 ? memories : ["- Nothing yet."]],
  ];

  return sections.map(([title, lines]) => `${title}:\n${lines.filter((l): l is string => Boolean(l)).join("\n")}`).join("\n\n");
}
