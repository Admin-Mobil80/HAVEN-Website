import { createHmac, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";
import { activeIncident, ackIncident } from "../domain/incidents.js";
import { wasPromptedByHaven } from "../domain/metrics.js";
import { CAPS, type FamilyMessage, type Household, type Member } from "../domain/types.js";
import { capPush, DAY, istDate, nextId } from "../domain/util.js";
import type { WhatsAppClient } from "../notify/whatsappClient.js";
import { mediaKey, type S3MediaStore } from "../store/s3Media.js";
import type { Repo } from "../store/repo.js";

// Meta's WhatsApp webhook. Everything is done inline before answering 200 (Lambda freezes after
// the response), deduplicated by message id (Meta retries for up to 7 days), and only for phones
// mapped to a household. Priya's replies never reach the LLM: buttons map to fixed actions, and
// her voice notes are stored and played to Amma as the real Priya.

export type WebhookDeps = {
  repo: Repo;
  client: WhatsAppClient;
  appSecret: string;
  verifyToken: string;
  media?: Pick<S3MediaStore, "put" | "getBytes">;
  voiceNote?: (text: string) => Promise<Buffer>; // Polly ogg_opus
  now: () => Date;
};

type WaMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: { type?: string; button_reply?: { id?: string; title?: string } };
  audio?: { id?: string; mime_type?: string };
  context?: { id?: string };
};

type Payload = { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] };

