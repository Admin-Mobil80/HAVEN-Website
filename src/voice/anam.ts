// Anam: the photo-real face. Haven decides every word and makes the audio; Anam only animates a
// face (made from the main user's own photo, with consent) in sync with that audio ("audio
// passthrough"). The API key stays on the server; the browser gets a 1-hour session token.

const BASE = "https://api.anam.ai";

export class AnamError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "AnamError";
  }
}

export class Anam {
  constructor(private readonly apiKey: string, private readonly f: typeof fetch = fetch) {}

  private async call(path: string, init: RequestInit, timeoutMs = 60000) {
    const res = await this.f(`${BASE}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.apiKey}`, ...(init.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const code = String((body.code ?? body.error ?? `http_${res.status}`) as string);
      throw new AnamError(res.status, code, String(body.message ?? code));
    }
    return body;
  }

  // Square JPEG/PNG/WebP, at least 1152 px, under 4.5 MB, face sharp, mouth closed.
  async createAvatar(displayName: string, image: Buffer, mimeType: string): Promise<string> {
    const form = new FormData();
    form.append("displayName", displayName.slice(0, 50).padEnd(3, " "));
    form.append("avatarModel", "cara-4");
    const ext = /png/.test(mimeType) ? "png" : /webp/.test(mimeType) ? "webp" : "jpg";
    form.append("imageFile", new Blob([new Uint8Array(image)], { type: mimeType }), `photo.${ext}`);
    const body = await this.call("/v1/avatars", { method: "POST", body: form }, 120000);
    if (typeof body.id !== "string") throw new AnamError(502, "no_avatar_id", "Avatar creation returned no id");
    return body.id;
  }

  // Avatar-only session: no Anam LLM, no Anam voice. AI disclosure on, session replay off.
  async sessionToken(avatarId: string, label: string): Promise<string> {
    const body = await this.call(
      "/v1/auth/session-token",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientLabel: label.slice(0, 60),
          personaConfig: { avatarId, avatarModel: "cara-4", enableAudioPassthrough: true },
          sessionOptions: { showAIAvatarDisclosure: true, sessionReplay: { enableSessionReplay: false } },
        }),
      },
      15000,
    );
    if (typeof body.sessionToken !== "string") throw new AnamError(502, "no_session_token", "No session token");
    return body.sessionToken;
  }
}
