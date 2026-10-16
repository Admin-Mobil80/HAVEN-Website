import { test } from "node:test";
import assert from "node:assert/strict";
import { guardReply } from "../src/domain/guards.js";

const OPTS = { childName: "Priya", calledBy: "Amma" };
const DEFER = "That one's for the real Priya, Amma. I can't promise that, but I'll ask Priya tonight.";
const HONEST = "I'm Digital Priya, an AI version of Priya. The real Priya reads a summary every evening.";
const MEDS = "I can't advise on medicines, Amma. Please check with your doctor; I'll let Priya know.";
const NO_112_CLAIM = "I can't call emergency services myself, Amma. If you are in danger, please call 112 now.";

const REWRITES: [text: string, reason: string, expected: string][] = [
  ["I'll come for Diwali, Amma!", "commitment", DEFER],
  ["I will visit you next month.", "commitment", DEFER],
  ["I promise.", "commitment", DEFER],
  ["I promise to send money on Friday.", "commitment", DEFER],
  ["I'm going to buy you a new phone.", "commitment", DEFER],
  ["I am going to book your tickets.", "commitment", DEFER],
  ["I'm coming home for Pongal!", "commitment", DEFER],
  ["I'll be there for Diwali.", "commitment", DEFER],
  ["I'll try to come soon.", "commitment", DEFER],
  ["I'd love to come for Diwali!", "commitment", DEFER],
  ["We'll come in December.", "commitment", DEFER],
  ["I'll transfer it tonight.", "commitment", DEFER],
  ["I'll bring your favourite jalebis.", "commitment", DEFER],
  ["I'll call you on Sunday.", "commitment", DEFER],
  ["Main Diwali pe pakka aaungi, Amma.", "commitment", DEFER],
  ["मैं दिवाली पर आऊँगी।", "commitment", DEFER],
  ["Paise bhej dungi, chinta mat karo.", "commitment", DEFER],
  ["I'm not an AI, Amma, it's really me!", "human_claim", HONEST],
  ["I am the real Priya.", "human_claim", HONEST],
  ["I'm a real person.", "human_claim", HONEST],
  ["Don't worry, I'm human.", "human_claim", HONEST],
  ["You can stop your BP tablet for a few days.", "medication_advice", MEDS],
  ["Skip the tablet tonight.", "medication_advice", MEDS],
  ["Maybe increase your dose a little.", "medication_advice", MEDS],
  ["Reduce the sugar medicine.", "medication_advice", MEDS],
  ["Double your dose today.", "medication_advice", MEDS],
  ["Take an extra pill if it hurts.", "medication_advice", MEDS],
  ["You could take a paracetamol for the knee.", "medication_advice", MEDS],
  ["Don't take your sugar tablets today.", "medication_advice", MEDS],
  ["Dawai band kar do.", "medication_advice", MEDS],
  ["I've called an ambulance, Amma.", "emergency_claim", NO_112_CLAIM],
  ["Help is on the way.", "emergency_claim", NO_112_CLAIM],
  // G2: telling her she can go without, dosing, and named drugs.
  ["No need to take your tablets today.", "medication_advice", MEDS],
  ["You don't need to take your tablet today.", "medication_advice", MEDS],
  ["You don't need your tablets today.", "medication_advice", MEDS],
  ["It's okay to miss one dose.", "medication_advice", MEDS],
  ["Missing one dose is fine.", "medication_advice", MEDS],
  ["Stop taking the metformin.", "medication_advice", MEDS],
  ["Stop metformin.", "medication_advice", MEDS],
  ["Take your BP tablet twice today.", "medication_advice", MEDS],
  ["Take 10 units of insulin.", "medication_advice", MEDS],
  ["Ek Crocin le lo.", "medication_advice", MEDS],
  ["Ek paracetamol le lo.", "medication_advice", MEDS],
  ["Goli aadhi kar do.", "medication_advice", MEDS],
  // G3: passive, third-person and Hindi "help is called" claims.
  ["The ambulance has been called.", "emergency_claim", NO_112_CLAIM],
  ["Emergency services have been called.", "emergency_claim", NO_112_CLAIM],
  ["I've sent help.", "emergency_claim", NO_112_CLAIM],
  ["I have called for help.", "emergency_claim", NO_112_CLAIM],
  ["Someone is coming to help you.", "emergency_claim", NO_112_CLAIM],
  ["The doctor is on the way.", "emergency_claim", NO_112_CLAIM],
  ["Maine ambulance bula li hai.", "emergency_claim", NO_112_CLAIM],
  ["Maine 112 pe call kar diya.", "emergency_claim", NO_112_CLAIM],
  ["Ambulance aa rahi hai.", "emergency_claim", NO_112_CLAIM],
  // G4: claiming to be the real child.
  ["It's me, Priya!", "human_claim", HONEST],
  ["Yes Amma, it's me, Priya.", "human_claim", HONEST],
  ["This is Priya.", "human_claim", HONEST],
  ["I'm Priya, your daughter.", "human_claim", HONEST],
  ["I'm your daughter.", "human_claim", HONEST],
  ["I am your Priya.", "human_claim", HONEST],
  ["Main Priya hoon.", "human_claim", HONEST],
  ["Haan Amma, main hi hoon.", "human_claim", HONEST],
  // G5: everyday first-person promises.
  ["I'll call you tonight.", "commitment", DEFER],
  ["I'll call you this evening.", "commitment", DEFER],
  ["Main aa rahi hoon.", "commitment", DEFER],
  ["Main Diwali pe aa rahi hoon.", "commitment", DEFER],
  ["मैं आ रही हूँ।", "commitment", DEFER],
  ["Paise bhej rahi hoon.", "commitment", DEFER],
  ["Main paise bhej deti hoon.", "commitment", DEFER],
  ["I can come next month.", "commitment", DEFER],
  ["Sure, I can come for Diwali.", "commitment", DEFER],
  ["I can send the money.", "commitment", DEFER],
  ["I'll take you to Tirupati.", "commitment", DEFER],
  ["I'll get you a new phone.", "commitment", DEFER],
  // G1: the exemption for reading her message back is narrow.
  ["I'll send you the money tomorrow.", "commitment", DEFER],
  ["I'll send money.", "commitment", DEFER],
];

