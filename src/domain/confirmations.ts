import { declines, isAffirmative } from "./matchers.js";
import type { Confirmation, Household } from "./types.js";
import { CAPS } from "./types.js";
import { capPush, hashArgs, nextId } from "./util.js";

// Two-phase consent for anything that contacts a human on the elder's behalf. Phase 1 binds a
// confirmation to the exact arguments; phase 2 only succeeds after the HOST (never the model)
// has written an elder turn that is a clear yes. That is what makes the consent server-enforced.

export const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

export type ConsumeError =
  | "confirmation_not_found"
  | "confirmation_expired"
  | "confirmation_used"
  | "confirmation_superseded"
  | "args_mismatch"
  | "elder_not_confirmed";

export type ConsumeResult = { ok: true; confirmation: Confirmation } | { ok: false; code: ConsumeError };

export function issueConfirmation(
  doc: Household,
  tool: Confirmation["tool"],
  args: Record<string, unknown>,
  now: Date,
): Confirmation {
  // At most one live preview: her next "yes" answers the latest one only, never one she did not hear.
  const at = now.toISOString();
  for (const c of doc.confirmations) if (c.tool === tool && !c.usedAt && !c.supersededAt) c.supersededAt = at;
  const confirmation: Confirmation = {
    id: nextId(doc, "cf"),
    tool,
    argsHash: hashArgs(args),
    issuedAt: at,
  };
  capPush(doc.confirmations, confirmation, CAPS.confirmations);
  return confirmation;
}

// Marks the confirmation used on success (mutates doc; call inside repo.update).
export function consumeConfirmation(
  doc: Household,
  id: string,
  args: Record<string, unknown>,
  now: Date,
  tool: Confirmation["tool"] = "record_reply",
): ConsumeResult {
  const c = doc.confirmations.find((x) => x.id === id);
  if (!c || c.tool !== tool) return { ok: false, code: "confirmation_not_found" };
  if (c.usedAt) return { ok: false, code: "confirmation_used" };
  if (c.supersededAt) return { ok: false, code: "confirmation_superseded" };
  const issuedMs = Date.parse(c.issuedAt);
  if (now.getTime() - issuedMs > CONFIRMATION_TTL_MS) return { ok: false, code: "confirmation_expired" };
  if (c.argsHash !== hashArgs(args)) return { ok: false, code: "args_mismatch" };
  if (!elderSaidYesAfter(doc, issuedMs)) return { ok: false, code: "elder_not_confirmed" };
  c.usedAt = now.toISOString();
  return { ok: true, confirmation: c };
}

// The latest elder turn after the preview must be a clear yes, and no decline of any length may
// have come in between: a later unrelated "yes" must not revive a request she already declined.
function elderSaidYesAfter(doc: Household, issuedMs: number) {
  const after = doc.turns.filter((t) => t.speaker === "elder" && Date.parse(t.at) > issuedMs);
  if (after.length === 0) return false;
  if (after.some((t) => declines(t.text))) return false;
  const latest = after.reduce((a, b) => (Date.parse(b.at) >= Date.parse(a.at) ? b : a));
  return isAffirmative(latest.text, doc.members.map((m) => m.name)); // "yes, send it to Priya"
}
