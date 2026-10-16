// Polly speech marks -> a 5-shape mouth timeline for the Digital Priya avatar.
// Pure and dependency-free so the browser bundle can share the mapping.
//
// Loudness fallback (if viseme density turns out poor for a language, see scripts/polly-check.ts):
// play the mp3 through a Web Audio AnalyserNode, take the RMS of each ~30 ms frame and map it to
// rest (< 0.02), narrow (< 0.08), open (otherwise), with "closed" held for one frame whenever the
// level drops sharply. Keep the word marks for captions either way. No server change is needed.

export type SpeechMark = {
  time: number; // ms from the start of the audio
  type: "viseme" | "word" | "sentence" | "ssml";
  value: string;
  start?: number; // word/sentence marks: UTF-16 index into the original text (remapped by polly.ts)
  end?: number;
};

export const MOUTHS = ["rest", "closed", "narrow", "open", "round"] as const;
export type Mouth = (typeof MOUTHS)[number];

const VISEME_TO_MOUTH: Record<string, Mouth> = {
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

// Unknown values (a future Polly viseme or another language's set) keep the mouth moving rather
// than freezing it shut.
export function visemeToMouth(value: string): Mouth {
  return VISEME_TO_MOUTH[value] ?? "narrow";
}

// Time after the last mark before the mouth relaxes, so the final syllable is not clipped.
export const TAIL_MS = 150;

export function toMouthTimeline(marks: SpeechMark[]): { t: number; mouth: Mouth }[] {
  const timeline: { t: number; mouth: Mouth }[] = [{ t: 0, mouth: "rest" }];
  const push = (t: number, mouth: Mouth) => {
    const last = timeline[timeline.length - 1];
    if (t <= last.t) {
      // Same instant (a viseme at 0 ms): the newer shape wins, then re-check against the one before.
      last.mouth = mouth;
      const prev = timeline[timeline.length - 2];
      if (prev && prev.mouth === mouth) timeline.pop();
      return;
    }
    if (last.mouth !== mouth) timeline.push({ t, mouth });
  };

  const valid = marks.filter((m) => Number.isFinite(m.time) && m.time >= 0);
  const visemes = valid.filter((m) => m.type === "viseme").sort((a, b) => a.time - b.time);
  for (const m of visemes) push(Math.round(m.time), visemeToMouth(m.value));

  const lastWord = Math.max(-1, ...valid.filter((m) => m.type === "word").map((m) => m.time));
  const lastViseme = visemes.length ? visemes[visemes.length - 1].time : -1;
  const lastMark = Math.max(lastWord, lastViseme);
  if (lastMark >= 0) push(Math.round(lastMark) + TAIL_MS, "rest");
  return timeline;
}
