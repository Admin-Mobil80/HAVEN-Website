import express, { Router } from "express";
import { z } from "zod";
import { CAPS, DEFER_TOPICS, type FamilyMessage, type Household } from "../domain/types.js";
import { capPush, DAY, istDate, nextId } from "../domain/util.js";
import { requireHousehold } from "../http/households.js";
import { signMediaUrl } from "../http/media.js";
import { householdWriteLimit, type HouseholdLimiter } from "../http/security.js";
import { mediaKey } from "../store/s3Media.js";
import type { Repo } from "../store/repo.js";
import { apiErrors } from "./api.js";

// Family-side actions used by Priya's view and the setup page. Human-only, like api.ts: none has
// an MCP equivalent. Recordings go to the media store; the elder hears them as the real Priya.

export type FamilyRouteDeps = {
  repo: Repo;
  secret: string;
  now: () => Date;
  media?: { put(key: string, data: Buffer, contentType: string): Promise<void> };
  householdLimit?: HouseholdLimiter;
};

const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a)(;.*)?$/;

const text = (max: number) => z.string().trim().min(1).max(max);
const SetupBody = z.object({
  elder: z.object({ name: text(40), calledBy: text(20), city: text(40) }).partial().optional(),
  style: z
    .object({
      callsElder: text(20),
      phrases: z.array(text(40)).max(8),
      tone: text(120),
      topicsSheLoves: z.array(text(80)).max(8),
      neverSays: z.array(text(120)).max(8),
    })
    .partial()
    .optional(),
  deferTopics: z.array(z.enum(DEFER_TOPICS)).max(DEFER_TOPICS.length).optional(),
  avoidTopics: z.array(text(80)).max(10).optional(),
  goals: z.object({ baselineCallsPerWeek: z.number().int().min(0).max(21), goalCallsPerWeek: z.number().int().min(1).max(21) }).partial().optional(),
  consents: z.object({ shareSummaries: z.boolean(), likeness: z.boolean() }).partial().optional(),
});

export function setupView(doc: Household) {
  const child = doc.members.find((m) => m.id === doc.persona.childMemberId);
  return {
    elder: { name: doc.elder.name, calledBy: doc.elder.calledBy, city: doc.elder.city, age: doc.elder.age },
    childName: child?.name ?? "",
    displayName: doc.persona.displayName,
    style: doc.persona.style,
    deferTopics: doc.persona.deferTopics,
    avoidTopics: doc.persona.avoidTopics,
    goals: doc.goals,
    consents: {
      shareSummaries: Boolean(doc.consents.shareSummaries && !doc.consents.shareSummaries.revokedAt),
      likeness: Boolean(doc.persona.likenessConsent && !doc.persona.likenessConsent.revokedAt),
      likenessAt: doc.persona.likenessConsent?.at,
    },
  };
}

