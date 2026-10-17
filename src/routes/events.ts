import express, { Router } from "express";
import { requireHousehold } from "../http/households.js";
import { householdWriteLimit, type HouseholdLimiter } from "../http/security.js";
import { runDigest, type DigestDeps } from "../jobs/digest.js";
import { istDate } from "../domain/util.js";
import { blankHousehold } from "../store/seed.js";
import { apiErrors } from "./api.js";

export type EventsDeps = DigestDeps & {
  secret: string;
  liveHouseholds: string[]; // the scheduled digest runs for these
  publicDemoId: string;
  householdLimit?: HouseholdLimiter;
  maxManualDigestsPerDay?: number;
};

// Scheduler events arrive through the Lambda Web Adapter's pass-through path (/events). Requests
// that came in over the Function URL carry x-amzn-request-context; scheduler events do not, so a
// caller on the internet cannot fire jobs. Jobs are safe to repeat.
export function eventsRouter(deps: EventsDeps): Router {
  const router = Router();

  router.post("/events", express.json({ limit: "64kb" }), async (req, res) => {
    if (req.header("x-amzn-request-context") !== undefined) return void res.sendStatus(404);
    const type = (req.body as { type?: unknown } | undefined)?.type;
    if (type === "warm") return void res.json({ ok: true });
    if (type === "reset_demo") {
      await deps.repo.put(blankHousehold(deps.publicDemoId, deps.now(), { demo: true }));
      return void res.json({ ok: true, reset: deps.publicDemoId });
    }
    if (type === "digest") {
      const results = [];
      for (const hh of deps.liveHouseholds) {
        try {
          const r = await runDigest(hh, deps);
          results.push({ hh, status: r.status, ...(r.status === "done" ? { delivery: r.delivery?.status } : { reason: r.reason }) });
        } catch (err) {
          console.error(JSON.stringify({ msg: "digest_job_failed", hh, error: (err as Error).message }));
          results.push({ hh, status: "error" });
        }
      }
      console.log(JSON.stringify({ msg: "digest_job", results }));
      return void res.json({ ok: true, results });
    }
    res.status(400).json({ error: "unknown_event" });
  });

  // "Send digest now" on the family dashboard, for the demo and for judges.
  router.post("/api/digest/run", requireHousehold(deps.secret), householdWriteLimit(deps.householdLimit), async (_req, res) => {
    const hh = res.locals.householdId as string;
    const used = await deps.repo.incrCounter(`DIGEST#${hh}#${istDate(deps.now())}`, 1, 2 * 24 * 3600);
    if (used > (deps.maxManualDigestsPerDay ?? 20)) return void res.status(429).json({ error: "digest_daily_limit" });
    const r = await runDigest(hh, deps);
    if (r.status === "skipped") return void res.status(409).json({ error: r.reason });
    res.set("Cache-Control", "no-store").status(201).json({
      digest: { id: r.digest.id, date: r.digest.date, summary: r.digest.summary, starters: r.digest.starters, tier: r.digest.tier, hasAudio: Boolean(r.digest.audioKey) },
      delivery: r.delivery ? { channel: r.delivery.channel, status: r.delivery.status } : undefined,
    });
  });

  router.use("/api", apiErrors);
  return router;
}
