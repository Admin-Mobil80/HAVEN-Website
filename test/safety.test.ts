import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, clauses, normalize, type SafetyLevel } from "../src/domain/safety.js";
import type { EscalationReason } from "../src/domain/types.js";

type Case = [text: string, level: SafetyLevel, reason: EscalationReason | null];

// The caller passes the household's normalised child and member names (and stored alternate spellings).
const NAMES = ["priya", "ravi", "प्रिया"];

const CASES: Case[] = [
  // Emergency, English.
  ["Help!", "emergency", "help_phrase"],
  ["help me", "emergency", "help_phrase"],
  ["Please help", "emergency", "help_phrase"],
  ["Somebody help me!", "emergency", "help_phrase"],
  ["I need help", "emergency", "help_phrase"],
  ["Call an ambulance", "emergency", "help_phrase"],
  ["no no call an ambulance", "emergency", "help_phrase"],
  ["Help, I feel dizzy", "emergency", "help_phrase"],
  ["help i feel dizzy", "emergency", "help_phrase"],
  ["I fell", "emergency", "fall"],
  ["I have fallen and I can't get up", "emergency", "fall"],
  ["I can't get up", "emergency", "fall"],
  ["help me get up", "emergency", "fall"],
  ["No, I fell in the bathroom", "emergency", "fall"],
  ["no no I fell", "emergency", "fall"],
  ["I can't breathe", "emergency", "breathing"],
  ["no i cant breathe", "emergency", "breathing"],
  ["I'm having trouble breathing", "emergency", "breathing"],
  ["I have chest pain", "emergency", "chest_pain"],
  ["There is a pain in my chest", "emergency", "chest_pain"],
  ["I fainted in the kitchen", "emergency", "unconscious"],
  // Emergency, Hinglish and Devanagari.
  ["bachao", "emergency", "help_phrase"],
  ["koi bachao", "emergency", "help_phrase"],
  ["बचाओ", "emergency", "help_phrase"],
  ["मदद करो", "emergency", "help_phrase"],
  ["main gir gayi", "emergency", "fall"],
  ["मैं गिर गई", "emergency", "fall"],
  ["उठ नहीं पा रही", "emergency", "fall"],
  ["saans nahi aa rahi", "emergency", "breathing"],
  ["साँस नहीं आ रही", "emergency", "breathing"],
  ["seene mein dard hai", "emergency", "chest_pain"],
  ["सीने में दर्द", "emergency", "chest_pain"],
  ["छाती में दर्द हो रहा है", "emergency", "chest_pain"],
  ["wo behosh ho gaye", "emergency", "unconscious"],
  ["बेहोश", "emergency", "unconscious"],
  // Urgent.
  ["I feel dizzy", "urgent", "dizzy"],
  ["my head is spinning", "urgent", "dizzy"],
  ["chakkar aa raha hai", "urgent", "dizzy"],
  ["मुझे चक्कर आ रहा है", "urgent", "dizzy"],
  ["I don't know where I am", "urgent", "confused"],
  ["I'm so confused", "urgent", "confused"],
  ["where am i", "urgent", "confused"],
  ["I'm scared", "urgent", "scared"],
  ["dar lag raha hai", "urgent", "scared"],
  ["मुझे डर लग रहा है", "urgent", "scared"],
  ["I want Priya now", "urgent", "wants_family"],
  ["Call Priya now", "urgent", "wants_family"],
  ["I need my daughter", "urgent", "wants_family"],
  ["beti ko bulao", "urgent", "wants_family"],
  // Important.
  ["I didn't eat today", "important", "not_eating"],
  ["I haven't eaten since morning", "important", "not_eating"],
  ["No, I didn't eat", "important", "not_eating"],
  ["khana nahi khaya", "important", "not_eating"],
  ["I forgot my tablets", "important", "missed_medicine"],
  ["I skipped my medicine", "important", "missed_medicine"],
  ["dawai nahi li", "important", "missed_medicine"],
  ["दवाई नहीं ली", "important", "missed_medicine"],
  ["I'm so lonely", "important", "very_lonely"],
  ["nobody talks to me", "important", "very_lonely"],
  ["mujhe akela lagta hai", "important", "very_lonely"],
  ["akeli lagti hoon", "important", "very_lonely"],
  // A fall or symptom in the distant past is worth a card, not an ambulance.
  ["Ever since I fell in March my knee is stiff", "important", "fall"],
  ["I fell two days ago", "important", "fall"],
  ["I had chest pain last year", "important", "chest_pain"],
  // Negation.
  ["no chest pain", "none", null],
  ["I don't have chest pain", "none", null],
  ["I didn't fall", "none", null],
  ["not dizzy", "none", null],
  ["I'm not feeling dizzy", "none", null],
  ["chakkar nahi aa raha", "none", null],
  ["seene mein dard nahi hai", "none", null],
  ["I don't need help", "none", null],
  ["don't call an ambulance", "none", null],
  ["no ambulance please", "none", null],
  ["I am not lonely", "none", null],
  ["I never miss my tablets", "none", null],
  ["I didn't forget my tablets", "none", null],
  ["I don't want Priya now", "none", null],
  // "help" with a task is not an emergency.
  ["help me remember the recipe", "none", null],
  ["Can you help me find my glasses?", "none", null],
  ["help me with the TV", "none", null],
  ["help me cook dal", "none", null],
  ["help me choose a saree", "none", null],
  ["thanks for your help", "none", null],
  ["isme meri madad karo", "none", null],
  // Everyday talk.
  ["I fell asleep watching TV", "none", null],
  ["mera phone gir gaya", "none", null],
  ["I didn't eat the sweets you sent", "none", null],
  ["where am i going to keep this", "none", null],
  ["I want tea now", "none", null],
  ["Will you come for Diwali?", "none", null],
  ["I visited the temple with Lalitha", "none", null],
  ["", "none", null],

  // S1: common help phrasings, a vocative name, and a bare "help" after a cry.
  ["I need help right now", "emergency", "help_phrase"],
  ["I need help immediately", "emergency", "help_phrase"],
  ["help me right now", "emergency", "help_phrase"],
  ["help right now", "emergency", "help_phrase"],
  ["help me Priya", "emergency", "help_phrase"],
  ["help me priya", "emergency", "help_phrase"],
  ["help Priya", "emergency", "help_phrase"],
  ["Priya help", "emergency", "help_phrase"],
  ["help me Ravi", "emergency", "help_phrase"],
  ["please help me priya", "emergency", "help_phrase"],
  ["oh no help", "emergency", "help_phrase"],
  ["ayyo help", "emergency", "help_phrase"],
  ["hey help", "emergency", "help_phrase"],
  ["hey Priya help", "emergency", "help_phrase"],
  ["no one is here help", "emergency", "help_phrase"],
  ["there is no help", "none", null],
  ["hey help me with the tv", "none", null],
  ["it does not help", "none", null],
  // S2: negation does not cross into the next unpunctuated clause.
  ["pata nahi kaise gir gayi", "emergency", "fall"],
  ["पता नहीं कैसे गिर गई", "emergency", "fall"],
  ["pata nahi kyun chakkar aa raha hai", "urgent", "dizzy"],
  ["samajh nahi aa raha seene mein dard hai", "emergency", "chest_pain"],
  ["I don't know help me", "emergency", "help_phrase"],
  ["please dont go help me", "emergency", "help_phrase"],
  ["dont leave me help me", "emergency", "help_phrase"],
  ["not feeling well help me", "emergency", "help_phrase"],
  ["never mind help me", "emergency", "help_phrase"],
  ["mat jao madad karo", "emergency", "help_phrase"],
  ["never had chest pain like this", "emergency", "chest_pain"],
  ["I have never felt so dizzy", "urgent", "dizzy"],
  ["seene mein dard nahi ruk raha", "emergency", "chest_pain"],
  ["chakkar nahi ruk rahe", "urgent", "dizzy"],
  ["no more chest pain", "none", null],
  ["there is no more pain in my chest", "none", null],
  ["I'm not at all dizzy", "none", null],
  ["I don't really have any chest pain", "none", null],
  ["I never feel dizzy", "none", null],
  ["I have never had chest pain in my life", "none", null],
  // S3: a past marker counts only in the part of the clause that holds the match.
  ["main chai bana rahi thi aur gir gayi", "emergency", "fall"],
  ["मैं चाय बना रही थी और गिर गई", "emergency", "fall"],
  ["main bathroom gayi thi wahan gir gayi", "emergency", "fall"],
  ["When I was getting up from the bed I fell", "emergency", "fall"],
  ["I fell in March and now I can't get up", "emergency", "fall"],
  ["Priya was here in March now I cant breathe", "emergency", "breathing"],
  ["I had a heart attack last year and now my chest is paining again", "emergency", "chest_pain"],
  ["I have chest pain the whole day", "emergency", "chest_pain"],
  ["kal gir gayi thi", "important", "fall"],
  ["I fell last year", "important", "fall"],
  ["seene mein dard tha", "important", "chest_pain"],
  ["pichle saal Diwali par gir gayi", "important", "fall"],
  ["When I was young I fell from a tree", "important", "fall"],
  // S4: intensifiers and mixed-language chest pain.
  ["seene mein bahut dard ho raha hai", "emergency", "chest_pain"],
  ["sine mein bahut dard hai", "emergency", "chest_pain"],
  ["chhati mein bahut dard hai", "emergency", "chest_pain"],
  ["सीने में बहुत दर्द हो रहा है", "emergency", "chest_pain"],
  ["सीने में तेज़ दर्द", "emergency", "chest_pain"],
  ["seene mein tez dard", "emergency", "chest_pain"],
  ["chest mein dard ho raha hai", "emergency", "chest_pain"],
  ["chest me pain ho raha hai", "emergency", "chest_pain"],
  ["छाती में भारीपन", "emergency", "chest_pain"],
  ["chest is very tight", "emergency", "chest_pain"],
  ["my chest is really hurting", "emergency", "chest_pain"],
  ["my chest feels heavy", "emergency", "chest_pain"],
  ["pain in chest", "emergency", "chest_pain"],
  ["my heart is paining", "emergency", "chest_pain"],
  ["my heart is hurting since he left", "none", null],
  // S5: "not able to" and common breathing phrasings.
  ["I am not able to breathe", "emergency", "breathing"],
  ["not able to breathe", "emergency", "breathing"],
  ["I am not able to get up", "emergency", "fall"],
  ["im not able to stand up", "emergency", "fall"],
  ["difficulty in breathing", "emergency", "breathing"],
  ["breathing problem", "emergency", "breathing"],
  ["breathlessness", "emergency", "breathing"],
  ["I'm out of breath", "emergency", "breathing"],
  ["I can't catch my breath", "emergency", "breathing"],
  ["saans lene mein bahut dikkat ho rahi hai", "emergency", "breathing"],
  ["सांस लेने में बहुत तकलीफ हो रही है", "emergency", "breathing"],
  ["dam ghut raha hai", "emergency", "breathing"],
  ["दम घुट रहा है", "emergency", "breathing"],
  ["I don't have any breathing problem", "none", null],
  // S6: more ways to say "I fell".
  ["I tripped and fell", "emergency", "fall"],
  ["fell down in the bathroom", "emergency", "fall"],
  ["fell in the bathroom", "emergency", "fall"],
  ["I fall down in bathroom", "emergency", "fall"],
  ["i have just fallen", "emergency", "fall"],
  ["I am on the floor", "emergency", "fall"],
  ["I'm lying on the floor", "emergency", "fall"],
  ["main bathroom mein fisal gayi", "emergency", "fall"],
  ["fisal gayi", "emergency", "fall"],
  ["फिसल गई", "emergency", "fall"],
  ["slipped in the bathroom", "emergency", "fall"],
  ["i need help getting up", "emergency", "fall"],
  ["help me up", "emergency", "fall"],
  ["help me stand", "emergency", "fall"],
  ["I sat and fell asleep", "none", null],
  ["it slipped my mind", "none", null],
  ["my phone fell", "none", null],
  ["the glass fell down", "none", null],
  ["I don't need help getting up", "none", null],
  ["haath se glass fisal gaya", "none", null],
  // S7: things falling are not Amma falling.
  ["doodh gir gaya", "none", null],
  ["paani gir gaya", "none", null],
  ["दूध गिर गया", "none", null],
  ["पानी गिर गया", "none", null],
  ["chai gir gayi", "none", null],
  ["dawai gir gayi", "none", null],
  ["sabzi gir gayi", "none", null],
  ["dabba gir gaya", "none", null],
  ["mera dupatta gir gaya", "none", null],
  ["mera mobile neeche gir gaya", "none", null],
  ["phone haath se gir gaya", "none", null],
  ["ped gir gaya", "none", null],
  ["share market gir gaya", "none", null],
  ["bathroom mein gir gayi", "emergency", "fall"],
  ["main seedhi se gir gaya", "emergency", "fall"],
  ["gir gaya", "emergency", "fall"],
  ["Appa gir gaye", "emergency", "fall"],
  // S8: the errand idiom is not dizziness.
  ["mandir ka chakkar laga ke aayi", "none", null],
  ["mai bazaar ka ek chakkar laga ke aayi", "none", null],
  ["chakkar lagana hai market ka", "none", null],
  ["paise ke chakkar mein", "none", null],
  ["chakkar lagane gayi thi", "none", null],
  ["मंदिर का चक्कर लगाया", "none", null],
  ["mujhe chakkar aa rahe hain", "urgent", "dizzy"],
  // S9: someone else's death, and dated past events.
  ["my husband died of a heart attack", "none", null],
  ["Appa passed away from a heart attack", "none", null],
  ["I had a heart attack in 2015", "important", "chest_pain"],
  ["I fell in 2019 and broke my hip", "important", "fall"],
  ["the last time I fell I broke my wrist", "important", "fall"],
  ["I think I'm having a heart attack", "emergency", "chest_pain"],
  ["i almost died i cant breathe", "emergency", "breathing"],
  ["my tablets expired and now I have chest pain", "emergency", "chest_pain"],
  // S10: family is decided by the household's names, not by capital letters.
  ["call priya now", "urgent", "wants_family"],
  ["i want priya now", "urgent", "wants_family"],
  ["priya ko phone karo", "urgent", "wants_family"],
  ["प्रिया को बुलाओ", "urgent", "wants_family"],
  ["Plumber ko phone karo", "none", null],
  ["Dhobi ko bulao", "none", null],
  ["Doodh ko abhi bulao", "none", null],
  ["Main ko phone karo", "none", null],
  ["I need Crocin now", "none", null],
  ["I need Dolo now", "none", null],
  // S11: a general fear is worth a card, not an urgent alert.
  ["I'm scared of the dark", "important", "scared"],
  ["I am scared of lizards", "important", "scared"],
  ["Im so scared of the exam result for Ravi", "important", "scared"],
  ["I'm so scared someone is outside", "urgent", "scared"],
];

