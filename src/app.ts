import { existsSync } from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import { mcpRouter } from "./http/mcpRoute.js";
import { mediaRouter, type MediaStore } from "./http/media.js";
import { bodyErrorHandler, householdLimiter, hostOriginGuard, rateLimit, securityHeaders, sendError, type HostPolicy } from "./http/security.js";
import type { Notifier } from "./notify/index.js";
import { apiRouter } from "./routes/api.js";
import { demoRouter } from "./routes/demo.js";
import { turnRouter } from "./routes/turn.js";
import { adminRouter } from "./routes/admin.js";
import { webhooksRouter, type WebhookDeps } from "./routes/webhooks.js";
import { eventsRouter } from "./routes/events.js";
import { familyRouter } from "./routes/family.js";
import { likenessRouter, type LikenessDeps } from "./routes/likeness.js";
import type { DigestDeps } from "./jobs/digest.js";
import type { TurnDeps } from "./agent/turn.js";
import type { Repo } from "./store/repo.js";

export type AppDeps = {
  repo: Repo;
  notifier: Notifier;
  householdSecret: string;
  now?: () => Date;
  publicDemoId?: string;
  allowedHosts?: string[];
  allowedHostSuffixes?: string[];
  allowedOrigins?: string[];
  webDir?: string;
  demoTtlSeconds?: number;
  // Additive, optional: per-IP requests per minute (tests use tiny limits), per-household document
  // writes per minute and per day, and the recording store.
  rateLimits?: { mcp?: number; api?: number; demoSession?: number; household?: number; householdDaily?: number };
  mediaStore?: MediaStore;
  // Conversation engine: "bedrock" calls the LLM (rules brain on failure), "rules" never does.
  brain?: TurnDeps["brain"];
  think?: TurnDeps["think"];
  speak?: TurnDeps["speak"];
  dailyBrainCap?: number;
  // WhatsApp webhook (absent: the route is not mounted) and the owner-household admin key.
  whatsapp?: Pick<WebhookDeps, "client" | "appSecret" | "verifyToken" | "media" | "voiceNote">;
  adminKey?: string | (() => Promise<string | undefined>);
  // Evening digest: writer, speech and media (all optional), and which households the 21:00 job serves.
  digest?: Pick<DigestDeps, "write" | "voiceNote" | "mp3" | "media">;
  liveHouseholds?: string[];
  // Voice (ElevenLabs) and photo avatar (Anam) providers, loaded lazily; absent means off.
  likeness?: Pick<LikenessDeps, "eleven" | "anam" | "pollyPcm" | "limits">;
};

const DEFAULT_DEMO_TTL_SECONDS = 7 * 24 * 60 * 60;
// Higher than a bare API would need: one judge runs the tablet and the family view side by side,
// each polling every few seconds, and the simulator makes several MCP calls per spoken turn.
// Per household: MCP tools/call plus the family's POST routes. One person talking to the tablet
// makes a few tool calls per spoken turn, far under 30 a minute; the cap holds for the tokenless
// public demo however many IPs share it, and the daily cap bounds a slow, steady flood.
const DEFAULT_LIMITS = { mcp: 240, api: 240, demoSession: 10, household: 30, householdDaily: 3000 };