export function familyRouter(deps: FamilyRouteDeps): Router {
  const router = Router();
  const auth = requireHousehold(deps.secret);
  const write = householdWriteLimit(deps.householdLimit);
  const hh = (res: express.Response) => res.locals.householdId as string;
  const primaryId = (doc: Household) => (doc.members.find((m) => m.role === "primary") ?? doc.members[0])?.id ?? "family";

  // Priya records a reply in the browser (MediaRecorder). It answers the deferral when one is given.
  router.post("/api/recordings", auth, write, express.raw({ type: (r) => AUDIO_TYPES.test(String(r.headers["content-type"] ?? "")), limit: "4mb" }), async (req, res) => {
    const type = req.header("content-type") ?? "";
    if (!AUDIO_TYPES.test(type) || !Buffer.isBuffer(req.body) || req.body.length < 200) return void res.status(400).json({ error: "invalid_audio" });
    if (!deps.media) return void res.status(503).json({ error: "media_store_not_configured" });
    const deferralId = typeof req.query.deferral === "string" ? req.query.deferral.slice(0, 40) : undefined;
    const doc = await deps.repo.get(hh(res));
    if (!doc) return void res.status(404).json({ error: "household_not_found" });
    const ext = /mp4|m4a|aac/.test(type) ? "m4a" : /mpeg/.test(type) ? "mp3" : /ogg/.test(type) ? "ogg" : "webm";
    const key = mediaKey(doc.id, doc.demo, `voice/rec-${deps.now().getTime()}.${ext}`);
    await deps.media.put(key, req.body, type.split(";")[0]);
    const at = deps.now().toISOString();
    const out = await deps.repo.update(hh(res), (d) => {
      const deferral = deferralId ? d.deferrals.find((x) => x.id === deferralId && x.status === "open") : undefined;
      const message: FamilyMessage = { id: nextId(d, "fm"), from: primaryId(d), kind: deferral ? "deferral_answer" : "voice", audioKey: key, inReplyTo: deferral?.id, createdAt: at };
      capPush(d.messages, message, CAPS.messages);
      if (deferral) Object.assign(deferral, { status: "answered", answeredAt: at, answerMessageId: message.id });
      return { messageId: message.id, answered: deferral?.id };
    });
    res.status(201).json({ ok: true, ...out });
  });

  // Same as the WhatsApp "I will call tonight" button, for the dashboard and judge mode.
  router.post("/api/call-promise", auth, write, async (_req, res) => {
    const now = deps.now();
    const out = await deps.repo.update(hh(res), (d) => {
      const by = d.members.find((m) => m.id === primaryId(d));
      const name = by?.name ?? "Your family";
      const recent = d.messages.some((m) => m.kind === "call_promise" && !m.playedAt && now.getTime() - Date.parse(m.createdAt) < DAY);
      if (recent) return { duplicate: true };
      capPush(d.messages, { id: nextId(d, "fm"), from: primaryId(d), kind: "call_promise", text: `${name} will call tonight`, createdAt: now.toISOString() }, CAPS.messages);
      capPush(d.reminders, { id: nextId(d, "r"), text: `${name} will call tonight`, due: `${istDate(now)}T20:00:00+05:30`, source: "call_promise", confirmedBy: primaryId(d) }, CAPS.reminders);
      return { duplicate: false };
    });
    res.status(201).json({ ok: true, ...out });
  });

  router.get("/api/setup", auth, async (_req, res) => {
    const doc = await deps.repo.get(hh(res));
    if (!doc) return void res.status(404).json({ error: "household_not_found" });
    res.set("Cache-Control", "no-store").json(setupView(doc));
  });

  router.post("/api/setup", auth, write, express.json({ limit: "32kb" }), async (req, res) => {
    const parsed = SetupBody.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: "invalid_body" });
    const b = parsed.data;
    const at = deps.now().toISOString();
    const view = await deps.repo.update(hh(res), (d) => {
      if (b.elder) Object.assign(d.elder, b.elder);
      if (b.style) Object.assign(d.persona.style, b.style);
      if (b.deferTopics) d.persona.deferTopics = b.deferTopics;
      if (b.avoidTopics) d.persona.avoidTopics = b.avoidTopics;
      if (b.goals) Object.assign(d.goals, b.goals);
      if (b.consents?.shareSummaries !== undefined) {
        d.consents.shareSummaries = b.consents.shareSummaries ? { by: "kamala", at, witnessedBy: primaryId(d) } : d.consents.shareSummaries && { ...d.consents.shareSummaries, revokedAt: at };
      }
      if (b.consents?.likeness !== undefined) {
        // Revoking the likeness consent switches to the neutral "Haven" companion at once.
        d.persona.likenessConsent = b.consents.likeness ? { by: primaryId(d), at } : d.persona.likenessConsent && { ...d.persona.likenessConsent, revokedAt: at };
        d.persona.mode = b.consents.likeness ? "child" : "neutral";
      }
      return setupView(d);
    });
    res.json(view);
  });

  router.use("/api", apiErrors);
  return router;
}

// Adds short-lived signed URLs next to audio keys in the family view (the browser cannot send
// an Authorization header from an <audio> element).
export function withAudioUrls<T extends { digests: { audioKey?: string }[]; messages: { audioKey?: string }[] }>(view: T, secret: string, now: Date) {
  const sign = (k?: string) => (k ? signMediaUrl(k, secret, now) : undefined);
  return {
    ...view,
    digests: view.digests.map((d) => ({ ...d, audioUrl: sign(d.audioKey) })),
    messages: view.messages.map((m) => ({ ...m, audioUrl: sign(m.audioKey) })),
  };
}
