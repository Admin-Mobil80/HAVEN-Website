import express, { Router, type Response } from "express";
import { z } from "zod";
import { people } from "../domain/people.js";
import { istDate } from "../domain/util.js";
import { requireHousehold } from "../http/households.js";
import { householdWriteLimit, type HouseholdLimiter } from "../http/security.js";
import type { Repo } from "../store/repo.js";
import { AnamError, type Anam } from "../voice/anam.js";
import { ElevenError, type ElevenLabs, type LibraryVoice } from "../voice/eleven.js";
import { apiErrors } from "./api.js";
import { mediaKey } from "../store/s3Media.js";

// The companion's voice and face, both from the main user and both with consent:
// - voice: clone from their own recording (ElevenLabs) or pick a library voice; default Polly
// - face: a photo-real Anam avatar from their own photo; default the illustrated avatar
// /api/tts gives the avatar raw PCM in the household's voice. Daily caps bound the cost.

export type LikenessDeps = {
  repo: Repo;
  secret: string;
  now: () => Date;
  eleven?: () => Promise<ElevenLabs | undefined>;
  anam?: () => Promise<Anam | undefined>;
  pollyPcm?: (text: string) => Promise<Buffer>;
  media?: { put(key: string, data: Buffer, contentType: string): Promise<void> };
  householdLimit?: HouseholdLimiter;
  limits?: { ttsCharsPerDay?: number; clonesPerDay?: number; avatarsPerDay?: number };
};

const AUDIO = /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav|x-wav)(;.*)?$/;
const IMAGE = /^image\/(jpeg|png|webp)$/;

