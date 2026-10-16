// Tap-to-talk with the browser's speech recognition (Chrome and Safari). Note for the README:
// browser recognition sends audio to Google or Apple; Amazon Transcribe is the production path.

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: { 0: { transcript: string }; isFinal: boolean }[] }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

const Ctor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export const canListen = Boolean(Ctor);

export function listen(opts: { lang?: string; onInterim?: (text: string) => void } = {}): { done: Promise<string>; stop(): void } {
  if (!Ctor) return { done: Promise.reject(new Error("speech_unsupported")), stop() {} };
  const rec = new Ctor();
  rec.lang = opts.lang ?? "en-IN";
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let finalText = "";
  const done = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      const parts = Array.from(e.results);
      const text = parts.map((r) => r[0].transcript).join(" ").trim();
      opts.onInterim?.(text);
      if (parts.every((r) => r.isFinal)) finalText = text;
    };
    rec.onerror = (e) => (e.error === "no-speech" ? resolve("") : reject(new Error(e.error)));
    rec.onend = () => resolve(finalText);
  });
  rec.start();
  return { done, stop: () => rec.stop() };
}
