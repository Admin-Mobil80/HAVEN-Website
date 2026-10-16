import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";

export const MEDIA_URL_TTL_SECONDS = 24 * 60 * 60;

// Where recordings live (S3 in the hosted demo). Returns a short-lived direct URL; a redirect
// to it gives Safari the byte-range support audio playback needs.
export type MediaStore = { signedGetUrl(key: string): Promise<string | undefined> };

// The "media\n" prefix separates these MACs from household tokens signed with the same secret.
const mediaSig = (key: string, exp: number, secret: string) =>
  createHmac("sha256", secret).update(`media\n${key}\n${exp}`).digest("base64url");

// Relative URL, so it works on whatever host served the page. Audio elements cannot send an
// Authorization header, hence the signature in the query string.
export function signMediaUrl(key: string, secret: string, now: Date, ttlSeconds = MEDIA_URL_TTL_SECONDS): string {
  const exp = Math.floor(now.getTime() / 1000) + ttlSeconds;
  return `/api/media/${encodeURIComponent(key)}?exp=${exp}&sig=${mediaSig(key, exp, secret)}`;
}

export function verifyMediaSig(key: string, exp: unknown, sig: unknown, secret: string, now: Date): "ok" | "expired" | "invalid" {
  if (typeof exp !== "string" || typeof sig !== "string" || !/^\d{1,12}$/.test(exp) || sig.length > 100) return "invalid";
  const expected = Buffer.from(mediaSig(key, Number(exp), secret));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "invalid";
  return Number(exp) * 1000 < now.getTime() ? "expired" : "ok";
}

export function mediaRouter(opts: { secret: string; now: () => Date; store?: MediaStore }): Router {
  const router = Router();
  router.get("/api/media/:key", async (req, res) => {
    const key = req.params.key;
    const check = verifyMediaSig(key, req.query.exp, req.query.sig, opts.secret, opts.now());
    if (check !== "ok") return void res.status(403).json({ error: check === "expired" ? "media_url_expired" : "invalid_signature" });
    if (!opts.store) return void res.status(404).json({ error: "media_store_not_configured" });
    const url = await opts.store.signedGetUrl(key);
    if (!url) return void res.status(404).json({ error: "media_not_found" });
    res.set("Cache-Control", "no-store").redirect(302, url);
  });
  return router;
}
