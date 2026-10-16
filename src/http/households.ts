import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import type { Household } from "../domain/types.js";
import { seedHousehold } from "../store/seed.js";
import type { Repo } from "../store/repo.js";

// Household ids are path-safe so they can travel inside /mcp/h/<token> and DynamoDB keys.
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

const mac = (householdId: string, secret: string) => createHmac("sha256", secret).update(householdId).digest("base64url");

// "<id>.<base64url(HMAC-SHA256(id))>". The token is a capability: whoever holds it acts for
// that household, so it only ever travels in an Authorization header or a path the judge copies.
export function signToken(householdId: string, secret: string): string {
  if (!ID_RE.test(householdId)) throw new Error("invalid_household_id");
  return `${householdId}.${mac(householdId, secret)}`;
}

// Returns the household id, or undefined for anything malformed or forged.
export function verifyToken(token: string | undefined, secret: string): string | undefined {
  if (!token || token.length > 200) return undefined;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const id = token.slice(0, dot);
  if (!ID_RE.test(id)) return undefined;
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(id, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  return id;
}

export function bearerToken(authorization: string | undefined): string | undefined {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  return m?.[1];
}

export const newDemoHouseholdId = () => `demo-${randomBytes(9).toString("hex")}`;

// /api auth: the household token must arrive as a bearer header (never a query string, which
// would end up in access logs). Sets res.locals.householdId; existence is checked by the route.
export function requireHousehold(secret: string): RequestHandler {
  return (req, res, next) => {
    const id = verifyToken(bearerToken(req.headers.authorization), secret);
    if (!id) {
      res.set("WWW-Authenticate", 'Bearer error="invalid_token"');
      return void res.status(401).json({ error: "unauthorized" });
    }
    res.locals.householdId = id;
    next();
  };
}

// Skips ensurePublicDemo's strongly consistent read of the whole document on most requests: once
// this process has seen the household it is trusted for a minute. Not forever, because a demo
// item can expire (DynamoRepo gives demo documents a TTL) and must then be re-created.
const PUBLIC_DEMO_RECHECK_MS = 60_000;
const publicDemoSeen = new WeakMap<Repo, Map<string, number>>();

export async function ensurePublicDemoCached(repo: Repo, id: string, now: Date): Promise<void> {
  let seen = publicDemoSeen.get(repo);
  if (!seen) publicDemoSeen.set(repo, (seen = new Map()));
  const at = seen.get(id);
  if (at !== undefined && now.getTime() - at < PUBLIC_DEMO_RECHECK_MS && now.getTime() >= at) return;
  await ensurePublicDemo(repo, id, now);
  seen.set(id, now.getTime());
}

// The public demo household backs a tokenless /mcp so judges never paste anything. It is
// created on first use and has no TTL (the nightly reset job re-seeds it).
export async function ensurePublicDemo(repo: Repo, id: string, now: Date): Promise<Household> {
  const existing = await repo.get(id);
  if (existing) return existing;
  const doc = seedHousehold(id, now, { demo: true });
  try {
    await repo.create(doc);
    return doc;
  } catch {
    // Lost a creation race with a concurrent request: the other writer's copy wins.
    const raced = await repo.get(id);
    if (raced) return raced;
    throw new Error("public_demo_unavailable");
  }
}
