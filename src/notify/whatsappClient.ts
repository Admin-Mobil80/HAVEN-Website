// Thin client for the WhatsApp Cloud API (Graph). Only the calls Haven needs: send text, template,
// reply buttons and audio; upload a voice note; download an inbound recording.

export type WhatsAppConfig = {
  token: string;
  phoneNumberId: string;
  graphVersion?: string; // default v23.0
  fetch?: typeof fetch; // injectable for tests
};

export class WhatsAppError extends Error {
  constructor(readonly status: number, readonly code: number | undefined, message: string) {
    super(message);
    this.name = "WhatsAppError";
  }
}

// Template parameters must not contain newlines, tabs or 4+ consecutive spaces (error 132018).
export function sanitizeParam(s: string, max = 300) {
  const clean = s.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export class WhatsAppClient {
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(private readonly cfg: WhatsAppConfig) {
    this.base = `https://graph.facebook.com/${cfg.graphVersion ?? "v23.0"}`;
    this.f = cfg.fetch ?? fetch;
  }

  sendText(to: string, body: string) {
    return this.send(to, { type: "text", text: { preview_url: false, body: body.slice(0, 4096) } });
  }

  // Up to 3 quick-reply buttons (titles <= 20 chars). Only valid inside the 24 h window.
  sendButtons(to: string, body: string, buttons: { id: string; title: string }[]) {
    return this.send(to, {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body.slice(0, 1024) },
        action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
      },
    });
  }

  sendTemplate(to: string, name: string, params: string[], language = "en") {
    return this.send(to, {
      type: "template",
      template: {
        name,
        language: { code: language },
        components: params.length ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: sanitizeParam(p) })) }] : [],
      },
    });
  }

  // Shown as a voice note (inline play) when it is Ogg Opus and <= 512 KB.
  sendAudio(to: string, mediaId: string) {
    return this.send(to, { type: "audio", audio: { id: mediaId, voice: true } });
  }

  async uploadMedia(data: Buffer, mimeType: string, filename = "voice.ogg"): Promise<string> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append("file", new Blob([new Uint8Array(data)], { type: mimeType }), filename);
    const out = await this.request(`${this.base}/${this.cfg.phoneNumberId}/media`, { method: "POST", body: form });
    if (typeof out.id !== "string") throw new WhatsAppError(502, undefined, "media upload returned no id");
    return out.id;
  }

  // Inbound media: resolve the short-lived URL (valid ~5 min), then fetch the bytes with the token.
  async downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    const meta = await this.request(`${this.base}/${encodeURIComponent(mediaId)}`, { method: "GET" });
    if (typeof meta.url !== "string") throw new WhatsAppError(502, undefined, "media lookup returned no url");
    const res = await this.f(meta.url, { headers: { authorization: `Bearer ${this.cfg.token}` } });
    if (!res.ok) throw new WhatsAppError(res.status, undefined, `media download failed: ${res.status}`);
    return { data: Buffer.from(await res.arrayBuffer()), mimeType: typeof meta.mime_type === "string" ? meta.mime_type : "audio/ogg" };
  }

  private async send(to: string, message: Record<string, unknown>): Promise<string> {
    const out = await this.request(`${this.base}/${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...message }),
    });
    const id = (out.messages as { id?: unknown }[] | undefined)?.[0]?.id;
    if (typeof id !== "string") throw new WhatsAppError(502, undefined, "send returned no message id");
    return id;
  }

  private async request(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const res = await this.f(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${this.cfg.token}` },
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (body.error ?? {}) as { code?: number; message?: string };
      throw new WhatsAppError(res.status, err.code, err.message ?? `whatsapp_http_${res.status}`);
    }
    return body;
  }
}
