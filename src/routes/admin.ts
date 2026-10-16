import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { signToken } from "../http/households.js";
import { seedHousehold } from "../store/seed.js";
import type { Repo } from "../store/repo.js";

// Creates the owner household: the one real household whose members' phones are allowlisted on
// the WhatsApp test number and that may send for real. Guarded by an admin key from SSM
// (/haven/admin-key); without a key configured the route does not exist.

export const OWNER_ID = "owner";

const phone = z.string().trim().regex(/^\d{10,15}$/, "digits only, with country code, no +");
const Body = z.object({
  priyaPhone: phone,
  raviPhone: phone.optional(),
  kamalaPhone: phone.optional(),
  replace: z.boolean().optional(),
});

export function adminRouter(deps: { repo: Repo; secret: string; adminKey?: string; now: () => Date }): Router {
  const router = Router();
  if (!deps.adminKey) return router;
  const key = Buffer.from(deps.adminKey);

  router.post("/api/admin/owner", async (req, res) => {
    const given = Buffer.from(req.header("x-haven-admin") ?? "");
    if (given.length !== key.length || !timingSafeEqual(given, key)) return void res.status(401).json({ error: "unauthorized" });
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: "invalid_body", detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    const b = parsed.data;
    const now = deps.now();
    const at = now.toISOString();

    const doc = seedHousehold(OWNER_ID, now, { demo: false });
    const priya = doc.members.find((m) => m.id === "priya")!;
    priya.phone = b.priyaPhone;
    priya.waOptIn = { by: "priya", at };
    const ravi = doc.members.find((m) => m.id === "ravi");
    if (ravi) {
      if (b.raviPhone) Object.assign(ravi, { phone: b.raviPhone, waOptIn: { by: "ravi", at } });
      else delete ravi.phone; // no phone: alerts to Ravi stay simulated
    }
    if (b.kamalaPhone) doc.elder.phone = b.kamalaPhone;
    // Seeded call history is demo data; the owner household starts from real zero.
    doc.contacts = [];

    if (b.replace) await deps.repo.put(doc);
    else {
      try {
        await deps.repo.create(doc);
      } catch {
        return void res.status(409).json({ error: "owner_exists", hint: "send replace: true to reset it" });
      }
    }
    for (const m of doc.members) if (m.phone) await deps.repo.mapPhone(m.phone, OWNER_ID);

    const token = signToken(OWNER_ID, deps.secret);
    res.set("Cache-Control", "no-store").status(201).json({ householdId: OWNER_ID, token, familyLink: `/family#t=${token}`, tabletLink: `/tablet#t=${token}` });
  });

  return router;
}
