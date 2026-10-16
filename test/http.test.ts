import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { signToken, verifyToken } from "../src/http/households.js";
import { signMediaUrl } from "../src/http/media.js";
import { MemoryRepo } from "../src/store/memoryRepo.js";
import { seedHousehold } from "../src/store/seed.js";
import { initializeBody, MCP_HEADERS, SECRET, startApp, type Harness } from "./helpers/httpHarness.js";

let h: Harness;
before(async () => {
  h = await startApp();
});
after(async () => {
  await h.close();
});

async function connect(path: string, headers: Record<string, string> = {}) {
  const client = new Client({ name: "http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(path, h.base), { requestInit: { headers } });
  await client.connect(transport);
  return { client, transport };
}

async function demoSession() {
  const res = await h.request("POST", "/api/demo/session");
  assert.equal(res.status, 201);
  return res.json() as { householdId: string; token: string; mcpUrl: string };
}

test("initialize echoes protocol version 2025-11-25 (raw POST)", async () => {
  const res = await h.request("POST", "/mcp", { headers: MCP_HEADERS, body: initializeBody() });
  assert.equal(res.status, 200);
  assert.match(String(res.headers["content-type"]), /application\/json/);
  const body = res.json();
  assert.equal(body.result.protocolVersion, "2025-11-25");
  assert.equal(res.headers["mcp-session-id"], undefined, "stateless server issues no session id");
});

test("the real SDK client connects, negotiates 2025-11-25 and lists tools", async () => {
  const { client, transport } = await connect("/mcp");
  assert.equal(transport.protocolVersion, "2025-11-25");
  const { tools } = await client.listTools();
  assert.ok(tools.length > 0);
  await client.close();
});

test("a notification is accepted with 202 and no body", async () => {
  const res = await h.request("POST", "/mcp", {
    headers: { ...MCP_HEADERS, "mcp-protocol-version": "2025-11-25" },
    body: { jsonrpc: "2.0", method: "notifications/initialized" },
  });
  assert.equal(res.status, 202);
  assert.equal(res.text, "");
});

test("GET and DELETE /mcp return 405 with Allow: POST", async () => {
  for (const method of ["GET", "DELETE"]) {
    for (const path of ["/mcp", "/mcp/h/anything"]) {
      const res = await h.request(method, path, { headers: MCP_HEADERS });
      assert.equal(res.status, 405, `${method} ${path}`);
      assert.equal(res.headers.allow, "POST");
    }
  }
});

test("a missing or wrong Accept header is rejected with 406", async () => {
  const wrong = await h.request("POST", "/mcp", { headers: { accept: "text/html" }, body: initializeBody() });
  assert.equal(wrong.status, 406);
  const missing = await h.request("POST", "/mcp", { body: initializeBody() });
  assert.equal(missing.status, 406);
});

test("an unsupported MCP-Protocol-Version header is rejected with 400", async () => {
  const res = await h.request("POST", "/mcp", {
    headers: { ...MCP_HEADERS, "mcp-protocol-version": "1999-01-01" },
    body: { jsonrpc: "2.0", id: 2, method: "tools/list" },
  });
  assert.equal(res.status, 400);
  assert.match(res.json().error.message, /protocol version/i);
});

test("a foreign Origin is rejected with 403; same-origin and no-origin pass", async () => {
  const foreign = await h.request("POST", "/mcp", { headers: { ...MCP_HEADERS, origin: "https://evil.example" }, body: initializeBody() });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.json().error.code, -32000);

  const same = await h.request("POST", "/mcp", { headers: { ...MCP_HEADERS, origin: h.base }, body: initializeBody() });
  assert.equal(same.status, 200);

  const nullOrigin = await h.request("POST", "/mcp", { headers: { ...MCP_HEADERS, origin: "null" }, body: initializeBody() });
  assert.equal(nullOrigin.status, 403);

  const api = await h.request("GET", "/api/health", { headers: { origin: "https://evil.example" } });
  assert.equal(api.status, 403);
  assert.deepEqual(api.json(), { error: "origin_not_allowed" });
});

test("DNS rebinding: a foreign Host is rejected even when Origin matches it", async () => {
  for (const origin of ["http://evil.example", "https://evil.example", undefined]) {
    const headers: Record<string, string> = { ...MCP_HEADERS, host: "evil.example" };
    if (origin) headers.origin = origin;
    const res = await h.request("POST", "/mcp", { headers, body: initializeBody() });
    assert.equal(res.status, 403, `origin ${origin}`);
  }
  const lookalike = await h.request("POST", "/mcp", { headers: { ...MCP_HEADERS, host: "x.y.lambda-url.ap-south-1.on.aws" }, body: initializeBody() });
  assert.equal(lookalike.status, 403, "only one DNS label may precede the Lambda URL suffix");
});

test("a Lambda function URL host is allowed with its https origin", async () => {
  const host = "abcdef0123456789abcdef0123456789.lambda-url.ap-south-1.on.aws";
  const res = await h.request("POST", "/mcp", { headers: { ...MCP_HEADERS, host, origin: `https://${host}` }, body: initializeBody() });
  assert.equal(res.status, 200);
  const plain = await h.request("POST", "/mcp", { headers: { ...MCP_HEADERS, host, origin: `http://${host}` }, body: initializeBody() });
  assert.equal(plain.status, 403, "plain http origin is only accepted for localhost");
});

test("malformed JSON returns a JSON-RPC parse error (-32700)", async () => {
  const res = await h.request("POST", "/mcp", { headers: MCP_HEADERS, body: '{"jsonrpc":"2.0","id":1,"method":' });
  assert.equal(res.status, 400);
  const body = res.json();
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.error.code, -32700);
  assert.equal(body.id, null);

  const api = await h.request("POST", "/api/messages", { body: "{nope" });
  assert.equal(api.status, 400);
  assert.deepEqual(api.json(), { error: "invalid_json" });
});

