// Tap-to-talk with the browser's speech recognition (Chrome and Safari). Note for the README:
// browser recognition sends audio to Google or Apple; Amazon Transcribe is the production path.
//
// Tuned for older speakers: it keeps listening through short pauses and only finishes after
// about 2 s of silence (or when they tap Done), and it never throws away words it heard because
// the browser had not marked them "final" yet.

type Result = { 0: { transcript: string }; isFinal: boolean };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<Result> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
};

const Ctor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export const canListen = Boolean(Ctor);

// Recognition language for a household: its own setting, English (India) for older households.
export const speechLang = (language?: string) => (language === "hi-IN" || language === "en-US" ? language : "en-IN");

export type Listening = { done: Promise<string>; stop(): void };

export function listen(opts: { lang?: string; onInterim?: (text: string) => void; silenceMs?: number; maxMs?: number } = {}): Listening {
  if (!Ctor) return { done: Promise.reject(new Error("speech_unsupported")), stop() {} };
  const rec = new Ctor();
  rec.lang = opts.lang ?? "en-IN";
  rec.continuous = true; // do not stop at the first pause
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let heard = "";
  let silence: ReturnType<typeof setTimeout> | undefined;
  const silenceMs = opts.silenceMs ?? 2000;
  const stop = () => {
    clearTimeout(silence);
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  };
  // Nobody spoke at all within 8 s, or a very long turn: finish anyway.
  const firstWords = setTimeout(() => !heard && stop(), 8000);
  const cap = setTimeout(stop, opts.maxMs ?? 30000);

  const done = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      heard = Array.from(e.results).map((r) => r[0].transcript).join(" ").replace(/\s+/g, " ").trim();
      opts.onInterim?.(heard);
      clearTimeout(silence);
      silence = setTimeout(stop, silenceMs);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // onend still fires
      clearTimeout(firstWords);
      clearTimeout(cap);
      reject(new Error(e.error));
    };
    rec.onend = () => {
      clearTimeout(firstWords);
      clearTimeout(cap);
      clearTimeout(silence);
      resolve(heard); // final or not: keep every word that was heard
    };
  });
  rec.start();
  return { done, stop };
}
