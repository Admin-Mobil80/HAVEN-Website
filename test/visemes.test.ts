import assert from "node:assert/strict";
import { test } from "node:test";
import { TAIL_MS, toMouthTimeline, visemeToMouth, type SpeechMark } from "../src/voice/visemes.js";

const v = (time: number, value: string): SpeechMark => ({ time, type: "viseme", value });
const w = (time: number, value: string): SpeechMark => ({ time, type: "word", value });

test("every Polly viseme maps to one of the 5 mouths", () => {
  const expected: Record<string, string> = {
    sil: "rest",
    p: "closed",
    t: "narrow",
    S: "narrow",
    T: "narrow",
    f: "narrow",
    k: "narrow",
    s: "narrow",
    r: "narrow",
    a: "open",
    "@": "open",
    e: "open",
    E: "open",
    i: "open",
    o: "round",
    O: "round",
    u: "round",
  };
  for (const [viseme, mouth] of Object.entries(expected)) assert.equal(visemeToMouth(viseme), mouth, viseme);
  assert.equal(visemeToMouth("x?"), "narrow", "unknown visemes keep the mouth moving");
});

test("timeline starts at rest, merges consecutive duplicates and ends at rest after the last word", () => {
  const marks: SpeechMark[] = [
    w(6, "Hi"),
    v(6, "k"),
    v(60, "a"),
    v(120, "i"), // same mouth as "a": merged
    w(200, "Amma"),
    v(200, "a"), // still open: merged
    v(260, "p"),
    v(320, "@"),
  ];
  assert.deepEqual(toMouthTimeline(marks), [
    { t: 0, mouth: "rest" },
    { t: 6, mouth: "narrow" },
    { t: 60, mouth: "open" },
    { t: 260, mouth: "closed" },
    { t: 320, mouth: "open" },
    { t: 320 + TAIL_MS, mouth: "rest" },
  ]);
});

test("timeline is sorted even when marks arrive out of order", () => {
  const tl = toMouthTimeline([v(300, "o"), w(0, "So"), v(100, "s"), w(250, "go"), v(250, "a")]);
  assert.deepEqual(
    tl.map((x) => x.t),
    [0, 100, 250, 300, 300 + TAIL_MS],
  );
  for (let i = 1; i < tl.length; i++) {
    assert.ok(tl[i].t > tl[i - 1].t);
    assert.notEqual(tl[i].mouth, tl[i - 1].mouth);
  }
});

test("a viseme at 0 ms replaces the initial rest instead of duplicating the instant", () => {
  assert.deepEqual(toMouthTimeline([v(0, "p"), v(80, "a"), w(0, "Pa")]), [
    { t: 0, mouth: "closed" },
    { t: 80, mouth: "open" },
    { t: 80 + TAIL_MS, mouth: "rest" },
  ]);
});

test("a trailing sil already rests the mouth, and the tail rest is not duplicated", () => {
  const tl = toMouthTimeline([w(10, "Ha"), v(10, "k"), v(90, "a"), v(400, "sil")]);
  assert.deepEqual(tl[tl.length - 1], { t: 400, mouth: "rest" });
  assert.equal(tl.filter((x) => x.mouth === "rest").length, 2);
});

test("the tail rest follows a word mark that comes after the last viseme", () => {
  const tl = toMouthTimeline([v(10, "a"), w(500, "hmm")]);
  assert.deepEqual(tl[tl.length - 1], { t: 500 + TAIL_MS, mouth: "rest" });
});

test("no marks gives a resting mouth", () => {
  assert.deepEqual(toMouthTimeline([]), [{ t: 0, mouth: "rest" }]);
});
