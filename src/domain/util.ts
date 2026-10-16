import { createHash } from "node:crypto";
import type { Household } from "./types.js";

// Stable, readable ids scoped to a household ("d_12"). Mutates doc.seq, so call inside repo.update.
export function nextId(doc: Household, prefix: string) {
  doc.seq += 1;
  return `${prefix}_${doc.seq}`;
}

// Push and drop the oldest items beyond `cap`.
export function capPush<T>(list: T[], item: T, cap: number) {
  list.push(item);
  if (list.length > cap) list.splice(0, list.length - cap);
}

// Calendar date in India (the digest day), e.g. "2026-10-15".
export function istDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Deterministic hash of tool arguments (key order independent) for confirmation binding.
export function hashArgs(args: Record<string, unknown>) {
  const canonical = JSON.stringify(Object.keys(args).sort().map((k) => [k, args[k]]));
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

export const isoMinus = (now: Date, ms: number) => new Date(now.getTime() - ms).toISOString();
export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