test("JSON-RPC batch arrays are rejected", async () => {
  const res = await h.request("POST", "/mcp", { headers: MCP_HEADERS, body: [initializeBody(1), initializeBody(2)] });
  assert.equal(res.status, 400);
  const body = res.json();
  assert.equal(body.error.code, -32600);
  assert.equal(body.error.message, "Batch requests are not supported");
});

test("an oversized body is rejected with 413", async () => {
  const big = JSON.stringify({ ...initializeBody(), pad: "x".repeat(300 * 1024) });
  const res = await h.request("POST", "/mcp", { headers: MCP_HEADERS, body: big });
  assert.equal(res.status, 413);
});

test("a malformed percent-encoded route param is a 400, not a logged 500", async () => {
  const token = signToken("demo-abc", SECRET);
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void errors.push(args);
  try {
    const media = await h.request("GET", "/api/media/%E0%A4%A?exp=1&sig=x");
    assert.equal(media.status, 400);
    assert.deepEqual(media.json(), { error: "bad_request" });
    const ack = await h.request("POST", "/api/incidents/%E0%A4%A/ack", { headers: { authorization: `Bearer ${token}` }, body: {} });
    assert.equal(ack.status, 400);
    const anon = await h.request("POST", "/api/incidents/%E0%A4%A/ack", { body: {} });
    assert.ok(anon.status === 400 || anon.status === 401, String(anon.status));
    const mcp = await h.request("POST", "/mcp/h/%E0%A4%A", { headers: MCP_HEADERS, body: initializeBody() });
    assert.equal(mcp.status, 400);
    assert.equal(mcp.json().jsonrpc, "2.0");
    assert.equal(mcp.json().error.code, -32600);
  } finally {
    console.error = original;
  }
  assert.deepEqual(errors, [], "client errors are not logged as errors");
});

test("per-IP rate limit returns 429 with Retry-After", async () => {
  const small = await startApp({ rateLimits: { mcp: 3, api: 2 }, now: () => new Date("2026-10-15T10:00:30Z") });
  try {
    for (let i = 0; i < 3; i++) {
      const ok = await small.request("POST", "/mcp", { headers: MCP_HEADERS, body: initializeBody(i) });
      assert.equal(ok.status, 200);
    }
    const limited = await small.request("POST", "/mcp", { headers: MCP_HEADERS, body: initializeBody(9) });
    assert.equal(limited.status, 429);
    assert.equal(limited.json().error.message, "Too many requests");
    assert.ok(Number(limited.headers["retry-after"]) > 0);

    await small.request("GET", "/api/state/elder");
    await small.request("GET", "/api/state/elder");
    const api = await small.request("GET", "/api/state/elder");
    assert.equal(api.status, 429);
    assert.deepEqual(api.json(), { error: "rate_limited" });
    const health = await small.request("GET", "/api/health");
    assert.equal(health.status, 200, "health checks are never rate limited");
  } finally {
    await small.close();
  }
});

