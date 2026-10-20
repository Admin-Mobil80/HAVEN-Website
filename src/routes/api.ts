import { Router, type ErrorRequestHandler, type Request, type Response } from "express";
import { z } from "zod";
import { ackIncident, cancelIncident, closeIncident } from "../domain/incidents.js";
import { callStats, wasPromptedByHaven } from "../domain/metrics.js";
import { elderProjection, familyProjection, redactLogSummary } from "../domain/privacy.js";
import { CAPS, type FamilyMessage, type Household, type Incident } from "../domain/types.js";
import { capPush, nextId } from "../domain/util.js";
import { requireHousehold } from "../http/households.js";
import { householdWriteLimit, type HouseholdLimiter } from "../http/security.js";
import { NotFoundError, type Repo } from "../store/repo.js";
import { withAudioUrls } from "./family.js";
import { signMediaUrl } from "../http/media.js";

export type ApiRouteDeps = { repo: Repo; secret: string; now: () => Date; householdLimit?: HouseholdLimiter };

// Human-only family actions. None of these has an MCP equivalent on purpose: answering a
// deferral, releasing an incident or logging a real call must come from a person.

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

const memberId = z.string().trim().min(1).max(64);
const text = z.string().trim().min(1).max(500);
const ByBody = z.object({ by: memberId.optional() });
const AnswerBody = z.object({ text });
const MessageBody = z.object({ text, from: memberId.optional() });
const LogQuery = z.object({
  since: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value ?? {});
  if (!r.success) throw new HttpError(400, "invalid_body");
  return r.data;
}

const DOMAIN_ERRORS: Record<string, number> = {
  incident_not_found: 404,
  incident_not_active: 409,
  deferral_not_found: 404,
  deferral_not_open: 409,
  unknown_member: 400,
};

// Missing `by` means the primary member (the person holding the family dashboard).
function resolveMember(doc: Household, id: string | undefined): string {
  if (id !== undefined) {
    if (!doc.members.some((m) => m.id === id)) throw new Error("unknown_member");
    return id;
  }
  const primary = doc.members.find((m) => m.role === "primary") ?? doc.members[0];
  if (!primary) throw new Error("unknown_member");
  return primary.id;
}

async function loadDoc(repo: Repo, res: Response): Promise<Household> {
  const doc = await repo.get(res.locals.householdId as string);
  if (!doc) throw new HttpError(404, "household_not_found");
  return doc;
}

const INCIDENT_ACTIONS = { ack: ackIncident, cancel: cancelIncident, close: closeIncident } as const;

const incidentView = (i: Incident) => ({ id: i.id, tier: i.tier, emergency: i.emergency, state: i.state, ackBy: i.ackBy, closedBy: i.closedBy, closedAt: i.closedAt });

export function apiRouter(deps: ApiRouteDeps): Router {
  const router = Router();
  const auth = requireHousehold(deps.secret);
  // Every POST below rewrites the household document, so it counts against the household's cap.
  const write = householdWriteLimit(deps.householdLimit);
  const hh = (res: Response) => res.locals.householdId as string;

  router.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/api/state/elder", auth, async (_req, res) => {
    const { photoKey, stillUrl, ...view } = elderProjection(await loadDoc(deps.repo, res), deps.now());
    res.json({ ...view, photoUrl: photoKey ? signMediaUrl(photoKey, deps.secret, deps.now()) : stillUrl });
  });

  router.get("/api/state/family", auth, async (_req, res) => {
    res.json(withAudioUrls(familyProjection(await loadDoc(deps.repo, res), deps.now()), deps.secret, deps.now()));
  });

  router.get("/api/log", auth, async (req: Request, res) => {
    const q = parse(LogQuery, req.query);
    const doc = await loadDoc(deps.repo, res);
    const entries = await deps.repo.listLog(doc.id, { since: q.since, limit: q.limit ?? 100 });
    // Redact on read: a summary may predate a memory becoming private, or was stored unredacted.
    res.json({ entries: entries.map((e) => ({ ...e, summary: redactLogSummary(e.summary, doc) })) });
  });

  router.post("/api/incidents/:id/:action", auth, write, async (req, res) => {
    const params = req.params as { id: string; action: string };
    if (!Object.hasOwn(INCIDENT_ACTIONS, params.action)) throw new HttpError(404, "not_found");
    const action = INCIDENT_ACTIONS[params.action as keyof typeof INCIDENT_ACTIONS];
    const body = parse(ByBody, req.body);
    const at = deps.now();
    const incident = await deps.repo.update(hh(res), (doc) => incidentView(action(doc, params.id, resolveMember(doc, body.by), at)));
    res.json({ ok: true, incident });
  });

  router.post("/api/calls", auth, write, async (req, res) => {
    const body = parse(ByBody, req.body);
    const at = deps.now();
    const out = await deps.repo.update(hh(res), (doc) => {
      const by = resolveMember(doc, body.by);
      const prompted = wasPromptedByHaven(doc, at);
      const id = nextId(doc, "c");
      capPush(doc.contacts, { id, type: "call", by, at: at.toISOString(), promptedByHaven: prompted }, CAPS.contacts);
      return { contactId: id, prompted, stats: callStats(doc, at) };
    });
    res.status(201).json({ ...out.stats, contactId: out.contactId, prompted: out.prompted });
  });

  router.post("/api/deferrals/:id/answer", auth, write, async (req, res) => {
    const body = parse(AnswerBody, req.body);
    const deferralId = (req.params as { id: string }).id;
    const at = deps.now().toISOString();
    const out = await deps.repo.update(hh(res), (doc) => {
      const deferral = doc.deferrals.find((d) => d.id === deferralId);
      if (!deferral) throw new Error("deferral_not_found");
      if (deferral.status !== "open") throw new Error("deferral_not_open");
      const message: FamilyMessage = {
        id: nextId(doc, "fm"),
        from: resolveMember(doc, undefined),
        kind: "deferral_answer",
        text: body.text,
        inReplyTo: deferral.id,
        createdAt: at,
      };
      capPush(doc.messages, message, CAPS.messages);
      deferral.status = "answered";
      deferral.answeredAt = at;
      deferral.answerMessageId = message.id;
      return { deferralId: deferral.id, messageId: message.id };
    });
    res.status(201).json({ ok: true, ...out });
  });

  router.post("/api/messages", auth, write, async (req, res) => {
    const body = parse(MessageBody, req.body);
    const at = deps.now().toISOString();
    const messageId = await deps.repo.update(hh(res), (doc) => {
      const message: FamilyMessage = { id: nextId(doc, "fm"), from: resolveMember(doc, body.from), kind: "text", text: body.text, createdAt: at };
      capPush(doc.messages, message, CAPS.messages);
      return message.id;
    });
    res.status(201).json({ ok: true, messageId });
  });

  router.use("/api", apiErrors);
  return router;
}

export const apiErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.code });
  if (err instanceof NotFoundError) return void res.status(404).json({ error: "household_not_found" });
  const code = err instanceof Error ? err.message : "";
  if (Object.hasOwn(DOMAIN_ERRORS, code)) return void res.status(DOMAIN_ERRORS[code]).json({ error: code });
  next(err);
};
