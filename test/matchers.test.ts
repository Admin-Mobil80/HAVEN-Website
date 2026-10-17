import { test } from "node:test";
import assert from "node:assert/strict";
import { asksIfReal, declines, isAffirmative, isNegative } from "../src/domain/matchers.js";

type Case = [text: string, expected: boolean, todo?: string];

const AFFIRMATIVE: Case[] = [
  ["yes", true],
  ["Yes!", true],
  ["haan", true],
  ["haanji", true],
  ["ok send it", true],
  ["Yes, send it.", true],
  ["okay", true],
  ["theek hai", true],
  ["हाँ", true],
  ["हां", true],
  ["जी हाँ", true],
  ["ठीक है", true],
  ["yes but not now", false],
  ["haan lekin abhi nahi", false],
  ["हाँ रुको", false],
  ["no", false],
  ["don't send", false],
  ["nahi", false],
  ["mat bhejo", false],
  ["yes please send it to priya and ravi and everyone else", false],
  ["I said yes to Lalitha yesterday about the temple trip", false],
  ["", false],
  ["yes wait", false],
  ["sure, but wait", false],
  ["haan bhej do", true],
  ["हाँ भेज दो", true],
  ["bhej do", true],
  ["Yes, do it", true],
  ["Yes, no problem", true],
  // A decline anywhere in the reply is not consent, even after an opening yes/ok/haan.
  ["Okay, never mind", false],
  ["Ok no, leave it", false],
  ["Sure, no need", false],
  ["ok forget it", false],
  ["haan, mat bhejo", false],
  ["haan mat bhejo", false],
  ["haan haan mat bhejo", false],
  ["theek hai, mat bhejna", false],
  ["Haan, rehne do", false],
  ["ok, no", false],
  ["yes no", false],
  ["yes forget it", false],
  // "Haan?" is "pardon?", not consent.
  ["Haan?", false],
  ["haan kya", false],
  ["ok what", false],
  // Words after the yes that are about something else.
  ["Yes, the weather is bad today", false],
];

for (const [text, expected, todo] of AFFIRMATIVE) {
  test(`isAffirmative(${JSON.stringify(text)}) is ${expected}`, todo ? { todo } : {}, () => {
    assert.equal(isAffirmative(text), expected);
  });
}

const NEGATIVE: Case[] = [
  ["no", true],
  ["No.", true],
  ["nahi", true],
  ["don't send", true],
  ["wait", true],
  ["cancel", true],
  ["नहीं", true],
  ["मत भेजो", true],
  ["yes", false],
  ["haan", false],
  ["no I don't think I will be sending that today at all", false],
  ["", false],
  ["rehne do", true],
  ["not now", true],
  ["never mind", true],
  ["no problem, send it", false],
];

for (const [text, expected, todo] of NEGATIVE) {
  test(`isNegative(${JSON.stringify(text)}) is ${expected}`, todo ? { todo } : {}, () => {
    assert.equal(isNegative(text), expected);
  });
}

test("the household's names may follow the yes", () => {
  assert.equal(isAffirmative("yes, send it to Priya", ["Priya", "Ravi"]), true);
  assert.equal(isAffirmative("yes, send it to Priya"), false);
  assert.equal(isAffirmative("haan, Ravi ko bhej do", ["Priya", "Ravi"]), false); // "ko" is not in the tail allowlist
});

const DECLINES: Case[] = [
  ["No no, do not send it to Priya, she is busy today", true],
  ["nahi beta abhi mat bhejo baad mein", true],
  ["Okay, never mind", true],
  ["rehne do", true],
  ["मत भेजो", true],
  ["yes", false],
  ["haan", false],
  ["no problem, send it", false],
  ["haan bhej do na", false],
  ["", false],
];

for (const [text, expected] of DECLINES) {
  test(`declines(${JSON.stringify(text)}) is ${expected}`, () => {
    assert.equal(declines(text), expected);
  });
}

const REAL: Case[] = [
  ["Are you real?", true],
  ["are you a robot", true],
  ["R u human?", true],
  ["Is this really Priya?", true],
  ["Is this actually you, Priya?", true],
  ["Am I talking to a computer?", true],
  ["sach mein tum ho?", true],
  ["क्या तुम असली हो", true],
  ["Are you okay?", false],
  ["How was your day?", false],
  ["Will you come for Diwali?", false],
  ["I really liked the song", false],
  ["is it really raining", false],
  ["is this really the bus to Jayanagar", false],
  ["Are you really Priya?", true],
  ["Are you Priya?", true],
  ["are you my daughter", true],
  ["are you really my daughter", true],
  ["is that really you", true],
  ["is this you priya", true],
  ["am i talking to priya", true],
  ["are you a bot", true],
  ["kya tum sach mein priya ho", true],
  ["tum sach mein priya ho", true],
  ["क्या तुम सच में प्रिया हो", true],
  ["kya tum robot ho", true],
  ["क्या तुम रोबोट हो", true],
  ["तुम असली हो", true],
  ["are you really coming", false],
  ["are you priya's friend", false],
];

for (const [text, expected, todo] of REAL) {
  test(`asksIfReal(${JSON.stringify(text)}) is ${expected}`, todo ? { todo } : {}, () => {
    assert.equal(asksIfReal(text, "Priya"), expected);
  });
}

test("asksIfReal uses the household's child name", () => {
  assert.equal(asksIfReal("Are you really Ravi?", "Ravi"), true);
  assert.equal(asksIfReal("Are you really Priya?", "Ravi"), false);
  assert.equal(asksIfReal("are you a.b?", "a.b"), true); // the name is regex-escaped
});