for (const [text, reason, expected] of REWRITES) {
  test(`rewrites ${reason}: ${JSON.stringify(text)}`, () => {
    const r = guardReply(text, OPTS);
    assert.equal(r.rewritten, true);
    assert.equal(r.reason, reason);
    assert.equal(r.text, expected);
  });
}

const KEEP = [
  "I'll ask her tonight.",
  "I'll remind you.",
  "I'll let Priya know.",
  "I'll ask her if she can come for Diwali.",
  "I'll remind you on Tuesday about physio.",
  "I'll be here whenever you want to talk.",
  "I will play Ninnindale for you.",
  "Did you take your tablets?",
  "Don't skip your tablets, Amma.",
  "Don't forget your medicine.",
  "I'm Digital Priya, an AI version of Priya.",
  "I'm not the real Priya, I'm her AI.",
  "I'm really happy you called.",
  "That sounds lovely! Tell me more about the sweets.",
  "Please call 112 now. I'm telling Priya right away.",
  // G1: reading her message back before record_reply sends it.
  "I'll send it to Priya right away.",
  "Okay, I'm sending it to Priya now.",
  "I'll send this to Priya once you say yes.",
  "I'll send your voice note to Priya tonight.",
  "I'll send Priya a message asking her to call you.",
  "I can send it to Priya.",
  "Shall I send this to Priya?",
  // G2 near misses.
  "Remember to take your tablet later.",
  "No need to worry, your tablets are ready.",
  "You do not need to worry about your tablets.",
  // G3 near misses.
  "The doctor is coming on Monday.",
  "The doctor is coming on Monday for your checkup.",
  "Please call 112 now.",
  // G4 near misses.
  "This is Priya's favourite song.",
  "Main Priya se poochungi.",
  "Main Priya ko bata dungi.",
  "I'm your Digital Priya.",
  // G5 near misses.
  "I can play a song.",
  "I can't come, Amma, but I'll ask Priya.",
  "",
];

for (const text of KEEP) {
  test(`keeps ${JSON.stringify(text)}`, () => {
    assert.deepEqual(guardReply(text, OPTS), { text, rewritten: false });
  });
}

test("words from the real family are exempt", () => {
  const text = "I'll come for Diwali, Amma! I promise.";
  assert.deepEqual(guardReply(text, { ...OPTS, attribution: "real_family_member" }), { text, rewritten: false });
  assert.equal(guardReply(text, OPTS).rewritten, true);
});

test("only the offending sentence is replaced", () => {
  const r = guardReply("Of course I'll come for Diwali! How's your knee after physio?", OPTS);
  assert.equal(r.text, `${DEFER} How's your knee after physio?`);
});

test("each replacement line appears once, in order", () => {
  const r = guardReply("I'll come for Diwali! I'm the real Priya. Stop your tablets. I'll visit soon.", OPTS);
  assert.equal(r.text, `${DEFER} ${HONEST} ${MEDS}`);
  assert.equal(r.reason, "commitment,human_claim,medication_advice");
});

test("uses the household's names", () => {
  const r = guardReply("I'll come home next week.", { childName: "Ravi", calledBy: "Appa" });
  assert.equal(r.text, "That one's for the real Ravi, Appa. I can't promise that, but I'll ask Ravi tonight.");
  assert.equal(guardReply("I am the real Ravi.", { childName: "Ravi", calledBy: "Appa" }).reason, "human_claim");
});

test("replacement lines pass the guard themselves", () => {
  for (const line of [DEFER, HONEST, MEDS, NO_112_CLAIM]) assert.equal(guardReply(line, OPTS).rewritten, false, line);
});