export function createApp(deps: AppDeps): express.Express {
  const now = deps.now ?? (() => new Date());
  const port = process.env.PORT ?? "3000";
  const policy: HostPolicy = {
    allowedHosts: deps.allowedHosts ?? [`localhost:${port}`, `127.0.0.1:${port}`],
    allowedHostSuffixes: deps.allowedHostSuffixes ?? [".lambda-url.ap-south-1.on.aws"],
    allowedOrigins: deps.allowedOrigins ?? [],
  };
  const limits = { ...DEFAULT_LIMITS, ...deps.rateLimits };
  const secret = deps.householdSecret;
  if (!secret) throw new Error("householdSecret is required");
  const publicDemoId = deps.publicDemoId ?? "public-demo";

  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeaders, hostOriginGuard(policy));

  // Before the limiter so the Lambda Web Adapter readiness probe never touches the counter table.
  app.get("/api/health", (_req, res) => void res.set("Cache-Control", "no-store").json({ ok: true }));

  // JSON parsing is scoped to /mcp and /api so a future webhook route can read its raw body for HMAC.
  const json = express.json({ limit: "256kb" });
  app.use("/mcp", rateLimit({ repo: deps.repo, name: "mcp", limit: limits.mcp, now }), json);
  app.use("/api", rateLimit({ repo: deps.repo, name: "api", limit: limits.api, now }), json);

  const householdLimit = householdLimiter({ repo: deps.repo, now, perMinute: limits.household, perDay: limits.householdDaily });
  app.use(mcpRouter({ repo: deps.repo, notifier: deps.notifier, secret, now, publicDemoId, householdLimit }));
  app.use(
    demoRouter({
      repo: deps.repo,
      secret,
      now,
      publicDemoId,
      demoTtlSeconds: deps.demoTtlSeconds ?? DEFAULT_DEMO_TTL_SECONDS,
      sessionLimiter: rateLimit({ repo: deps.repo, name: "demo-session", limit: limits.demoSession, now }),
    }),
  );
  app.use(mediaRouter({ secret, now, store: deps.mediaStore }));
  if (deps.whatsapp) app.use(webhooksRouter({ ...deps.whatsapp, repo: deps.repo, now }));
  app.use(adminRouter({ repo: deps.repo, secret, adminKey: deps.adminKey, now }));
  app.use(
    eventsRouter({
      ...deps.digest,
      repo: deps.repo,
      notifier: deps.notifier,
      now,
      secret,
      householdLimit,
      publicDemoId,
      liveHouseholds: deps.liveHouseholds ?? [],
    }),
  );
  app.use(apiRouter({ repo: deps.repo, secret, now, householdLimit }));
  app.use(likenessRouter({ ...deps.likeness, repo: deps.repo, secret, now, householdLimit }));
  app.use(familyRouter({ repo: deps.repo, secret, now, householdLimit, media: deps.digest?.media, demoTtlSeconds: deps.demoTtlSeconds ?? DEFAULT_DEMO_TTL_SECONDS }));
  app.use(
    turnRouter({
      repo: deps.repo,
      notifier: deps.notifier,
      secret,
      now,
      householdLimit,
      brain: deps.brain ?? "rules",
      think: deps.think,
      speak: deps.speak,
      dailyBrainCap: deps.dailyBrainCap,
    }),
  );
  app.use("/api", (_req, res) => void res.status(404).json({ error: "not_found" }));

  mountWeb(app, deps.webDir);

  app.use(bodyErrorHandler, finalErrorHandler);
  return app;
}

const SPA_EXCLUDED = /^\/(api|mcp|webhooks|events)(\/|$)/;

function mountWeb(app: express.Express, webDir: string | undefined) {
  const index = webDir ? path.join(webDir, "index.html") : undefined;
  if (!webDir || !index || !existsSync(index)) {
    app.get("/", (_req, res) => {
      res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
      res.type("html").send(PLACEHOLDER_HTML);
    });
    return;
  }
  app.use(
    express.static(webDir, {
      index: false,
      setHeaders(res, file) {
        // Vite emits content-hashed file names under assets/, so they never change in place.
        if (file.includes(`${path.sep}assets${path.sep}`)) res.set("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  // Client-side routes (/family, /setup, ...) get the app shell; missing files stay 404.
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (SPA_EXCLUDED.test(req.path) || path.extname(req.path) !== "") return next();
    res.set("Cache-Control", "no-cache");
    res.sendFile(index);
  });
}

// Client errors raised by Express itself (a malformed percent-encoded route param is a URIError
// with status 400, an aborted body is 400) answer 400 without an "error" log line: anyone can send
// them, and they would otherwise flood the Logs Insights error query in docs/DEPLOY.md.
const finalErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const e = err as { status?: unknown; statusCode?: unknown } | undefined;
  const status = Number(e?.status ?? e?.statusCode);
  if (status >= 400 && status < 500) return sendError(req, res, status, "bad_request", "Bad request", -32600);
  console.error("unhandled request error:", err);
  sendError(req, res, 500, "internal_error", "Internal error", -32603);
};

// Shown when the web app has not been built (fresh clone, API-only runs). Static text only.
const PLACEHOLDER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Haven server</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 16px; }
  code { font-size: 0.95em; }
  li { margin: 0.25rem 0; }
</style>
</head>
<body>
<h1>Haven server is running</h1>
<p>The web app is not built yet. Build it into <code>web/dist</code> to get the judge demo, the tablet and the family view.</p>
<p>Haven's "Digital &lt;name&gt;" companion is an AI and is always labelled as one. All demo data is synthetic.</p>
<h2>Endpoints</h2>
<ul>
  <li><code>POST /mcp</code>: MCP (Streamable HTTP, stateless, JSON responses) for the public demo household</li>
  <li><code>POST /mcp/h/&lt;token&gt;</code>: MCP scoped to one demo household</li>
  <li><code>POST /api/demo/session</code>: create a demo household and get its token</li>
  <li><code>GET /api/state/elder</code>, <code>GET /api/state/family</code>: projections (Bearer token)</li>
  <li><code>GET /api/log</code>: activity log (Bearer token)</li>
  <li><code>GET /api/health</code>: health check</li>
</ul>
</body>
</html>
`;
