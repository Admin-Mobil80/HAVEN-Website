import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, type AppDeps } from "../../src/app.js";
import { SimulatedNotifier } from "../../src/notify/index.js";
import { MemoryRepo } from "../../src/store/memoryRepo.js";

export const SECRET = "test-household-secret-0123456789";

export type Harness = {
  base: string;
  host: string;
  repo: MemoryRepo;
  request: (method: string, path: string, opts?: { headers?: Record<string, string>; body?: string | object }) => Promise<RawResponse>;
  close: () => Promise<void>;
};

export type RawResponse = { status: number; headers: http.IncomingHttpHeaders; text: string; json: () => any };

// Starts the real app on an ephemeral loopback port. The listener exists before createApp so the
// Host allowlist can name the real port, exactly as local.ts does with PORT.
export async function startApp(over: Partial<AppDeps> = {}): Promise<Harness> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const host = `127.0.0.1:${port}`;
  const repo = (over.repo as MemoryRepo | undefined) ?? new MemoryRepo();
  const app = createApp({
    repo,
    notifier: new SimulatedNotifier(),
    householdSecret: SECRET,
    allowedHosts: [host, `localhost:${port}`],
    ...over,
  });
  server.on("request", app);

  // node:http (not fetch) so tests can forge the Host header for the DNS-rebinding case.
  const request: Harness["request"] = (method, path, opts = {}) =>
    new Promise((resolve, reject) => {
      const body = opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
      const headers: Record<string, string> = { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...opts.headers };
      if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body));
      const req = http.request({ host: "127.0.0.1", port, method, path, headers, agent: false }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json: () => JSON.parse(text) });
        });
      });
      req.on("error", reject);
      if (body !== undefined) req.write(body);
      req.end();
    });

  return {
    base: `http://${host}`,
    host,
    repo,
    request,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export const MCP_HEADERS = { accept: "application/json, text/event-stream" };

export const initializeBody = (id = 1) => ({
  jsonrpc: "2.0",
  id,
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "http-test", version: "1.0.0" } },
});
