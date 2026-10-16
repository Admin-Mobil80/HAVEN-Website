// Household session and JSON helpers. The token comes from the URL hash (#t=...) for the real
// household's links, or from a fresh demo session (one per browser tab, in sessionStorage, so two
// judge windows never share a household).

const KEY = "haven.token";

export function tokenFromHash(): string | undefined {
  const m = location.hash.match(/[#&]t=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

function stored(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function store(token: string) {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* private mode: the token lives only in memory */
  }
}

let current: string | undefined;

export async function ensureToken(): Promise<string> {
  current ??= tokenFromHash() ?? stored();
  if (current) {
    store(current);
    return current;
  }
  const r = await fetch("/api/demo/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error(`Could not start a demo session (${r.status})`);
  const body = (await r.json()) as { token: string };
  current = body.token;
  store(current);
  return current;
}

export function getToken() {
  return current;
}

export async function newDemoSession() {
  current = undefined;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  if (location.hash) history.replaceState(null, "", location.pathname);
  return ensureToken();
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; raw?: Blob; contentType?: string } = {}): Promise<T> {
  const token = await ensureToken();
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  let body: BodyInit | undefined;
  if (init.raw) {
    body = init.raw;
    headers["content-type"] = init.contentType ?? init.raw.type;
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    headers["content-type"] = "application/json";
  }
  const r = await fetch(path, { method: init.method ?? (body ? "POST" : "GET"), headers, body });
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new ApiError(r.status, data.error ?? `http_${r.status}`);
  return data as T;
}

// Polls while the tab is visible; stops after 10 idle minutes to save the free tier.
export function poll(fn: () => Promise<void>, everyMs: number) {
  let last = Date.now();
  let stopped = false;
  const touch = () => (last = Date.now());
  addEventListener("pointerdown", touch);
  addEventListener("keydown", touch);
  const tick = async () => {
    if (stopped) return;
    if (document.visibilityState === "visible" && Date.now() - last < 10 * 60_000) await fn().catch(() => undefined);
    setTimeout(tick, everyMs);
  };
  void tick();
  return () => {
    stopped = true;
    removeEventListener("pointerdown", touch);
    removeEventListener("keydown", touch);
  };
}
