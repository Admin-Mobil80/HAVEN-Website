import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { signToken } from "../http/households.js";
import { newHousehold } from "../store/seed.js";
import { SetupBody } from "./setupSchema.js";
import type { Repo } from "../store/repo.js";

// Creates the owner household: the one real household whose members' phones are allowlisted on
// the WhatsApp test number and that may send for real. Guarded by an admin key from SSM
// (/haven/admin-key); without a key configured the route does not exist.

export const OWNER_ID = "owner";

const phone = z.string().trim().regex(/^\d{10,15}$/, "digits only, with country code, no +");
const Body = SetupBody.extend({
  userPhone: phone, // the main user's WhatsApp number (allowlisted on the test number)
  elderPhone: phone.optional(), // shown in urgent alerts so family can tap to call
  replace: z.boolean().optional(),
});

// adminKey may be a loader so a key created after startup is picked up without a redeploy.
export function adminRouter(deps: { repo: Repo; secret: string; adminKey?: string | (() => Promise<string | undefined>); now: () => Date }): Router {
  const router = Router();
  if (!deps.adminKey) return router;
  const loadKey = typeof deps.adminKey === "string" ? async () => deps.adminKey as string : deps.adminKey;

  router.post("/api/admin/owner", async (req, res) => {
    const configured = await loadKey();
    if (!configured) return void res.status(404).json({ error: "not_found" });
    const key = Buffer.from(configured);
    const given = Buffer.from(req.header("x-haven-admin") ?? "");
    if (given.length !== key.length || !timingSafeEqual(given, key)) return void res.status(401).json({ error: "unauthorized" });
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: "invalid_body", detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    const b = parsed.data;
    const now = deps.now();
    const at = now.toISOString();

    const doc = newHousehold(OWNER_ID, now, b, { demo: false });
    const user = doc.members[0];
    user.phone = b.userPhone;
    user.waOptIn = { by: user.id, at };
    if (b.elderPhone) doc.elder.phone = b.elderPhone;

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
