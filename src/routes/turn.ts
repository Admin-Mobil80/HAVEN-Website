import { Router } from "express";
import { z } from "zod";
import { runTurn, type TurnDeps, type TurnInput } from "../agent/turn.js";
import { requireHousehold } from "../http/households.js";
import { signMediaUrl } from "../http/media.js";
import { householdWriteLimit, type HouseholdLimiter } from "../http/security.js";
import { apiErrors } from "./api.js";

export type TurnRouteDeps = Omit<TurnDeps, "mediaUrl"> & { secret: string; householdLimit?: HouseholdLimiter };

const speech = { speech: z.enum(["server", "none"]).optional() };
const Body = z.union([
  z.object({ text: z.string().trim().min(1).max(500), ...speech }),
  z.object({ event: z.enum(["session_start", "session_end"]), ...speech }),
  z.object({ event: z.literal("relay_done"), messageId: z.string().trim().min(1).max(40), ...speech }),
]);

// POST /api/turn: the tablet's one conversational endpoint. Text comes from tap-to-talk speech
// recognition or the text box; events mark session start/end and the end of a family recording.
export function turnRouter(deps: TurnRouteDeps): Router {
  const router = Router();
  const turnDeps: TurnDeps = { ...deps, mediaUrl: (key) => signMediaUrl(key, deps.secret, deps.now()) };

  router.post("/api/turn", requireHousehold(deps.secret), householdWriteLimit(deps.householdLimit), async (req, res) => {
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: "invalid_body" });
    const b = parsed.data;
    const base: TurnInput =
      "text" in b ? { kind: "text", text: b.text } : b.event === "relay_done" ? { kind: "relay_done", messageId: b.messageId } : { kind: b.event };
    const input: TurnInput = { ...base, speech: b.speech };
    res.set("Cache-Control", "no-store").json(await runTurn(res.locals.householdId as string, input, turnDeps));
  });

  router.use("/api", apiErrors);
  return router;
}