export function signatureValid(raw: Buffer, header: string | undefined, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(raw).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Template quick replies arrive as type "button"; free-form reply buttons as "interactive".
export function actionOf(m: WaMessage): "play_voice_note" | "call_tonight" | "calling_now" | "audio" | "text" | undefined {
  const label = (m.button?.payload ?? m.button?.text ?? m.interactive?.button_reply?.id ?? m.interactive?.button_reply?.title ?? "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
  if (/^play( voice note)?$|play voice note/.test(label)) return "play_voice_note";
  if (/call tonight|i will call|i ll call/.test(label)) return "call_tonight";
  if (/calling now|^calling/.test(label)) return "calling_now";
  if (m.type === "audio" && m.audio?.id) return "audio";
  if (m.type === "text" && m.text?.body) return "text";
  return undefined;
}

export function webhooksRouter(deps: WebhookDeps): Router {
  const router = Router();

  router.get("/webhooks/whatsapp", (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    if (q["hub.mode"] === "subscribe" && typeof q["hub.verify_token"] === "string" && safeEqual(q["hub.verify_token"], deps.verifyToken)) {
      return void res.type("text/plain").send(String(q["hub.challenge"] ?? ""));
    }
    res.sendStatus(403);
  });

  router.post("/webhooks/whatsapp", express.raw({ type: "*/*", limit: "3mb" }), async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!signatureValid(raw, req.header("x-hub-signature-256"), deps.appSecret)) return void res.sendStatus(401);
    let payload: Payload;
    try {
      payload = JSON.parse(raw.toString("utf8")) as Payload;
    } catch {
      return void res.sendStatus(400);
    }
    const messages = (payload.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
    for (const m of messages) {
      try {
        await handle(m, deps);
      } catch (err) {
        console.error(JSON.stringify({ msg: "whatsapp_webhook_failed", type: m.type, error: (err as Error).message }));
      }
    }
    // Statuses (sent/delivered/read/played) need no action yet; acknowledging stops retries.
    res.sendStatus(200);
  });

  return router;
}

async function handle(m: WaMessage, deps: WebhookDeps) {
  if (!m.id || !m.from || !(await deps.repo.claimOnce(`WAMSG#${m.id}`, 7 * 24 * 3600))) return;
  const hh = await deps.repo.householdForPhone(m.from);
  if (!hh) return void console.warn(JSON.stringify({ msg: "whatsapp_unknown_sender" }));
  const now = deps.now();
  const action = actionOf(m);

  // Any inbound message reopens the 24 h window for this member.
  const member = await deps.repo.update(hh, (doc) => {
    const mem = doc.members.find((x) => x.phone === m.from);
    if (mem) mem.lastInboundAt = now.toISOString();
    return mem ? { ...mem } : undefined;
  });
  if (!member) return;
  const reply = (text: string) => deps.client.sendText(m.from, text).catch((e: Error) => console.warn("whatsapp reply failed:", e.message));

  switch (action) {
    case "call_tonight": {
      const calledBy = await deps.repo.update(hh, (doc) => {
        const at = now.toISOString();
        capPush(doc.messages, { id: nextId(doc, "fm"), from: member.id, kind: "call_promise", text: `${member.name} will call tonight`, createdAt: at }, CAPS.messages);
        capPush(doc.reminders, { id: nextId(doc, "r"), text: `${member.name} will call tonight`, due: `${istDate(now)}T20:00:00+05:30`, source: "call_promise", confirmedBy: member.id }, CAPS.reminders);
        return doc.elder.calledBy;
      });
      return void (await reply(`Thank you! Haven will tell ${calledBy} you'll call tonight.`));
    }
    case "calling_now": {
      const acked = await deps.repo.update(hh, (doc) => {
        const incident = activeIncident(doc);
        const prompted = wasPromptedByHaven(doc, now);
        capPush(doc.contacts, { id: nextId(doc, "c"), type: "call", by: member.id, at: now.toISOString(), promptedByHaven: prompted }, CAPS.contacts);
        if (incident && incident.state === "open") ackIncident(doc, incident.id, member.id, now);
        return Boolean(incident);
      });
      return void (await reply(acked ? "Thank you. Haven has marked the alert as seen by you." : "Thank you. Haven has noted your call."));
    }
    case "play_voice_note":
      return void (await sendDigestVoiceNote(hh, m.from, deps));
    case "audio":
      return void (await storeVoiceReply(hh, member, m, deps, reply));
    case "text": {
      const calledBy = await deps.repo.update(hh, (doc) => {
        capPush(doc.messages, { id: nextId(doc, "fm"), from: member.id, kind: "text", text: m.text!.body!.slice(0, 500), createdAt: now.toISOString() }, CAPS.messages);
        return doc.elder.calledBy;
      });
      return void (await reply(`Got it. Haven will pass this on to ${calledBy}.`));
    }
    default:
      return;
  }
}

async function sendDigestVoiceNote(hh: string, to: string, deps: WebhookDeps) {
  const doc = await deps.repo.get(hh);
  const digest = doc?.digests.at(-1);
  if (!doc || !digest) return void (await deps.client.sendText(to, "There's no update yet today. Haven sends one every evening."));
  let audio = digest.voiceNoteKey && deps.media ? await deps.media.getBytes(digest.voiceNoteKey) : undefined;
  if (!audio && deps.voiceNote) audio = await deps.voiceNote(digest.summary);
  if (!audio) return void (await deps.client.sendText(to, digest.summary));
  const mediaId = await deps.client.uploadMedia(audio, "audio/ogg");
  await deps.client.sendAudio(to, mediaId);
}

// Priya's own voice reply: stored, then played to Amma as the real Priya. It answers the deferral
// it replies to: the oldest deferral still open from the last day, else it is a plain voice message.
async function storeVoiceReply(hh: string, member: Member, m: WaMessage, deps: WebhookDeps, reply: (t: string) => Promise<unknown>) {
  if (!deps.media) return void (await reply("Sorry, Haven can't take voice notes right now."));
  const now = deps.now();
  const doc0 = await deps.repo.get(hh);
  if (!doc0) return;
  const { data, mimeType } = await deps.client.downloadMedia(m.audio!.id!);
  const key = mediaKey(hh, doc0.demo, `voice/${m.id.replace(/[^A-Za-z0-9_-]/g, "").slice(-40)}.ogg`);
  await deps.media.put(key, data, mimeType);
  const calledBy = await deps.repo.update(hh, (doc) => {
    const at = now.toISOString();
    const deferral = pickDeferral(doc, now);
    const message: FamilyMessage = { id: nextId(doc, "fm"), from: member.id, kind: deferral ? "deferral_answer" : "voice", audioKey: key, inReplyTo: deferral?.id, createdAt: at };
    capPush(doc.messages, message, CAPS.messages);
    if (deferral) Object.assign(deferral, { status: "answered", answeredAt: at, answerMessageId: message.id });
    return doc.elder.calledBy;
  });
  await reply(`Got your voice note. Haven will play it to ${calledBy} in your own voice.`);
}

function pickDeferral(doc: Household, now: Date) {
  return doc.deferrals.find((d) => d.status === "open" && now.getTime() - Date.parse(d.createdAt) < DAY);
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