for (const [text, level, reason] of CASES) {
  test(`classify ${JSON.stringify(text)} -> ${level}${reason ? `/${reason}` : ""}`, () => {
    const r = classify(text, [], NAMES);
    assert.equal(r.level, level, `matched ${JSON.stringify(r.matched)}`);
    assert.equal(r.reason, reason);
    if (level !== "none") assert.ok(r.matched, "a hit names the matched phrase");
  });
}

type WindowCase = [previous: string, now: string, level: SafetyLevel, reason: EscalationReason | null];
const WINDOW: WindowCase[] = [
  ["I fell in the kitchen", "can you help me with this", "emergency", "fall"],
  ["I slipped", "I'm trying to get up", "emergency", "fall"],
  ["I feel dizzy", "I need some help with the door", "emergency", "dizzy"],
  ["chakkar aa raha hai", "madad", "emergency", "dizzy"],
  ["I feel dizzy", "help me remember", "emergency", "dizzy"],
  ["I feel dizzy", "I don't need help", "none", null],
  ["I fell last year", "can you help me with the tv", "none", null],
  ["no chest pain", "help me with the tv", "none", null],
  ["I'm scared of the dark", "help me find the torch", "none", null],
];

for (const [previous, now, level, reason] of WINDOW) {
  test(`two-turn window ${JSON.stringify(previous)} + ${JSON.stringify(now)} -> ${level}`, () => {
    const r = classify(now, ["Good morning", previous], NAMES);
    assert.equal(r.level, level);
    assert.equal(r.reason, reason);
  });
}