export function likenessRouter(deps: LikenessDeps): Router {
  const router = Router();
  const auth = requireHousehold(deps.secret);
  const write = householdWriteLimit(deps.householdLimit);
  const hh = (res: Response) => res.locals.householdId as string;
  const limits = { ttsCharsPerDay: 20000, clonesPerDay: 15, avatarsPerDay: 15, ...deps.limits };
  const fail = (res: Response, err: unknown) => {
    if (err instanceof ElevenError || err instanceof AnamError) {
      console.warn(JSON.stringify({ msg: "likeness_provider_error", provider: err.name, status: err.status, error: err.message.slice(0, 200) }));
      return void res.status(err.status === 429 ? 429 : 502).json({ error: err instanceof AnamError ? `avatar_${err.code}` : "voice_provider_error", detail: err.message.slice(0, 200) });
    }
    throw err;
  };
  const dailyGlobal = async (what: string, max: number) => (await deps.repo.incrCounter(`${what}#${istDate(deps.now())}`, 1, 2 * 24 * 3600)) <= max;

  let libraryCache: { at: number; voices: LibraryVoice[] } | undefined;

  router.get("/api/voices", auth, async (_req, res) => {
    const doc = await deps.repo.get(hh(res));
    if (!doc) return void res.status(404).json({ error: "household_not_found" });
    const eleven = await deps.eleven?.();
    let library: LibraryVoice[] = [];
    let libraryError: string | undefined;
    if (eleven) {
      if (!libraryCache || Date.now() - libraryCache.at > 10 * 60_000) {
        const note = (e: Error) => ((libraryError = e.message.slice(0, 200)), [] as LibraryVoice[]);
        const [en, hi] = await Promise.all([
          eleven.libraryVoices({ language: "en", accent: "indian", pageSize: 18 }).catch(note),
          eleven.libraryVoices({ language: "hi", pageSize: 12 }).catch(note),
        ]);
        // Only cache a good answer, so a fixed API key is picked up on the next request.
        if (!libraryError) libraryCache = { at: Date.now(), voices: [...en, ...hi] };
        library = [...en, ...hi];
      } else library = libraryCache.voices;
    }
    res.set("Cache-Control", "no-store").json({ available: Boolean(eleven), current: doc.persona.voice ? { name: doc.persona.voice.name, source: doc.persona.voice.source } : null, library, libraryError });
  });

  const SelectBody = z.object({ voiceId: z.string().trim().min(1).max(64), publicOwnerId: z.string().trim().min(1).max(128), name: z.string().trim().min(1).max(60) });
  router.post("/api/voice/select", auth, write, express.json({ limit: "8kb" }), async (req, res) => {
    const eleven = await deps.eleven?.();
    if (!eleven) return void res.status(503).json({ error: "voice_not_configured" });
    const b = SelectBody.safeParse(req.body ?? {});
    if (!b.success) return void res.status(400).json({ error: "invalid_body" });
    try {
      const voiceId = await eleven.addLibraryVoice(b.data.publicOwnerId, b.data.voiceId, `Haven ${b.data.name}`);
      // Some accounts (e.g. ElevenLabs Free) can add a library voice but not speak with it via the API.
      // Try one short line first so the user hears about it now, not as silence later.
      await eleven.pcm(voiceId, "Hello.");
      await deps.repo.update(hh(res), (d) => void (d.persona.voice = { provider: "elevenlabs", voiceId, name: b.data.name, source: "library" }));
      res.json({ ok: true, voice: { name: b.data.name, source: "library" } });
    } catch (err) {
      fail(res, err);
    }
  });

  // The user's own voice: 1-2 minutes of them reading, after ticking a consent box and saying the
  // consent line on the recording. Replaces (and deletes) an earlier clone for this household.
  router.post("/api/voice/clone", auth, write, express.raw({ type: (r) => AUDIO.test(String(r.headers["content-type"] ?? "")), limit: "12mb" }), async (req, res) => {
    const eleven = await deps.eleven?.();
    if (!eleven) return void res.status(503).json({ error: "voice_not_configured" });
    if (req.query.consent !== "yes") return void res.status(400).json({ error: "consent_required" });
    const type = String(req.header("content-type") ?? "").split(";")[0];
    if (!AUDIO.test(type) || !Buffer.isBuffer(req.body) || req.body.length < 20_000) return void res.status(400).json({ error: "recording_too_short" });
    if (!(await dailyGlobal("CLONES", limits.clonesPerDay))) return void res.status(429).json({ error: "daily_clone_limit" });
    const doc = await deps.repo.get(hh(res));
    if (!doc) return void res.status(404).json({ error: "household_not_found" });
    const p = people(doc);
    try {
      const out = await eleven.cloneVoice(`Haven ${p.user} ${doc.id.slice(-6)}`, req.body, type, { use: "haven-companion" });
      const old = doc.persona.voice?.source === "cloned" ? doc.persona.voice.voiceId : undefined;
      const at = deps.now().toISOString();
      await deps.repo.update(hh(res), (d) => void (d.persona.voice = { provider: "elevenlabs", voiceId: out.voiceId, name: `${p.user}'s voice (AI)`, source: "cloned", consent: { by: d.persona.childMemberId, at } }));
      if (old) await eleven.deleteVoice(old).catch(() => undefined);
      res.status(201).json({ ok: true, voice: { name: `${p.user}'s voice (AI)`, source: "cloned" }, requiresVerification: out.requiresVerification });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post("/api/voice/reset", auth, write, async (_req, res) => {
    const doc = await deps.repo.update(hh(res), (d) => {
      const old = d.persona.voice;
      d.persona.voice = undefined;
      return old;
    });
    if (doc?.source === "cloned") await (await deps.eleven?.())?.deleteVoice(doc.voiceId).catch(() => undefined);
    res.json({ ok: true });
  });

  // A photo-real face from the user's own photo (square, at least 1152 px, face clear, mouth closed).
  router.post("/api/avatar/photo", auth, write, express.raw({ type: (r) => IMAGE.test(String(r.headers["content-type"] ?? "")), limit: "5mb" }), async (req, res) => {
    const anam = await deps.anam?.();
    if (!anam) return void res.status(503).json({ error: "avatar_not_configured" });
    if (req.query.consent !== "yes") return void res.status(400).json({ error: "consent_required" });
    const type = String(req.header("content-type") ?? "");
    if (!IMAGE.test(type) || !Buffer.isBuffer(req.body) || req.body.length < 10_000) return void res.status(400).json({ error: "invalid_image" });
    if (!(await dailyGlobal("AVATARS", limits.avatarsPerDay))) return void res.status(429).json({ error: "daily_avatar_limit" });
    const doc = await deps.repo.get(hh(res));
    if (!doc) return void res.status(404).json({ error: "household_not_found" });
    try {
      const avatarId = await anam.createAvatar(`Haven ${people(doc).user}`, req.body, type);
      const at = deps.now().toISOString();
      // A still of the same photo, shown on the tablet while it is asleep.
      const photoKey = deps.media ? mediaKey(doc.id, doc.demo, `avatar/${avatarId}.jpg`) : undefined;
      if (photoKey) await deps.media!.put(photoKey, req.body, type).catch(() => undefined);
      await deps.repo.update(hh(res), (d) => void (d.persona.avatar = { provider: "anam", avatarId, photoKey, consent: { by: d.persona.childMemberId, at } }));
      res.status(201).json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post("/api/avatar/reset", auth, write, async (_req, res) => {
    await deps.repo.update(hh(res), (d) => void (d.persona.avatar = undefined));
    res.json({ ok: true });
  });

  router.post("/api/avatar/session", auth, async (_req, res) => {
    const anam = await deps.anam?.();
    const doc = await deps.repo.get(hh(res));
    if (!anam || !doc?.persona.avatar || doc.persona.mode === "neutral") return void res.status(409).json({ error: "no_photo_avatar" });
    try {
      res.set("Cache-Control", "no-store").json({ sessionToken: await anam.sessionToken(doc.persona.avatar.avatarId, `haven-${doc.id.slice(-10)}`) });
    } catch (err) {
      fail(res, err);
    }
  });

  // Raw 16 kHz PCM for the avatar: the household's ElevenLabs voice, else the default Polly voice.
  const TtsBody = z.object({ text: z.string().trim().min(1).max(600) });
  router.post("/api/tts", auth, express.json({ limit: "8kb" }), async (req, res) => {
    const b = TtsBody.safeParse(req.body ?? {});
    if (!b.success) return void res.status(400).json({ error: "invalid_body" });
    const used = await deps.repo.incrCounter(`TTS#${hh(res)}#${istDate(deps.now())}`, b.data.text.length, 2 * 24 * 3600);
    if (used > limits.ttsCharsPerDay) return void res.status(429).json({ error: "daily_voice_limit" });
    const doc = await deps.repo.get(hh(res));
    if (!doc) return void res.status(404).json({ error: "household_not_found" });
    const lang = doc.elder.language === "hi-IN" ? "hi" : undefined;
    try {
      const eleven = doc.persona.voice ? await deps.eleven?.() : undefined;
      let audio: Buffer | undefined;
      if (eleven && doc.persona.voice) {
        // A failing custom voice must not silence the avatar: fall back to the default voice.
        audio = await eleven.pcm(doc.persona.voice.voiceId, b.data.text, lang).catch((err: Error) => {
          console.warn(JSON.stringify({ msg: "custom_voice_failed_fallback_polly", error: err.message.slice(0, 200) }));
          return undefined;
        });
      }
      audio ??= await deps.pollyPcm?.(b.data.text);
      if (!audio) return void res.status(503).json({ error: "speech_unavailable" });
      res.set({ "Content-Type": "application/octet-stream", "Cache-Control": "no-store", "X-Audio-Format": "pcm_s16le;rate=16000;channels=1" }).send(audio);
    } catch (err) {
      fail(res, err);
    }
  });

  router.use("/api", apiErrors);
  return router;
}
