import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCommitment } from "../src/domain/commitment.js";
import type { DeferTopic } from "../src/domain/types.js";

const POSITIVE: [text: string, topic: DeferTopic, question?: string][] = [
  ["Will you come for Diwali?", "visit"],
  ["Priya, when are you coming home?", "visit"],
  ["Will you be here for Diwali?", "visit"],
  ["You'll be here for Pongal, right?", "visit"],
  ["Please come home for Diwali.", "visit"],
  ["Do you want to come for Ugadi?", "visit"],
  ["won't you come this time?", "visit"],
  ["r u coming for diwali", "visit"],
  ["Will Priya come for Diwali?", "visit"],
  ["Kab aaogi beta?", "visit"],
  ["Diwali pe aaogi na?", "visit"],
  ["तुम कब आओगी?", "visit"],
  ["The knee is better now. Will you visit next month?", "visit", "Will you visit next month?"],
  ["Can you send me some money?", "money"],
  ["Will you pay the electricity bill?", "money"],
  ["Can you transfer 5000 for the maid?", "money"],
  ["paise bhej dogi?", "money"],
  ["मुझे पैसे भेज दोगी?", "money"],
  ["Promise me you'll call every Sunday", "promise"],
  ["Can you buy me a new phone?", "plans"],
  ["Will you bring jalebis?", "plans"],
  ["Can you book the train tickets?", "plans"],
  ["Will you take me to the temple on Sunday?", "plans"],
  ["Can we go to Tirupati in December?", "plans"],
  ["mere liye saree le aaogi?", "plans"],
  ["will you be coming for Pongal", "visit"],
  ["Will you come and see me?", "visit"],
  ["Can you come here for Diwali?", "visit"],
  ["Can you come on Sunday?", "visit"],
  ["Can you make it for Diwali?", "visit"],
  ["Can you get me a new saree?", "plans"],
];

for (const [text, topic, question] of POSITIVE) {
  test(`detects ${topic}: ${JSON.stringify(text)}`, () => {
    const r = detectCommitment(text, "Priya");
    assert.ok(r, "expected a commitment");
    assert.equal(r.topic, topic);
    assert.equal(r.question, question ?? text);
  });
}

const NEGATIVE = [
  "I visited the temple",
  "the vegetable seller charged 50 rupees",
  "Priya came last year",
  "will it rain today",
  "can you play a song",
  "can you remind me to drink water",
  "will you tell me a story",
  "when will the physio come",
  "you came to see me last Diwali",
  "Do you remember when you came for Diwali?",
  "Lalitha will come on Sunday",
  "Ravi said he will visit",
  "can you send me the photos",
  "I bought a new saree",
  "I promise I will take my tablets",
  "I promise you I'll take my tablets",
  "will you remember my birthday",
  "can you come up with a recipe",
  "can you bring up the news",
  "my son-in-law sent money last month",
  "Are you okay?",
  "would you like to hear a story",
  "are you coming down with a cold?",
  "will you pay attention",
  "do you visit the temple often?",
  "The priest will come home for the puja",
  "I want to visit Mysuru someday",
  "you visited me last month",
  "kya tum khana kha rahi ho",
  "hum kal mandir chalenge",
  // Everyday assistant commands (C1).
  "can you make it louder",
  "can you make it play again",
  "come on tell me a story",
  "come on, tell me a story",
  "come here and listen to this song",
  "come let us sing",
  "can you get me the news",
  "can you get me the weather",
  "can you bring the volume down",
  "can you book a reminder",
  "can you take me through the recipe",
  "can you transfer the call",
  "",
];

for (const text of NEGATIVE) {
  test(`ignores ${JSON.stringify(text)}`, () => {
    assert.equal(detectCommitment(text, "Priya"), null);
  });
}

test("the child's name comes from the household", () => {
  assert.equal(detectCommitment("Will Ravi visit this weekend?", "Ravi")?.topic, "visit");
  assert.equal(detectCommitment("Will Priya come for Diwali?", "Ravi"), null);
  assert.equal(detectCommitment("Will you come for Diwali?", "Ravi")?.topic, "visit");
});

test("the question is the cleaned sentence, at most 200 characters", () => {
  assert.equal(detectCommitment("  Will   you come for\tDiwali?  ")?.question, "Will you come for Diwali?");
  assert.equal(detectCommitment("Good morning!\nWill you come for Diwali?")?.question, "Will you come for Diwali?");
  const long = `${"so ".repeat(120)}will you come?`;
  const r = detectCommitment(long);
  assert.ok(r);
  assert.ok(r.question.length <= 200, `length ${r.question.length}`);
});
