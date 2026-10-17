import { AnamEvent, createClient, type AnamClient } from "@anam-ai/js-sdk";
import { api, getToken } from "./api";
import { log } from "./bus";

// The photo-real face (Anam). Haven decides every word: the tablet gets the reply text from
// /api/turn, fetches 16 kHz PCM in the household's voice from /api/tts, and streams it into the
// avatar, which moves its lips and plays the sound. Any failure falls back to the illustrated avatar.

type Stream = ReturnType<AnamClient["createAgentAudioInputStream"]>;
let client: AnamClient | undefined;
let stream: Stream | undefined;
let live = false;
let onClosed: (() => void) | undefined;

export const isLive = () => live;

export async function startPhotoAvatar(videoId: string, closed: () => void): Promise<void> {
  stopPhotoAvatar();
  onClosed = closed;
  const t0 = performance.now();
  const { sessionToken } = await api<{ sessionToken: string }>("/api/avatar/session", { body: {} });
  const c = createClient(sessionToken, { disableInputAudio: true }); // our own speech recognition, never Anam's mic
  client = c;
  const firstFrame = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("avatar_timeout")), 12000);
    c.addListener(AnamEvent.VIDEO_PLAY_STARTED, () => {
      clearTimeout(timer);
      resolve();
    });
  });
  c.addListener(AnamEvent.CONNECTION_CLOSED, (reason: unknown) => {
    live = false;
    log({ source: "tablet", dir: "•", title: `photo avatar closed (${String(reason)})` });
    onClosed?.();
  });
  await c.streamToVideoElement(videoId);
  await firstFrame;
  stream = c.createAgentAudioInputStream({ encoding: "pcm_s16le", sampleRate: 16000, channels: 1 });
  live = true;
  log({ source: "tablet", dir: "•", title: `photo avatar live in ${Math.round(performance.now() - t0)} ms` });
}

// Speak one reply. Resolves roughly when the avatar finishes (audio length + Anam's ~0.8 s buffer).
export async function speakPhoto(text: string): Promise<void> {
  if (!live || !stream) throw new Error("avatar_not_live");
  const token = getToken();
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`tts_${res.status}`);
  const pcm = new Uint8Array(await res.arrayBuffer());
  const CHUNK = 16000; // 0.5 s of 16 kHz 16-bit mono; always an even byte count
  for (let i = 0; i < pcm.length; i += CHUNK) stream.sendAudioChunk(pcm.slice(i, Math.min(i + CHUNK, pcm.length)));
  stream.endSequence();
  const seconds = pcm.length / 32000;
  await new Promise((r) => setTimeout(r, seconds * 1000 + 900));
}

export function interruptPhoto() {
  try {
    client?.interruptPersona();
    stream?.endSequence();
  } catch {
    /* ignore */
  }
}

export function stopPhotoAvatar() {
  live = false;
  onClosed = undefined;
  try {
    client?.stopStreaming();
  } catch {
    /* ignore */
  }
  client = undefined;
  stream = undefined;
}

addEventListener("pagehide", () => stopPhotoAvatar());
