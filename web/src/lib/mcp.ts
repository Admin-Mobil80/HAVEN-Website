import { ensureToken } from "./api";
import { log } from "./bus";

// A real MCP client in the browser: initialize, notifications/initialized, tools/list and
// tools/call over Streamable HTTP (spec 2025-11-25, JSON responses), scoped to this tab's
// household through the /mcp/h/<token> path. Every message is shown in the MCP log.

export const MCP_VERSION = "2025-11-25";
let id = 0;
let ready: Promise<string[]> | undefined;

async function rpc(method: string, params?: unknown, notify = false) {
  const token = await ensureToken();
  const msg = { jsonrpc: "2.0", method, ...(params !== undefined ? { params } : {}), ...(notify ? {} : { id: ++id }) };
  log({ source: "alexa-sim", dir: "→", title: method === "tools/call" ? `tools/call ${(params as { name: string }).name}` : method, detail: JSON.stringify(msg) });
  const res = await fetch(`/mcp/h/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": MCP_VERSION, "x-haven-client": "alexa-sim" },
    body: JSON.stringify(msg),
  });
  if (notify) {
    log({ source: "alexa-sim", dir: "←", title: `${res.status} (notification accepted)` });
    return undefined;
  }
  const body = (await res.json()) as { result?: Record<string, unknown>; error?: { message: string } };
  log({ source: "alexa-sim", dir: "←", title: body.error ? `error: ${body.error.message}` : "result", detail: JSON.stringify(body).slice(0, 2000), isError: Boolean(body.error) });
  if (body.error) throw new Error(body.error.message);
  return body.result ?? {};
}

export function connect(): Promise<string[]> {
  ready ??= (async () => {
    await rpc("initialize", { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: "haven-simulated-alexa", version: "0.2.0" } });
    await rpc("notifications/initialized", undefined, true);
    const list = (await rpc("tools/list")) as { tools?: { name: string }[] };
    return (list.tools ?? []).map((t) => t.name);
  })().catch((err) => {
    ready = undefined;
    throw err;
  });
  return ready;
}

export function resetConnection() {
  ready = undefined;
}

export async function callTool<T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; data: T }> {
  await connect();
  const result = (await rpc("tools/call", { name, arguments: args })) as { isError?: boolean; structuredContent?: T };
  return { ok: !result.isError, data: (result.structuredContent ?? {}) as T };
}
