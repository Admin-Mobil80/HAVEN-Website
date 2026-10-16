import type { Household } from "./types.js";
import { DAY } from "./util.js";

export type CallStats = {
  realCallsThisWeek: number; // every real call in the last 7 days, seeded demo history included
  promptedByHaven: number;
  demoSeeded: number; // how many of realCallsThisWeek are seeded demo data (the UI labels them)
  goal: number;
  baseline: number;
};

// "Real calls per week" is Haven's success metric: a rolling 7-day window ending at `now`.
export function callStats(doc: Household, now: Date): CallStats {
  const from = now.getTime() - 7 * DAY;
  const to = now.getTime();
  const calls = doc.contacts.filter((c) => {
    if (c.type !== "call") return false;
    const t = Date.parse(c.at);
    return t > from && t <= to;
  });
  return {
    realCallsThisWeek: calls.length,
    promptedByHaven: calls.filter((c) => c.promptedByHaven).length,
    demoSeeded: calls.filter((c) => c.demoSeed).length,
    goal: doc.goals.goalCallsPerWeek,
    baseline: doc.goals.baselineCallsPerWeek,
  };
}

// A call counts as prompted when Haven nudged the family in the 24 h before it: a digest,
// an alert that was delivered (not one that failed), or the family's own "I'll call tonight".
export function wasPromptedByHaven(doc: Household, now: Date): boolean {
  const since = now.getTime() - DAY;
  const recent = (iso: string | undefined) => iso !== undefined && Date.parse(iso) >= since && Date.parse(iso) <= now.getTime();
  return (
    doc.outbox.some((o) => (o.kind === "digest" || o.kind === "voice_note" || o.kind === "urgent_alert" || o.kind === "important_alert") && o.status !== "failed" && recent(o.at)) ||
    doc.digests.some((d) => recent(d.createdAt)) ||
    doc.messages.some((m) => m.kind === "call_promise" && recent(m.createdAt)) ||
    doc.incidents.some((i) => recent(i.alertDeliveredAt))
  );
}
