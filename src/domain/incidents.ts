import type { EscalationReason, Household, Incident } from "./types.js";
import { CAPS } from "./types.js";
import { capPush, nextId } from "./util.js";

// Incident lock. At most one incident is active (open or acknowledged) per household; new
// triggers attach to it instead of opening duplicates. Only humans release the lock (cancel or
// close through /api routes); no MCP tool can.

export const REALERT_AFTER_MS = 2 * 60 * 1000;
const TIMELINE_CAP = 60; // CAPS has no per-incident entry; 60 events covers any real incident

export type EscalationInput = {
  tier: "urgent" | "important";
  emergency: boolean;
  source: Incident["source"];
  reason: EscalationReason;
  elderWords: string;
};

export type OpenOrUpgradeResult = {
  incident: Incident;
  action: "opened" | "upgraded" | "appended";
  shouldAlert: boolean;
};

export const isActive = (i: Incident) => i.state === "open" || i.state === "acknowledged";

export function activeIncident(doc: Household): Incident | undefined {
  for (let i = doc.incidents.length - 1; i >= 0; i--) if (isActive(doc.incidents[i])) return doc.incidents[i];
  return undefined;
}

// important = 1 < urgent = 2 < urgent + emergency = 3. An emergency is always urgent.
const rank = (tier: "urgent" | "important", emergency: boolean) => (emergency ? 3 : tier === "urgent" ? 2 : 1);
const label = (r: number) => (r === 3 ? "urgent+emergency" : r === 2 ? "urgent" : "important");

// Every timeline write goes through here so the per-incident cap always holds.
export function addEvent(incident: Incident, at: string, event: string, detail?: string) {
  capPush(incident.timeline, detail === undefined ? { at, event } : { at, event, detail }, TIMELINE_CAP);
}

export function openOrUpgrade(doc: Household, input: EscalationInput, now: Date): OpenOrUpgradeResult {
  const at = now.toISOString();
  const incoming = rank(input.tier, input.emergency);
  const detail = `${input.source}:${input.reason}`;
  const active = activeIncident(doc);

  if (!active) {
    const incident: Incident = {
      id: nextId(doc, "inc"),
      tier: incoming >= 2 ? "urgent" : "important",
      emergency: incoming === 3,
      source: input.source,
      reason: input.reason,
      elderWords: input.elderWords,
      state: "open",
      openedAt: at,
      lastAlertAt: at,
      timeline: [{ at, event: "opened", detail: `${label(incoming)}:${detail}` }],
    };
    capPush(doc.incidents, incident, CAPS.incidents);
    return { incident, action: "opened", shouldAlert: true };
  }

  const current = rank(active.tier, active.emergency);
  if (incoming > current) {
    active.tier = "urgent";
    active.emergency = incoming === 3;
    active.reason = input.reason;
    active.elderWords = input.elderWords;
    // A more serious situation needs a fresh acknowledgement; the earlier ack stays in the timeline.
    active.state = "open";
    delete active.ackBy;
    active.lastAlertAt = at;
    delete active.alertDeliveredAt; // the family has not yet heard about the more serious situation
    addEvent(active, at, "upgraded", `${label(current)}->${label(incoming)}:${detail}`);
    return { incident: active, action: "upgraded", shouldAlert: true };
  }

  if (incoming === current) {
    // lastAlertAt is rolled back when every send failed (start_escalation), so a failed alert is
    // retried on the next trigger instead of being suppressed for 2 minutes.
    const last = active.lastAlertAt ? Date.parse(active.lastAlertAt) : 0;
    const shouldAlert = now.getTime() - last > REALERT_AFTER_MS;
    if (shouldAlert) active.lastAlertAt = at;
    addEvent(active, at, "retrigger", detail);
    return { incident: active, action: "appended", shouldAlert };
  }

  addEvent(active, at, "retrigger_lower_tier", `${label(incoming)}:${detail}`);
  return { incident: active, action: "appended", shouldAlert: false };
}

function find(doc: Household, id: string) {
  const incident = doc.incidents.find((i) => i.id === id);
  if (!incident) throw new Error("incident_not_found");
  if (!isActive(incident)) throw new Error("incident_not_active");
  return incident;
}

// The ack/cancel/close functions are called only from human-only /api routes.
export function ackIncident(doc: Household, id: string, by: string, now: Date): Incident {
  const incident = find(doc, id);
  incident.state = "acknowledged";
  incident.ackBy = by;
  addEvent(incident, now.toISOString(), "acknowledged", by);
  return incident;
}

export function cancelIncident(doc: Household, id: string, by: string, now: Date): Incident {
  return release(find(doc, id), "cancelled", by, now);
}

export function closeIncident(doc: Household, id: string, by: string, now: Date): Incident {
  return release(find(doc, id), "closed", by, now);
}

function release(incident: Incident, state: "cancelled" | "closed", by: string, now: Date) {
  const at = now.toISOString();
  incident.state = state;
  incident.closedBy = by;
  incident.closedAt = at;
  addEvent(incident, at, state, by);
  return incident;
}
