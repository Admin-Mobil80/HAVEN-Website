// Pinned SDK version (verified MIT, 4.28.0). Do not use @latest.
const ANAM_SDK = "https://esm.sh/@anam-ai/js-sdk@4.28.0";
const $ = (id) => document.getElementById(id);

// ---------- Minimal real MCP client (Streamable HTTP, JSON responses) ----------
const MCP_VERSION = "2025-11-25";
let rpcId = 0;
const logEl = $("log");
function log(dir, obj) {
  const line = document.createElement("div");
  line.textContent = `${dir} ${JSON.stringify(obj)}`;
  logEl.append(line);
  logEl.scrollTop = logEl.scrollHeight;
}
async function rpc(method, params, { notify = false } = {}) {
  const msg = { jsonrpc: "2.0", method, ...(params ? { params } : {}), ...(notify ? {} : { id: ++rpcId }) };
  log("→", msg);
  const res = await fetch("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": MCP_VERSION },
    body: JSON.stringify(msg),
  });
  if (notify) return null;
  const body = await res.json();
  log("←", body);
  if (body.error) throw new Error(body.error.message);
  return body.result;
}
let ready;
function mcpReady() {
  ready ??= (async () => {
    await rpc("initialize", { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: "haven-simulated-alexa", version: "0.1.0" } });
    await rpc("notifications/initialized", undefined, { notify: true });
    await rpc("tools/list");
  })();
  return ready;
}
async function callTool(name, args) {
  await mcpReady();
  const result = await rpc("tools/call", { name, arguments: args });
  return { isError: Boolean(result.isError), data: JSON.parse(result.content[0].text) };
}

// ---------- Tiny intent router (stand-in for Alexa+ language understanding) ----------
function route(u) {
  const s = u.toLowerCase();
  const who = s.includes("meera") ? "meera" : "aarav";
  const name = who === "meera" ? "Meera" : "Aarav";
  if (/news|update|family|anything new/.test(s) && !/tell|ask/.test(s)) return { tool: "get_family_updates", args: {} };
  if (/call/.test(s)) return { tool: "request_call", args: { relative_id: who }, confirmable: `Ask ${name} to call you?` };
  if (/tell|message|say/.test(s)) {
    const msg = u.replace(/^.*?\b(tell|message|say to)\s+\w+\s*/i, "").trim() || u;
    return { tool: "send_message_to_family", args: { relative_id: who, message: msg.slice(0, 280) }, confirmable: `Send ${name}: "${msg.slice(0, 280)}"?` };
  }
  if (/water|medicine|pill|help|unwell|sick/.test(s)) {
    const need = /water/.test(s) ? "water" : /medicine|pill/.test(s) ? "medicine_reminder" : /unwell|sick/.test(s) ? "feeling_unwell" : "other";
    return { tool: "escalate_need", args: { need, urgency: need === "feeling_unwell" ? "high" : "normal" }, confirmable: `Let your family know you need help (${need.replace("_", " ")})? This is not an emergency service. For emergencies call 112.` };
  }
  if (/low|sad|lonely|tired|anxious|worried/.test(s)) return { tool: "log_checkin", args: { mood: /anxious|worried/.test(s) ? "anxious" : "low", topics: ["other"], concern: /lonely/.test(s) ? "lonely" : "none", note: u.slice(0, 200) } };
  return null;
}

function say(text) { const el = $("reply"); el.hidden = false; el.textContent = text; }
function summarize(tool, r) {
  const d = r.data;
  if (r.isError) return "Sorry, that did not work. Nothing was sent.";
  if (tool === "get_family_updates") return d.updates.length ? d.updates.map((x) => `${x.from}: ${x.text}`).join("  |  ") : "No new news from family.";
  if (tool === "log_checkin") return "Thanks for telling me. I noted how you are feeling. Would you like me to ask someone to call you?";
  if (d.status === "sent") return `Sent to ${d.to}.`;
  if (d.status === "requested") return `I asked ${d.to} to call you.`;
  if (d.status === "family_notified") return `I let ${d.notified.join(" and ")} know. If this is an emergency, call 112.`;
  return JSON.stringify(d);
}

