import type { Household, LogEntry, SessionRecord } from "../domain/types.js";

// Storage port. memoryRepo backs tests and the no-keys local demo; dynamoRepo backs the hosted demo.
// Every method is scoped to one household except the global dedupe/counter/phone helpers.
export interface Repo {
  get(householdId: string): Promise<Household | undefined>;
  // Insert a new household. Throws if it already exists.
  create(doc: Household, opts?: { ttlSeconds?: number }): Promise<void>;
  // Replace a household (used by reset). No version check.
  put(doc: Household, opts?: { ttlSeconds?: number }): Promise<void>;
  // Read-modify-write with optimistic locking and a few retries. `fn` mutates the draft in place
  // and may return a value. The draft is discarded if `fn` throws.
  update<T>(householdId: string, fn: (doc: Household) => T | Promise<T>): Promise<T>;
  delete(householdId: string): Promise<void>;

  appendLog(householdId: string, entry: LogEntry): Promise<void>;
  listLog(householdId: string, opts?: { since?: string; limit?: number }): Promise<LogEntry[]>;

  putSession(householdId: string, session: SessionRecord): Promise<void>;
  listSessions(householdId: string, date: string): Promise<SessionRecord[]>;

  // Returns true the first time a key is claimed (webhook dedupe), false afterwards.
  claimOnce(key: string, ttlSeconds: number): Promise<boolean>;
  // Atomically add `by` and return the new value (rate limits, daily budget caps).
  incrCounter(key: string, by: number, ttlSeconds: number): Promise<number>;

  mapPhone(phone: string, householdId: string): Promise<void>;
  householdForPhone(phone: string): Promise<string | undefined>;
}

export class NotFoundError extends Error {
  constructor(householdId: string) {
    super(`household_not_found:${householdId}`);
  }
}

export class ConflictError extends Error {
  constructor(householdId: string) {
    super(`version_conflict:${householdId}`);
  }
}