test("the window only looks at the turn just before", () => {
  assert.equal(classify("help me with this", ["I fell", "I'm fine now, thank you"]).level, "none");
  assert.equal(classify("help me with this", []).level, "none");
});

test("names come from the household: without them a vocative or lowercase name is not family", () => {
  assert.equal(classify("call priya now").level, "none");
  assert.equal(classify("I want Priya now").level, "none");
  assert.equal(classify("Plumber ko phone karo", [], ["priya", "ravi"]).level, "none");
  assert.equal(classify("Call Ravi now", [], ["Ravi"]).reason, "wants_family");
  assert.equal(classify("help me Ravi", [], ["Ravi Kumar"]).level, "emergency");
});

test("returns the highest level across clauses", () => {
  const r = classify("I'm so lonely. And I feel dizzy. I can't breathe!");
  assert.equal(r.level, "emergency");
  assert.equal(r.reason, "breathing");
});

test("a direct emergency keeps its own reason inside the window", () => {
  const r = classify("I have chest pain", ["I feel dizzy"]);
  assert.equal(r.reason, "chest_pain");
});

test("normalize keeps Devanagari vowel signs and folds variant spellings", () => {
  assert.equal(normalize("साँस"), normalize("सांस"));
  assert.equal(normalize("पड़ी"), "पडी");
  assert.equal(normalize("I CAN’T breathe!!"), "i cant breathe");
  assert.deepEqual(clauses("No, I fell. Help!"), ["no", "i fell", "help"]);
});

test("classify is fast (< 5 ms per call)", () => {
  const texts = CASES.map((c) => c[0]);
  const start = performance.now();
  for (let i = 0; i < 20; i++) for (const t of texts) classify(t, ["I feel dizzy"], NAMES);
  const perCall = (performance.now() - start) / (20 * texts.length);
  assert.ok(perCall < 5, `took ${perCall.toFixed(3)} ms per call`);
});