test("an invalid bearer token or path token gets 401", async () => {
  const forged = `${"demo-abc"}.${"A".repeat(43)}`;
  const bearer = await h.request("POST", "/mcp", { headers: { ...MCP_HEADERS, authorization: `Bearer ${forged}` }, body: initializeBody() });
  assert.equal(bearer.status, 401);
  assert.equal(bearer.json().jsonrpc, "2.0");
  assert.match(String(bearer.headers["www-authenticate"]), /invalid_token/);

  const path = await h.request("POST", `/mcp/h/${forged}`, { headers: MCP_HEADERS, body: initializeBody() });
  assert.equal(path.status, 401);

  const other = signToken("demo-abc", "a-different-secret-entirely");
  const wrongSecret = await h.request("POST", "/mcp", { headers: { ...MCP_HEADERS, authorization: `Bearer ${other}` }, body: initializeBody() });
  assert.equal(wrongSecret.status, 401);

  const api = await h.request("GET", "/api/state/family", { headers: { authorization: `Bearer ${forged}` } });
  assert.equal(api.status, 401);
  assert.deepEqual(api.json(), { error: "unauthorized" });
});

test("a valid token for a household that no longer exists gets 404", async () => {
  const token = signToken("demo-expired", SECRET);
  const res = await h.request("POST", `/mcp/h/${token}`, { headers: MCP_HEADERS, body: initializeBody() });
  assert.equal(res.status, 404);
  const api = await h.request("GET", "/api/state/elder", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(api.status, 404);
});

test("token signing round-trips and rejects tampering", () => {
  const t = signToken("demo-123", SECRET);
  assert.equal(verifyToken(t, SECRET), "demo-123");
  assert.equal(verifyToken(t.replace("demo-123", "demo-124"), SECRET), undefined);
  assert.equal(verifyToken(`${t}x`, SECRET), undefined);
  assert.equal(verifyToken("no-dot", SECRET), undefined);
  assert.throws(() => signToken("../etc", SECRET));
});

test("tokenless /mcp uses the auto-created public demo household", async () => {
  const { client } = await connect("/mcp", { "x-haven-client": "inspector" });
  await client.listTools();
  await client.close();
  const doc = await h.repo.get("public-demo");
  assert.ok(doc, "public demo household was created");
  assert.equal(doc.demo, true);
  const log = await h.repo.listLog("public-demo");
  assert.ok(log.some((e) => e.client === "inspector" && e.method === "tools/list"));
});

test("/mcp/h/<token> scopes calls to that household, and two demo sessions are isolated", async () => {
  const a = await demoSession();
  const b = await demoSession();
  assert.notEqual(a.householdId, b.householdId);
  assert.match(a.householdId, /^demo-[0-9a-f]+$/);
  assert.equal(a.mcpUrl, `/mcp/h/${a.token}`);

  const { client } = await connect(a.mcpUrl, { "x-haven-client": "inspector" });
  const content = "Grows tulsi on the balcony and waters it at dawn";
  const out = await client.callTool({ name: "remember", arguments: { type: "routine", content } });
  assert.notEqual(out.isError, true);
  await client.close();

  const docA = await h.repo.get(a.householdId);
  const docB = await h.repo.get(b.householdId);
  const demo = await h.repo.get("public-demo");
  assert.ok(docA?.memories.some((m) => m.content === content));
  assert.ok(!docB?.memories.some((m) => m.content === content));
  assert.ok(!demo?.memories.some((m) => m.content === content));

  const logA = await h.repo.listLog(a.householdId);
  assert.ok(logA.some((e) => e.method === "tools/call" && e.tool === "remember" && !e.isError));
  assert.equal((await h.repo.listLog(b.householdId)).length, 0);

  const famA = await h.request("GET", "/api/state/family", { headers: { authorization: `Bearer ${a.token}` } });
  const famB = await h.request("GET", "/api/state/family", { headers: { authorization: `Bearer ${b.token}` } });
  assert.equal(famA.json().householdId, a.householdId);
  assert.equal(famB.json().householdId, b.householdId);
  assert.ok(JSON.stringify(famA.json()).includes(content));
  assert.ok(!JSON.stringify(famB.json()).includes(content));
});

test("the bearer header wins over the path token", async () => {
  const a = await demoSession();
  const b = await demoSession();
  const { client } = await connect(`/mcp/h/${b.token}`, { authorization: `Bearer ${a.token}`, "x-haven-client": "inspector" });
  await client.listTools();
  await client.close();
  assert.ok((await h.repo.listLog(a.householdId)).length > 0);
  assert.equal((await h.repo.listLog(b.householdId)).length, 0);
});

test("the simulator and agent clients are not written to the activity log", async () => {
  const s = await demoSession();
  for (const name of ["alexa-sim", "agent"]) {
    const { client } = await connect(s.mcpUrl, { "x-haven-client": name });
    await client.listTools();
    await client.close();
  }
  assert.equal((await h.repo.listLog(s.householdId)).length, 0);
});

test("private text never reaches the family-visible activity log", async () => {
  const s = await demoSession();
  const secret = "Don't tell Priya that I skipped the temple trip because my knee hurt";
  const { client } = await connect(s.mcpUrl, { "x-haven-client": "inspector" });
  await client.callTool({ name: "remember", arguments: { type: "event", content: secret, private: true } });
  await client.close();
  const doc = await h.repo.get(s.householdId);
  assert.ok(doc?.memories.some((m) => m.content === secret && m.private));
  const stored = JSON.stringify(await h.repo.listLog(s.householdId));
  assert.ok(!stored.includes("temple trip"));
  const res = await h.request("GET", "/api/log", { headers: { authorization: `Bearer ${s.token}` } });
  assert.equal(res.status, 200);
  assert.ok(res.json().entries.length > 0);
  assert.ok(!res.text.includes("temple trip"));
  const fam = await h.request("GET", "/api/state/family", { headers: { authorization: `Bearer ${s.token}` } });
  assert.ok(!fam.text.includes("temple trip"));
});

test("media URLs are signed and verified; no store configured means 404", async () => {
  const url = signMediaUrl("hh/demo/voice.mp3", SECRET, new Date());
  assert.match(url, /^\/api\/media\/hh%2Fdemo%2Fvoice\.mp3\?exp=\d+&sig=/);
  const ok = await h.request("GET", url);
  assert.equal(ok.status, 404);
  assert.deepEqual(ok.json(), { error: "media_store_not_configured" });

  const tampered = await h.request("GET", url.replace("voice.mp3", "other.mp3"));
  assert.equal(tampered.status, 403);
  const expired = signMediaUrl("k.mp3", SECRET, new Date(Date.now() - 2 * 24 * 3600 * 1000));
  const exp = await h.request("GET", expired);
  assert.equal(exp.status, 403);
  assert.deepEqual(exp.json(), { error: "media_url_expired" });
});

test("health, placeholder page, unknown API routes and security headers", async () => {
  const health = await h.request("GET", "/api/health");
  assert.deepEqual(health.json(), { ok: true });
  assert.equal(health.headers["x-content-type-options"], "nosniff");
  assert.equal(health.headers["referrer-policy"], "no-referrer");
  assert.equal(health.headers["x-powered-by"], undefined);

  const page = await h.request("GET", "/");
  assert.equal(page.status, 200);
  assert.match(String(page.headers["content-type"]), /text\/html/);
  assert.ok(page.text.includes("/mcp"));
  assert.ok(!page.text.includes("<script"));

  const unknown = await h.request("GET", "/api/nope");
  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.json(), { error: "not_found" });
});

