import type { ErrorRequestHandler, Request, RequestHandler, Response } from "express";
import type { Repo } from "../store/repo.js";

export type HostPolicy = {
  allowedHosts: string[]; // exact Host values, e.g. "localhost:3000"
  allowedHostSuffixes: string[]; // e.g. ".lambda-url.ap-south-1.on.aws" (one extra DNS label allowed)
  allowedOrigins: string[]; // extra cross-origin callers, e.g. a local MCP Inspector
};

// baseUrl + path, so the check also holds inside middleware mounted with app.use("/mcp", ...).
const isMcpPath = (req: Request) => {
  const p = req.baseUrl + req.path;
  return p === "/mcp" || p.startsWith("/mcp/");
};

// /mcp callers get JSON-RPC shaped errors; everything else gets { error: code }.
export function sendError(req: Request, res: Response, status: number, code: string, message: string, rpcCode = -32000) {
  if (isMcpPath(req)) return void res.status(status).json({ jsonrpc: "2.0", error: { code: rpcCode, message }, id: null });
  res.status(status).json({ error: code });
}

export function hostAllowed(host: string | undefined, policy: HostPolicy): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  if (policy.allowedHosts.some((a) => a.toLowerCase() === h)) return true;
  return policy.allowedHostSuffixes.some((suffix) => {
    const s = suffix.toLowerCase();
    return h.endsWith(s) && /^[a-z0-9-]{1,63}$/.test(h.slice(0, -s.length));
  });
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Called only after the Host itself passed the allowlist, so "same origin" here really is us.
export function originAllowed(origin: string | undefined, host: string, policy: HostPolicy): boolean {
  if (origin === undefined) return true; // non-browser clients (curl, SDK, Inspector proxy)
  const o = origin.toLowerCase();
  const h = host.toLowerCase();
  if (policy.allowedOrigins.some((a) => a.toLowerCase() === o)) return true;
  if (o === `https://${h}`) return true;
  const hostname = h.replace(/:\d+$/, "");
  return LOCAL_HOSTNAMES.has(hostname) && o === `http://${h}`;
}

// DNS-rebinding defence. The legacy check compared Origin with Host, which an attacker who
// controls both (evil.example rebound to our IP) passes trivially; the Host allowlist closes it.
export function hostOriginGuard(policy: HostPolicy): RequestHandler {
  return (req, res, next) => {
    const host = req.headers.host;
    if (!hostAllowed(host, policy)) return sendError(req, res, 403, "host_not_allowed", "Forbidden: host not allowed");
    const origin = req.headers.origin;
    if (!originAllowed(origin, host as string, policy)) return sendError(req, res, 403, "origin_not_allowed", "Forbidden: origin not allowed");
    // Only explicitly listed cross-origin callers get CORS headers; same-origin needs none.
    if (origin && policy.allowedOrigins.some((a) => a.toLowerCase() === origin.toLowerCase())) {
      res.set("Access-Control-Allow-Origin", origin);
      res.vary("Origin");
      res.set("Access-Control-Expose-Headers", "Mcp-Session-Id, Mcp-Protocol-Version");
      if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID, X-Haven-Client");
        res.set("Access-Control-Max-Age", "600");
        return void res.status(204).end();
      }
    }
    next();
  };
}

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  // Path-scoped MCP URLs carry a household token; never leak them through Referer.
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Frame-Options", "SAMEORIGIN");
  next();
};

// Behind the Lambda Web Adapter every connection comes from loopback, and the client address
// is the right-most X-Forwarded-For entry (added by the AWS front end, so not client-forgeable).
export function clientIp(req: Request): string {
  const remote = (req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "");
  const loopback = remote === "127.0.0.1" || remote === "::1";
  const xff = req.headers["x-forwarded-for"];
  if (loopback && typeof xff === "string" && xff.trim()) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last.length <= 64) return last;
  }
  return remote;
}

// Fixed one-minute windows counted in the repo, so limits hold across Lambda instances.
export function rateLimit(opts: { repo: Repo; name: string; limit: number; now: () => Date }): RequestHandler {
  return async (req, res, next) => {
    const nowMs = opts.now().getTime();
    const window = Math.floor(nowMs / 60_000);
    let count: number;
    try {
      count = await opts.repo.incrCounter(`RATE#${opts.name}#${clientIp(req)}#${window}`, 1, 120);
    } catch (err) {
      // Fail open: a counter outage must not take the judge demo down.
      console.warn(`rate limit counter unavailable (${opts.name}):`, (err as Error).message);
      return next();
    }
    if (count > opts.limit) {
      res.set("Retry-After", String(Math.max(1, 60 - Math.floor((nowMs % 60_000) / 1000))));
      return sendError(req, res, 429, "rate_limited", "Too many requests");
    }
    next();
  };
}

export type HouseholdLimit = { ok: true } | { ok: false; retryAfter: number };
export type HouseholdLimiter = (householdId: string) => Promise<HouseholdLimit>;

// Per-household caps on calls that read and rewrite the household document (MCP tools/call and
// the family's POST routes). Per-IP limits alone let many sources, or the tokenless public demo
// shared by everyone, drive DynamoDB cost on one item without bound.
export function householdLimiter(opts: { repo: Repo; now: () => Date; perMinute: number; perDay: number }): HouseholdLimiter {
  return async (householdId) => {
    const nowMs = opts.now().getTime();
    try {
      const minute = await opts.repo.incrCounter(`RATE#hh#${householdId}#${Math.floor(nowMs / 60_000)}`, 1, 120);
      if (minute > opts.perMinute) return { ok: false, retryAfter: Math.max(1, 60 - Math.floor((nowMs % 60_000) / 1000)) };
      const day = await opts.repo.incrCounter(`RATE#hhday#${householdId}#${Math.floor(nowMs / 86_400_000)}`, 1, 2 * 86_400);
      if (day > opts.perDay) return { ok: false, retryAfter: Math.max(1, Math.ceil((86_400_000 - (nowMs % 86_400_000)) / 1000)) };
    } catch (err) {
      // Fail open, like the per-IP limiter: a counter outage must not take the judge demo down.
      console.warn("household rate limit counter unavailable:", (err as Error).message);
    }
    return { ok: true };
  };
}

// The same cap as route middleware, after requireHousehold has set res.locals.householdId.
export function householdWriteLimit(limiter: HouseholdLimiter | undefined): RequestHandler {
  return async (req, res, next) => {
    if (!limiter) return next();
    const r = await limiter(res.locals.householdId as string);
    if (r.ok) return next();
    res.set("Retry-After", String(r.retryAfter));
    sendError(req, res, 429, "rate_limited", "Too many requests for this household");
  };
}

// Body-parser failures. On /mcp a malformed body is a JSON-RPC parse error (-32700).
export const bodyErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const type = (err as { type?: string } | undefined)?.type;
  if (type === "entity.parse.failed") return sendError(req, res, 400, "invalid_json", "Parse error: Invalid JSON", -32700);
  if (type === "entity.too.large") return sendError(req, res, 413, "payload_too_large", "Payload too large");
  if (type === "encoding.unsupported" || type === "charset.unsupported") return sendError(req, res, 415, "unsupported_encoding", "Unsupported encoding");
  next(err);
};
