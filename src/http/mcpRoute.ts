import { Router, type Request, type RequestHandler, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { redactLogSummary } from "../domain/privacy.js";
import type { Household, LogEntry } from "../domain/types.js";
import type { ToolContext } from "../mcp/context.js";
import { createMcpServer } from "../mcp/server.js";
import type { Notifier } from "../notify/index.js";
import type { Repo } from "../store/repo.js";
import { bearerToken, ensurePublicDemoCached, verifyToken } from "./households.js";
import { signMediaUrl } from "./media.js";
import type { HouseholdLimiter } from "./security.js";

export type McpRouteDeps = {
  repo: Repo;
  notifier: Notifier;
  secret: string;
  now: () => Date;
  publicDemoId: string;
  householdLimit?: HouseholdLimiter; // per-household cap on tools/call (optional for tests)
};

// The simulator and the host's own agent get their trace inline; only other clients
// (Inspector, Claude Desktop, ...) are written to the household's activity log.
const INLINE_TRACE_CLIENTS = new Set(["alexa-sim", "agent"]);

const rpcError = (res: Response, status: number, code: number, message: string, headers: Record<string, string> = {}) =>
  void res.status(status).set(headers).json({ jsonrpc: "2.0", error: { code, message }, id: null });

export function clientName(header: string | string[] | undefined): string {
  const v = typeof header === "string" ? header.trim().toLowerCase() : "";
  return /^[a-z0-9][a-z0-9_.-]{0,31}$/.test(v) ? v : "external";
}

// doc is the document when resolving had to read it anyway (token households), for log redaction.
type Resolved = { householdId: string; doc?: Household } | { status: number; message: string };

// Order: Authorization header, then the /mcp/h/<token> path, then the public demo household.
export async function resolveHousehold(req: Request, deps: McpRouteDeps): Promise<Resolved> {
  const auth = req.headers.authorization;
  const pathToken = typeof req.params.token === "string" ? req.params.token : undefined;
  let id: string | undefined;
  if (auth !== undefined) {
    id = verifyToken(bearerToken(auth), deps.secret);
    if (!id) return { status: 401, message: "Unauthorized: invalid household token" };
  } else if (pathToken !== undefined) {
    id = verifyToken(pathToken, deps.secret);
    if (!id) return { status: 401, message: "Unauthorized: invalid household token" };
  } else {
    id = deps.publicDemoId;
  }
  if (id === deps.publicDemoId) {
    await ensurePublicDemoCached(deps.repo, id, deps.now());
    return { householdId: id };
  }
  const doc = await deps.repo.get(id);
  if (!doc) return { status: 404, message: "Household not found or expired" };
  return { householdId: id, doc };
}

type RpcShape = { method?: unknown; id?: unknown; params?: { name?: unknown; clientInfo?: { name?: unknown } } };

function describe(msg: RpcShape) {
  const method = typeof msg.method === "string" ? msg.method.slice(0, 64) : undefined;
  const tool = method === "tools/call" && typeof msg.params?.name === "string" ? msg.params.name.slice(0, 64) : undefined;
  const peer = method === "initialize" && typeof msg.params?.clientInfo?.name === "string" ? msg.params.clientInfo.name.slice(0, 60) : undefined;
  const base = [method ?? "response", tool, peer ? `from ${peer}` : undefined].filter(Boolean).join(" ");
  return { method, tool, base };
}

export function mcpRouter(deps: McpRouteDeps): Router {
  const router = Router();

  const handle: RequestHandler = async (req, res) => {
    const body = req.body as unknown;
    if (Array.isArray(body)) return rpcError(res, 400, -32600, "Batch requests are not supported");

    const resolved = await resolveHousehold(req, deps);
    if ("status" in resolved) {
      const headers: Record<string, string> = resolved.status === 401 ? { "WWW-Authenticate": 'Bearer error="invalid_token"' } : {};
      return rpcError(res, resolved.status, -32001, resolved.message, headers);
    }
    const { householdId } = resolved;
    const msg: RpcShape = body && typeof body === "object" ? (body as RpcShape) : {};
    // A real (non-demo) household's alert path is never rate limited: only its own device holds
    // the token, and a capped start_escalation would drop an emergency alert.
    const alertPath = msg.params?.name === "start_escalation" && resolved.doc?.demo === false;
    if (msg.method === "tools/call" && deps.householdLimit && !alertPath) {
      const limit = await deps.householdLimit(householdId);
      if (!limit.ok) {
        const id = typeof msg.id === "string" || typeof msg.id === "number" ? msg.id : null;
        return void res
          .status(429)
          .set("Retry-After", String(limit.retryAfter))
          .json({ jsonrpc: "2.0", error: { code: -32000, message: "Too many requests for this household" }, id });
      }
    }
    const client = clientName(req.headers["x-haven-client"]);
    const traced: LogEntry[] = [];
    const ctx: ToolContext = {
      repo: deps.repo,
      householdId,
      client,
      now: deps.now,
      notifier: deps.notifier,
      mediaUrl: (key) => signMediaUrl(key, deps.secret, deps.now()),
      trace: (entry) => void traced.push(entry),
    };

    const shouldLog = !INLINE_TRACE_CLIENTS.has(client) && typeof body === "object" && body !== null;
    const isRequest = typeof msg.method === "string" && msg.id !== undefined && msg.id !== null;

    // Awaited before the response goes out: Lambda freezes once it has responded.
    const persistLog = async (isError: boolean) => {
      try {
        const { method, tool, base } = describe(msg);
        // Tool traces already start with the tool name ("remember: stored (private)").
        const raw = traced.length > 0 ? traced.map((t) => t.summary).join("; ") : base;
        // Tool summaries never carry free text, and GET /api/log redacts again on read, so no
        // extra read of the whole document here: redact with one only if resolving loaded it.
        const summary = (resolved.doc ? redactLogSummary(raw, resolved.doc) : raw).slice(0, 300);
        await deps.repo.appendLog(householdId, { at: deps.now().toISOString(), client, kind: "mcp", method, tool, summary, isError: isError || undefined });
      } catch (err) {
        console.warn("mcp activity log write failed:", (err as Error).message);
      }
    };

    const server = createMcpServer(ctx);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    if (shouldLog && isRequest) {
      const send = transport.send.bind(transport);
      transport.send = async (message: JSONRPCMessage, options) => {
        if ("id" in message && message.id === msg.id && ("result" in message || "error" in message)) {
          const isError = "error" in message || (message.result as { isError?: unknown }).isError === true;
          await persistLog(isError);
        }
        return send(message, options);
      };
    } else if (shouldLog) {
      await persistLog(false); // notifications get no response to hang the write on
    }

    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      console.error("mcp request failed:", err);
      if (!res.headersSent) rpcError(res, 500, -32603, "Internal error");
    }
  };

  const notAllowed: RequestHandler = (_req, res) => rpcError(res, 405, -32000, "Method not allowed.", { Allow: "POST" });

  router.post(["/mcp", "/mcp/h/:token"], handle);
  router.get(["/mcp", "/mcp/h/:token"], notAllowed);
  router.delete(["/mcp", "/mcp/h/:token"], notAllowed);
  return router;
}