test("a built web app is served with an SPA fallback and immutable hashed assets", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "haven-web-"));
  await mkdir(path.join(dir, "assets"));
  await writeFile(path.join(dir, "index.html"), "<!doctype html><title>Haven</title><div id=root></div>");
  await writeFile(path.join(dir, "assets", "app-abc123.js"), "console.log('hi')");
  const web = await startApp({ webDir: dir });
  try {
    for (const p of ["/", "/family", "/setup/step-2"]) {
      const res = await web.request("GET", p);
      assert.equal(res.status, 200, p);
      assert.ok(res.text.includes("<title>Haven</title>"), p);
    }
    const asset = await web.request("GET", "/assets/app-abc123.js");
    assert.equal(asset.status, 200);
    assert.match(String(asset.headers["cache-control"]), /immutable/);
    assert.equal((await web.request("GET", "/assets/missing.js")).status, 404);
    const api = await web.request("GET", "/api/unknown");
    assert.deepEqual(api.json(), { error: "not_found" });
    assert.equal((await web.request("GET", "/mcp")).status, 405);
  } finally {
    await web.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a seeded owner household is reachable only with its own token", async () => {
  await h.repo.create(seedHousehold("owner-1", new Date(), { demo: false }));
  const token = signToken("owner-1", SECRET);
  const res = await h.request("GET", "/api/state/elder", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  assert.equal(res.json().householdId, "owner-1");
});

const toolCall = (id: number, name = "get_reminders", args: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});

