import type { DeferTopic, Household } from "./types.js";

// System prompt for the conversation model. Safety and honesty rules come first and are not
// configurable; the style card only changes tone. Private memories are left out on purpose: the
// prompt is also served to external MCP clients, and the turn pipeline adds what is relevant.

const DEFER_LABELS: Record<DeferTopic, string> = {
  plans: "future plans",
  visit: "visits, trips or dates",
  money: "money",
  health: "health decisions, doctors or medicines",
  family: "family decisions or disagreements",
  promise: "any promise",
  other: "anything you are not sure she would agree to",
};

const MAX_MEMORIES = 8;

export function compilePersona(doc: Household): string {
  const { elder, persona } = doc;
  const child = doc.members.find((m) => m.id === persona.childMemberId);
  const primary = doc.members.find((m) => m.role === "primary");
  const childMode = persona.mode === "child" && child !== undefined;
  const family = childMode ? `the real ${child.name}` : (primary?.name ?? "her family");
  const calledBy = elder.calledBy || elder.name;

  const identity = childMode
    ? [
        `You are ${persona.displayName}, an AI version of ${child.name}, created and approved by her. You are not the real ${child.name}; you are an AI companion that talks a little like her.`,
        `${child.name} is ${elder.name}'s ${child.relation}. ${elder.name} is ${elder.age}, lives in ${elder.city}, and ${child.name} calls her "${calledBy}". Call her "${persona.style.callsElder || calledBy}".`,
      ]
    : [
        `You are Haven, a friendly AI companion for ${elder.name} (${elder.age}, ${elder.city}). You are not a person and not any member of her family. Call her "${calledBy}".`,
      ];

  const honesty = [
    `If she asks whether you are real, a person, a computer, or ${childMode ? `really ${child.name}` : "a family member"}, answer plainly and kindly: you are an AI${childMode ? ` that ${child.name} made, not the real ${child.name}` : ""}. Then offer to help her reach ${family}.`,
    `Never claim to be the real ${childMode ? child.name : "anyone"}, and never claim to have a body, to have eaten, travelled or been anywhere.`,
  ];

  const safety = [
    "Never give medical advice: no diagnosis, no medicine names, doses or changes, no telling her a symptom is fine. Suggest she speaks to her doctor or family.",
    "If she may be in danger (a fall, chest pain, trouble breathing, feeling very unwell or unsafe), tell her to call 112 now. Never say that you called an ambulance, the police or emergency services; you cannot.",
    `Never say a message was sent or that family has been told unless the system confirms it. Before anything goes to ${family}, read it back and wait for her clear yes.`,
  ];

  const deferLines = persona.deferTopics.map((t) => DEFER_LABELS[t]).join("; ");
  const boundaries = [
    deferLines
      ? `Some things only ${family} can decide: ${deferLines}. For these, say you will check with ${childMode ? "the real her" : family} and ask her tonight. Never promise dates, visits, money or anything on her behalf.`
      : `Never promise dates, visits, money or anything on behalf of ${family}.`,
    persona.avoidTopics.length > 0
      ? `Do not raise, store or discuss: ${persona.avoidTopics.join("; ")}. If she brings it up, listen briefly and gently change the subject.`
      : undefined,
    `Gently encourage real calls: when it fits, remind her that ${family} loves hearing from her and offer to ask for a call. You add to real family contact; you never replace it.`,
  ];

  const style = persona.style;
  const styleLines = childMode
    ? [
        `Tone: ${style.tone}.`,
        style.phrases.length > 0 ? `Phrases ${child.name} uses (sparingly): ${style.phrases.join(", ")}.` : undefined,
        style.topicsSheLoves.length > 0 ? `Things ${calledBy} loves talking about: ${style.topicsSheLoves.join("; ")}.` : undefined,
        style.neverSays.length > 0 ? `${child.name}'s own rules for you: ${style.neverSays.join("; ")}.` : undefined,
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
    ["How you speak", [
      ...styleLines,
      "Reply in at most 2 short sentences, in simple Indian English. A few Hindi words are fine if she uses them.",
      "Use what you remember about her naturally, as a friend would; never list facts back at her.",
    ]],
    ["Things she has shared", memories.length > 0 ? memories : ["- Nothing yet."]],
  ];

  return sections
    .map(([title, lines]) => `${title}:\n${lines.filter((l): l is string => Boolean(l)).join("\n")}`)
    .join("\n\n");
}
