import { Router, type RequestHandler } from "express";
import { requireHousehold, newDemoHouseholdId, signToken } from "../http/households.js";
import { seedHousehold } from "../store/seed.js";
import type { Repo } from "../store/repo.js";

export type DemoRouteDeps = {
  repo: Repo;
  secret: string;
  now: () => Date;
  demoTtlSeconds: number;
  publicDemoId: string;
  sessionLimiter?: RequestHandler; // creating households is the costliest call, so it gets its own limit
};

// Judge households: one per browser session, seeded with the synthetic Kamala/Priya/Ravi cast
// and expiring after demoTtlSeconds. The token is returned once and kept in sessionStorage.
export function demoRouter(deps: DemoRouteDeps): Router {
  const router = Router();
  const auth = requireHousehold(deps.secret);
  const limit: RequestHandler[] = deps.sessionLimiter ? [deps.sessionLimiter] : [];

  router.post("/api/demo/session", ...limit, async (_req, res) => {
    const householdId = newDemoHouseholdId();
    await deps.repo.create(seedHousehold(householdId, deps.now(), { demo: true }), { ttlSeconds: deps.demoTtlSeconds });
    const token = signToken(householdId, deps.secret);
    res.status(201).set("Cache-Control", "no-store").json({ householdId, token, mcpUrl: `/mcp/h/${token}` });
  });

  router.post("/api/demo/reset", auth, async (_req, res) => {
    const householdId = res.locals.householdId as string;
    const current = await deps.repo.get(householdId);
    if (!current) return void res.status(404).json({ error: "household_not_found" });
    // The owner household holds real setup (phones, consents); only demo data may be re-seeded.
    if (!current.demo) return void res.status(403).json({ error: "not_a_demo_household" });
    const fresh = seedHousehold(householdId, deps.now(), { demo: true });
    // Bump past the old version so an in-flight update that read the old doc cannot win.
    fresh.version = current.version + 1;
    await deps.repo.put(fresh, householdId === deps.publicDemoId ? undefined : { ttlSeconds: deps.demoTtlSeconds });
    res.json({ ok: true, householdId });
  });

  return router;
}