test("the per-household limit caps tools/call on the public demo however many IPs share it", async () => {
  const small = await startApp({ rateLimits: { household: 3 }, now: () => new Date("2026-10-15T10:00:30Z") });
  try {
    const fromIp = (i: number) => ({ ...MCP_HEADERS, "x-forwarded-for": `198.51.100.${i}` });
    for (let i = 0; i < 3; i++) {
      const ok = await small.request("POST", "/mcp", { headers: fromIp(i), body: toolCall(i) });
      assert.equal(ok.status, 200, `call ${i}`);
    }
    const limited = await small.request("POST", "/mcp", { headers: fromIp(50), body: toolCall(7) });
    assert.equal(limited.status, 429);
    assert.deepEqual(limited.json(), { jsonrpc: "2.0", error: { code: -32000, message: "Too many requests for this household" }, id: 7 });
    assert.ok(Number(limited.headers["retry-after"]) > 0);
    // Only tools/call is counted: initialize still works.
    assert.equal((await small.request("POST", "/mcp", { headers: fromIp(51), body: initializeBody() })).status, 200);

    // Another household has its own budget, shared by its MCP calls and its family's POST routes.
    const s = (await small.request("POST", "/api/demo/session")).json() as { token: string };
    const auth = { authorization: `Bearer ${s.token}` };
    assert.equal((await small.request("POST", "/mcp", { headers: { ...fromIp(60), ...auth }, body: toolCall(1) })).status, 200);
    assert.equal((await small.request("POST", "/api/messages", { headers: { ...fromIp(61), ...auth }, body: { text: "hi" } })).status, 201);
    assert.equal((await small.request("POST", "/api/messages", { headers: { ...fromIp(62), ...auth }, body: { text: "hi" } })).status, 201);
    const api = await small.request("POST", "/api/messages", { headers: { ...fromIp(63), ...auth }, body: { text: "hi" } });
    assert.equal(api.status, 429);
    assert.deepEqual(api.json(), { error: "rate_limited" });
    assert.ok(Number(api.headers["retry-after"]) > 0);
  } finally {
    await small.close();
  }
});

test("the per-household daily cap bounds a slow, steady flood", async () => {
  let t = Date.parse("2026-10-15T10:00:30Z");
  const small = await startApp({ rateLimits: { household: 1000, householdDaily: 2 }, now: () => new Date(t) });
  try {
    for (let i = 0; i < 2; i++) {
      t += 61_000; // a new minute each time, so only the daily counter can stop it
      assert.equal((await small.request("POST", "/mcp", { headers: MCP_HEADERS, body: toolCall(i) })).status, 200);
    }
    t += 61_000;
    const limited = await small.request("POST", "/mcp", { headers: MCP_HEADERS, body: toolCall(9) });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers["retry-after"]) > 60, "retry after the day rolls over");
  } finally {
    await small.close();
  }
});

test("tools/call on the public demo does not re-read the whole document to resolve or log it", async () => {
  const repo = new MemoryRepo();
  let reads = 0;
  const get = repo.get.bind(repo);
  repo.get = async (id: string) => {
    reads++;
    return get(id);
  };
  const app = await startApp({ repo });
  try {
    const headers = { ...MCP_HEADERS, "x-haven-client": "inspector" }; // a logged client
    assert.equal((await app.request("POST", "/mcp", { headers, body: toolCall(1) })).status, 200);
    reads = 0;
    for (let i = 2; i < 5; i++) assert.equal((await app.request("POST", "/mcp", { headers, body: toolCall(i) })).status, 200);
    assert.equal(reads, 3, "one read per call: the tool's own");
  } finally {
    await app.close();
  }
});

test("a real household's start_escalation is never blocked by the per-household cap; a demo's is", async () => {
  const small = await startApp({ rateLimits: { household: 1 }, now: () => new Date("2026-10-15T10:00:30Z") });
  try {
    await small.repo.create(seedHousehold("owner-2", new Date("2026-10-15T10:00:00Z"), { demo: false }));
    const headers = { ...MCP_HEADERS, authorization: `Bearer ${signToken("owner-2", SECRET)}` };
    assert.equal((await small.request("POST", "/mcp", { headers, body: toolCall(1) })).status, 200);
    assert.equal((await small.request("POST", "/mcp", { headers, body: toolCall(2) })).status, 429, "ordinary calls are capped");
    const alert = toolCall(3, "start_escalation", { tier: "urgent", reason: "fall", elder_words: "I fell", emergency: true });
    const res = await small.request("POST", "/mcp", { headers, body: alert });
    assert.equal(res.status, 200);
    assert.equal(res.json().result.structuredContent.action, "opened");

    // The tokenless public demo has no such exemption.
    assert.equal((await small.request("POST", "/mcp", { headers: MCP_HEADERS, body: toolCall(4) })).status, 200);
    assert.equal((await small.request("POST", "/mcp", { headers: MCP_HEADERS, body: { ...alert, id: 5 } })).status, 429);
  } finally {
    await small.close();
  }
});