let pending = null;
async function handleUtterance(u) {
  $("confirm").hidden = true; pending = null;
  const intent = route(u);
  if (!intent) return say("I can read family news, message or call a relative, note how you feel, or let family know you need help.");
  const first = await callTool(intent.tool, intent.args);
  if (first.data.status === "needs_confirmation") {
    pending = { tool: intent.tool, args: { ...intent.args, confirmed: true } };
    $("confirm-text").textContent = intent.confirmable;
    $("confirm").hidden = false;
    $("yes").focus();
    return;
  }
  say(summarize(intent.tool, first));
  refresh();
}
$("send").onclick = () => { const v = $("utter").value.trim(); if (v) handleUtterance(v).catch((e) => say(`Error: ${e.message}`)); };
$("utter").onkeydown = (e) => { if (e.key === "Enter") $("send").click(); };
$("yes").onclick = async () => {
  if (!pending) return;
  const p = pending; pending = null; $("confirm").hidden = true;
  say(summarize(p.tool, await callTool(p.tool, p.args))); refresh();
};
$("no").onclick = () => { pending = null; $("confirm").hidden = true; say("Okay, I did not send anything."); };

// ---------- Family dashboard ----------
async function refresh() {
  const s = await (await fetch("/api/state")).json();
  const d = s.digest;
  $("digest").innerHTML = `<div class="say"><strong>Daily digest for ${s.elder.name}</strong><br>
    Check-ins: ${d.checkinsToday} · Low moods: ${d.lowMoodCount} · Concerns: ${d.concerns.join(", ") || "none"}<br>
    Human contacts prompted: <strong>${d.humanContactsPrompted}</strong> · Unread from family: ${d.unreadFromFamily}</div>`;
  const nameOf = (id) => s.relatives.find((r) => r.id === id)?.name ?? id;
  $("outbox").innerHTML = s.outbox.map((o) => `<li>${o.kind.replace("_", " ")} to ${nameOf(o.to)}: ${o.body} <span class="badge">${o.delivered}</span></li>`).join("") || '<li class="muted">Nothing sent yet.</li>';
  $("updates").innerHTML = s.updates.filter((u) => !u.read).map((u) => `<li>${nameOf(u.from)} (${u.kind.replace("_", " ")}): ${u.text}</li>`).join("") || '<li class="muted">All read.</li>';
}
$("reset").onclick = async () => { await fetch("/api/reset", { method: "POST" }); $("reply").hidden = true; $("confirm").hidden = true; logEl.textContent = ""; refresh(); };

// ---------- Anam avatar (falls back to text-only if unavailable) ----------
let anam = null;
const status = (t) => ($("avatar-status").textContent = t);
$("start").onclick = async () => {
  $("start").disabled = true;
  status("Connecting…");
  try {
    const r = await fetch("/api/anam/session-token", { method: "POST" });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error === "anam_not_configured" ? "Avatar not configured on this server." : `Avatar unavailable (${body.error}).`);
    const { createClient, AnamEvent } = await import(ANAM_SDK);
    anam = createClient(body.sessionToken);
    anam.addListener(AnamEvent.CONNECTION_CLOSED, () => { status("Conversation ended."); $("stop").disabled = true; $("start").disabled = false; });
    anam.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (msgs) => {
      const last = msgs?.[msgs.length - 1];
      if (last) { const c = $("captions"); c.hidden = false; c.textContent = `${last.role === "user" ? "You" : "Haven"}: ${last.content}`; }
    });
    await anam.streamToVideoElement("avatar");
    status("Connected. Haven is an AI companion. Say hello.");
    $("stop").disabled = false;
  } catch (e) {
    status(`${e.message} Text-only mode is on: use the Alexa+ box instead.`);
    $("start").disabled = false;
  }
};
$("stop").onclick = async () => { await anam?.stopStreaming(); anam = null; status("Stopped."); $("stop").disabled = true; $("start").disabled = false; };

refresh();
