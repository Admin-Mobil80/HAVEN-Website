// ElevenLabs: the companion's voice. Either a voice the main user cloned from their own
// recording (with consent), or one they picked from the voice library. Plain fetch, no SDK.

const BASE = "https://api.elevenlabs.io";
export const ELEVEN_MODEL = "eleven_flash_v2_5"; // ~75 ms, Hindi supported, cheapest per character

export class ElevenError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ElevenError";
  }
}

export type LibraryVoice = { voiceId: string; publicOwnerId: string; name: string; accent?: string; gender?: string; age?: string; language?: string; previewUrl?: string; description?: string };

export class ElevenLabs {
  constructor(private readonly apiKey: string, private readonly f: typeof fetch = fetch) {}

  private async call(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
    const res = await this.f(`${BASE}${path}`, {
      ...init,
      headers: { "xi-api-key": this.apiKey, ...(init.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: { message?: string; status?: string } | string };
      const msg = typeof body.detail === "string" ? body.detail : body.detail?.message ?? body.detail?.status ?? `elevenlabs_http_${res.status}`;
      throw new ElevenError(res.status, msg);
    }
    return res;
  }

  // Shared library voices for the picker: Indian English first, then Hindi.
  async libraryVoices(opts: { language?: string; accent?: string; gender?: string; pageSize?: number } = {}): Promise<LibraryVoice[]> {
    const q = new URLSearchParams({ page_size: String(opts.pageSize ?? 24), sort: "trending" });
    if (opts.language) q.set("language", opts.language);
    if (opts.accent) q.set("accent", opts.accent);
    if (opts.gender) q.set("gender", opts.gender);
    const res = await this.call(`/v1/shared-voices?${q}`);
    const body = (await res.json()) as { voices?: Record<string, unknown>[] };
    return (body.voices ?? []).map((v) => ({
      voiceId: String(v.voice_id),
      publicOwnerId: String(v.public_owner_id),
      name: String(v.name ?? "Voice"),
      accent: v.accent as string | undefined,
      gender: v.gender as string | undefined,
      age: v.age as string | undefined,
      language: v.language as string | undefined,
      previewUrl: v.preview_url as string | undefined,
      description: typeof v.description === "string" ? v.description.slice(0, 160) : undefined,
    }));
  }

  // A library voice must be added to the account before TTS can use it.
  async addLibraryVoice(publicOwnerId: string, voiceId: string, newName: string): Promise<string> {
    const res = await this.call(`/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ new_name: newName.slice(0, 60) }),
    });
    return String(((await res.json()) as { voice_id?: string }).voice_id);
  }

  // Instant voice clone from the user's own recording (1-2 minutes, one speaker).
  async cloneVoice(name: string, audio: Buffer, mimeType: string, labels: Record<string, string> = {}): Promise<{ voiceId: string; requiresVerification: boolean }> {
    const form = new FormData();
    form.append("name", name.slice(0, 60));
    const ext = /mp4|m4a|aac/.test(mimeType) ? "m4a" : /mpeg|mp3/.test(mimeType) ? "mp3" : /ogg/.test(mimeType) ? "ogg" : /wav/.test(mimeType) ? "wav" : "webm";
    form.append("files", new Blob([new Uint8Array(audio)], { type: mimeType }), `sample.${ext}`);
    form.append("description", "Haven companion voice, cloned with the owner's recorded consent.");
    form.append("labels", JSON.stringify(labels));
    const res = await this.call("/v1/voices/add", { method: "POST", body: form }, 60000);
    const body = (await res.json()) as { voice_id?: string; requires_verification?: boolean };
    return { voiceId: String(body.voice_id), requiresVerification: Boolean(body.requires_verification) };
  }

  async deleteVoice(voiceId: string) {
    await this.call(`/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE" });
  }

  // Raw 16 kHz 16-bit mono PCM: exactly what the Anam avatar's audio passthrough expects.
  async pcm(voiceId: string, text: string, language?: string): Promise<Buffer> {
    const res = await this.call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=pcm_16000`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: ELEVEN_MODEL, ...(language ? { language_code: language } : {}) }),
    });
    return Buffer.from(await res.arrayBuffer());
  }

  // mp3 plus character timings, for the illustrated avatar's mouth when no video avatar is on.
  async mp3WithTimings(voiceId: string, text: string, language?: string): Promise<{ audio: Buffer; chars: string[]; starts: number[] }> {
    const res = await this.call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: ELEVEN_MODEL, ...(language ? { language_code: language } : {}) }),
    });
    const body = (await res.json()) as { audio_base64?: string; alignment?: { characters?: string[]; character_start_times_seconds?: number[] } };
    return { audio: Buffer.from(body.audio_base64 ?? "", "base64"), chars: body.alignment?.characters ?? [], starts: (body.alignment?.character_start_times_seconds ?? []).map((s) => Math.round(s * 1000)) };
  }
}

// Character timings to the five mouth shapes the illustrated avatar draws.
export function charsToMouths(chars: string[], starts: number[]): { t: number; mouth: "rest" | "closed" | "narrow" | "open" | "round" }[] {
  const out: { t: number; mouth: "rest" | "closed" | "narrow" | "open" | "round" }[] = [{ t: 0, mouth: "rest" }];
  chars.forEach((c, i) => {
    const ch = c.toLowerCase();
    const mouth = /[mbp]/.test(ch) ? "closed" : /[ou]/.test(ch) ? "round" : /[aei]/.test(ch) ? "open" : /[a-z]/.test(ch) ? "narrow" : "rest";
    if (out[out.length - 1].mouth !== mouth) out.push({ t: starts[i] ?? 0, mouth });
  });
  const end = (starts[starts.length - 1] ?? 0) + 150;
  out.push({ t: end, mouth: "rest" });
  return out;
}
