import { getToken } from "./api";
// One shared <audio> element, unlocked by the first tap (Safari and Chrome block audio that a
// page starts on its own). play() resolves when the clip ends; onTime drives the lip-sync.

let el: HTMLAudioElement | undefined;
let unlocked = false;

function element() {
  el ??= new Audio();
  return el;
}

// Call from a click handler before anything plays.
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const a = element();
  a.src = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRBqpAAAAAAD/+xDEAAPAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
  a.play().catch(() => undefined);
}

export function isUnlocked() {
  return unlocked;
}

export type Playback = { stop(): void; done: Promise<void> };

export function playSrc(src: string, onTime?: (ms: number) => void): Playback {
  const a = element();
  a.pause();
  a.src = src;
  let raf = 0;
  const frame = () => {
    onTime?.(a.currentTime * 1000);
    raf = requestAnimationFrame(frame);
  };
  const done = new Promise<void>((resolve) => {
    const finish = () => {
      cancelAnimationFrame(raf);
      onTime?.(Number.POSITIVE_INFINITY);
      a.onended = a.onerror = null;
      resolve();
    };
    a.onended = finish;
    a.onerror = finish;
    a.play()
      .then(() => (raf = requestAnimationFrame(frame)))
      .catch(finish);
  });
  return { stop: () => (a.pause(), a.dispatchEvent(new Event("ended"))), done };
}

export function playBase64(base64: string, contentType: string, onTime?: (ms: number) => void) {
  return playSrc(`data:${contentType};base64,${base64}`, onTime);
}

// The household's voice as 16 kHz PCM from /api/tts (the photo avatar's feed), played through the
// speaker when the live face is unavailable. Wrapped in a WAV header so <audio> can play it.
export async function playTts(text: string): Promise<void> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`tts_${res.status}`);
  const pcm = new Uint8Array(await res.arrayBuffer());
  const head = new DataView(new ArrayBuffer(44));
  const str = (o: number, t: string) => [...t].forEach((c, i) => head.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  head.setUint32(4, 36 + pcm.length, true);
  str(8, "WAVEfmt ");
  head.setUint32(16, 16, true);
  head.setUint16(20, 1, true); // PCM
  head.setUint16(22, 1, true); // mono
  head.setUint32(24, 16000, true);
  head.setUint32(28, 32000, true);
  head.setUint16(32, 2, true);
  head.setUint16(34, 16, true);
  str(36, "data");
  head.setUint32(40, pcm.length, true);
  const url = URL.createObjectURL(new Blob([head.buffer, pcm], { type: "audio/wav" }));
  try {
    await playSrc(url).done;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// No server audio (local run or Polly down): browser speech, with a simple mouth flap.
export function speakBrowser(text: string, opts: { lang?: string; male?: boolean; onSpeaking?: (on: boolean) => void } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang ?? "en-IN";
    u.rate = 0.92;
    const voices = speechSynthesis.getVoices();
    const pick = voices.find((v) => v.lang.startsWith(opts.male ? "en-GB" : "en-IN")) ?? voices.find((v) => v.lang.startsWith("en"));
    if (pick) u.voice = pick;
    u.onstart = () => opts.onSpeaking?.(true);
    u.onend = u.onerror = () => {
      opts.onSpeaking?.(false);
      resolve();
    };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}
