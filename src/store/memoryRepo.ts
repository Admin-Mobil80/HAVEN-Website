import type { Household, LogEntry, SessionRecord } from "../domain/types.js";
import { NotFoundError, type Repo } from "./repo.js";

// In-process repo for tests and the no-keys local demo. Same semantics as dynamoRepo:
// documents are deep-copied in and out, so callers can never mutate stored state by accident.
export class MemoryRepo implements Repo {
  private docs = new Map<string, Household>();
  private logs = new Map<string, LogEntry[]>();
  private sessions = new Map<string, SessionRecord[]>();
  private claims = new Map<string, number>();
  private counters = new Map<string, { value: number; expiresAt: number }>();
  private phones = new Map<string, string>();

  async get(householdId: string) {
    const doc = this.docs.get(householdId);
    return doc ? structuredClone(doc) : undefined;
  }

  async create(doc: Household) {
    if (this.docs.has(doc.id)) throw new Error(`household_exists:${doc.id}`);
    this.docs.set(doc.id, structuredClone(doc));
  }

  async put(doc: Household) {
    this.docs.set(doc.id, structuredClone(doc));
  }

  async update<T>(householdId: string, fn: (doc: Household) => T | Promise<T>): Promise<T> {
    const current = this.docs.get(householdId);
    if (!current) throw new NotFoundError(householdId);
    const draft = structuredClone(current);
    const result = await fn(draft);
    draft.version = current.version + 1;
    this.docs.set(householdId, draft);
    return result;
  }

  async delete(householdId: string) {
    this.docs.delete(householdId);
    this.logs.delete(householdId);
    this.sessions.delete(householdId);
  }

  async appendLog(householdId: string, entry: LogEntry) {
    const list = this.logs.get(householdId) ?? [];
    list.push(structuredClone(entry));
    if (list.length > 500) list.splice(0, list.length - 500);
    this.logs.set(householdId, list);
  }

  async listLog(householdId: string, opts: { since?: string; limit?: number } = {}) {
    const list = (this.logs.get(householdId) ?? []).filter((e) => !opts.since || e.at > opts.since);
    return structuredClone(list.slice(-(opts.limit ?? 100)));
  }

  async putSession(householdId: string, session: SessionRecord) {
    const list = this.sessions.get(householdId) ?? [];
    list.push(structuredClone(session));
    this.sessions.set(householdId, list);
  }

  async listSessions(householdId: string, date: string) {
    return structuredClone((this.sessions.get(householdId) ?? []).filter((s) => s.date === date));
  }

  async claimOnce(key: string, ttlSeconds: number) {
    const now = Date.now();
    const until = this.claims.get(key);
    if (until !== undefined && until > now) return false;
    this.claims.set(key, now + ttlSeconds * 1000);
    return true;
  }

  async incrCounter(key: string, by: number, ttlSeconds: number) {
    const now = Date.now();
    const c = this.counters.get(key);
    const value = (c && c.expiresAt > now ? c.value : 0) + by;
    this.counters.set(key, { value, expiresAt: c && c.expiresAt > now ? c.expiresAt : now + ttlSeconds * 1000 });
    return value;
  }

  async mapPhone(phone: string, householdId: string) {
    this.phones.set(phone, householdId);
  }

  async householdForPhone(phone: string) {
    return this.phones.get(phone);
  }
}
