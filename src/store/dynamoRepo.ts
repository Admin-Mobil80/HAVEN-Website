import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type PutCommandInput,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { CAPS, type Household, type LogEntry, type SessionRecord } from "../domain/types.js";
import { ConflictError, NotFoundError, type Repo } from "./repo.js";

// Single-table layout (table "Haven", keys PK/SK, TTL attribute expiresAt in epoch seconds):
//   HH#<id>      / DOC                      versioned household document
//   HH#<id>      / LOG#<iso>#<rand4>        activity log, 2 days
//   HH#<id>      / SESSION#<date>#<start>   chat session, 7 days
//   CLAIM#<key>  / CLAIM                    webhook dedupe
//   CTR#<key>    / CTR                      rate limit and budget counters
//   WAUSER#<ph>  / MAP                      phone -> household
// TTL deletion is lazy (often hours late), so every read treats expiresAt <= now as gone.

const DEFAULT_DEMO_TTL_SECONDS = 7 * 24 * 3600;
const LOG_TTL_SECONDS = 2 * 24 * 3600;
const SESSION_TTL_SECONDS = 7 * 24 * 3600;
const MAX_RETRIES = 3;
// DynamoDB rejects items over 400 KB. JSON length is a close proxy for its item size; keep headroom.
export const MAX_DOC_BYTES = 350 * 1024;
// Demo households (judges, and the tokenless public demo anyone can write to) are kept far
// smaller: every update reads and rewrites the whole item, so its size is the per-call cost.
// A seeded demo is about 3 KB; a long judge session stays well under this.
export const DEMO_MAX_DOC_BYTES = 64 * 1024;

// History-like arrays, cheapest to lose first; turns last because the brain reads them. Live state
// (memories, deferrals, reminders, incidents) is only ever cut back to its CAPS bound, except in a
// demo household, where it is trimmed oldest-first too (LIVE_TRIM_ORDER) once history is gone.
const TRIM_ORDER = ["outbox", "digests", "contacts", "wellbeing", "messages", "confirmations", "turns"] as const;
const LIVE_TRIM_ORDER = ["deferrals", "memories", "reminders", "incidents"] as const;

type Item = Record<string, unknown>;
type DocItem = { PK: string; SK: string; doc: Household; version: number; expiresAt?: number };

export type DynamoRepoOptions = {
  tableName: string;
  client?: DynamoDBDocumentClient;
  demoTtlSeconds?: number;
  now?: () => Date; // injectable clock for tests
};

const hhPk = (id: string) => `HH#${id}`;
const docKey = (id: string) => ({ PK: hhPk(id), SK: "DOC" });

export class DynamoRepo implements Repo {
  private readonly table: string;
  private readonly client: DynamoDBDocumentClient;
  private readonly demoTtlSeconds: number;
  private readonly now: () => Date;

  constructor(opts: DynamoRepoOptions) {
    this.table = opts.tableName;
    // An injected client keeps its own marshall options; it must also strip undefined values.
    this.client =
      opts.client ??
      DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? "ap-south-1" }), {
        marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: false },
      });
    this.demoTtlSeconds = opts.demoTtlSeconds ?? DEFAULT_DEMO_TTL_SECONDS;
    this.now = opts.now ?? (() => new Date());
  }

  async get(householdId: string) {
    return (await this.readDoc(householdId))?.doc;
  }

  async create(doc: Household, opts: { ttlSeconds?: number } = {}) {
    try {
      await this.writeDoc(doc.id, doc, { expiresAt: this.expiryFor(doc, opts.ttlSeconds), mustBeNew: true });
    } catch (err) {
      if (isConditionalFailure(err)) throw new Error(`household_exists:${doc.id}`);
      throw err;
    }
  }

  async put(doc: Household, opts: { ttlSeconds?: number } = {}) {
    await this.writeDoc(doc.id, doc, { expiresAt: this.expiryFor(doc, opts.ttlSeconds) });
  }

  // Optimistic read-modify-write. On a version conflict `fn` runs again against fresh state, so it
  // must only mutate the draft: no sends and no other writes (do those after update returns).
  // The expiry set at create/put is kept, so a demo household still ends 7 days after it began.
  async update<T>(householdId: string, fn: (doc: Household) => T | Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const current = await this.readDoc(householdId);
      if (!current) throw new NotFoundError(householdId);
      const draft = structuredClone(current.doc);
      const result = await fn(draft);
      draft.version = current.version + 1;
      try {
        await this.writeDoc(householdId, draft, { expiresAt: current.expiresAt, expectedVersion: current.version });
        return result;
      } catch (err) {
        if (!isConditionalFailure(err)) throw err;
        if (attempt >= MAX_RETRIES) throw new ConflictError(householdId);
        await sleep(15 * 2 ** attempt + Math.random() * 25);
      }
    }
  }

  // Side items (log, sessions) are left to expire via TTL.
  async delete(householdId: string) {
    await this.client.send(new DeleteCommand({ TableName: this.table, Key: docKey(householdId) }));
  }

  async appendLog(householdId: string, entry: LogEntry) {
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          PK: hhPk(householdId),
          SK: `LOG#${entry.at}#${randomBytes(2).toString("hex")}`,
          entry,
          expiresAt: this.nowSec() + LOG_TTL_SECONDS,
        },
      }),
    );
  }

  async listLog(householdId: string, opts: { since?: string; limit?: number } = {}) {
    const limit = Math.max(1, Math.floor(opts.limit ?? 100));
    // Only one sort-key condition is allowed per query. BETWEEN bounds both ends so SESSION# items
    // never match, and the "#~" suffix makes `since` exclusive (the rand4 suffix is hex, below "~").
    const keyCondition: Partial<QueryCommandInput> = opts.since
      ? {
          KeyConditionExpression: "PK = :pk AND SK BETWEEN :lo AND :hi",
          ExpressionAttributeValues: { ":pk": hhPk(householdId), ":lo": `LOG#${opts.since}#~`, ":hi": "LOG$" },
        }
      : {
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
          ExpressionAttributeValues: { ":pk": hhPk(householdId), ":prefix": "LOG#" },
        };
    const items = await this.query({ ...keyCondition, ScanIndexForward: false }, limit);
    return items
      .filter((i) => this.isLive(i))
      .map((i) => i.entry as LogEntry)
      .reverse();
  }

  async putSession(householdId: string, session: SessionRecord) {
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          PK: hhPk(householdId),
          SK: `SESSION#${session.date}#${session.startedAt}`,
          session,
          expiresAt: this.nowSec() + SESSION_TTL_SECONDS,
        },
      }),
    );
  }

  async listSessions(householdId: string, date: string) {
    const items = await this.query({
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": hhPk(householdId), ":prefix": `SESSION#${date}#` },
    });
    return items.filter((i) => this.isLive(i)).map((i) => i.session as SessionRecord);
  }

  async claimOnce(key: string, ttlSeconds: number) {
    const now = this.nowSec();
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: { PK: `CLAIM#${key}`, SK: "CLAIM", expiresAt: now + ttl(ttlSeconds) },
          ConditionExpression: "attribute_not_exists(PK) OR expiresAt <= :now",
          ExpressionAttributeValues: { ":now": now },
        }),
      );
      return true;
    } catch (err) {
      if (isConditionalFailure(err)) return false;
      throw err;
    }
  }

  async incrCounter(key: string, by: number, ttlSeconds: number) {
    const Key = { PK: `CTR#${key}`, SK: "CTR" };
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const now = this.nowSec();
      const out = await this.client.send(
        new UpdateCommand({
          TableName: this.table,
          Key,
          UpdateExpression: "ADD #v :by SET expiresAt = if_not_exists(expiresAt, :exp)",
          ExpressionAttributeNames: { "#v": "value" },
          ExpressionAttributeValues: { ":by": by, ":exp": now + ttl(ttlSeconds) },
          ReturnValues: "ALL_NEW",
        }),
      );
      const attrs = out.Attributes ?? {};
      const expiresAt = Number(attrs.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt > now) return Number(attrs.value);
      // The window is over but TTL has not deleted the item yet: start a new window, unless a
      // concurrent caller already did, in which case the next pass adds to theirs.
      try {
        await this.client.send(
          new PutCommand({
            TableName: this.table,
            Item: { ...Key, value: by, expiresAt: now + ttl(ttlSeconds) },
            ConditionExpression: "expiresAt = :old",
            ExpressionAttributeValues: { ":old": expiresAt },
          }),
        );
        return by;
      } catch (err) {
        if (!isConditionalFailure(err)) throw err;
      }
    }
    throw new Error(`counter_conflict:${key}`);
  }

  async mapPhone(phone: string, householdId: string) {
    await this.client.send(new PutCommand({ TableName: this.table, Item: { PK: `WAUSER#${phone}`, SK: "MAP", householdId } }));
  }

  async householdForPhone(phone: string) {
    const out = await this.client.send(
      new GetCommand({ TableName: this.table, Key: { PK: `WAUSER#${phone}`, SK: "MAP" }, ConsistentRead: true }),
    );
    const id = out.Item?.householdId;
    return typeof id === "string" ? id : undefined;
  }

  private nowSec() {
    return Math.floor(this.now().getTime() / 1000);
  }

  private isLive(item: Item) {
    return typeof item.expiresAt !== "number" || item.expiresAt > this.nowSec();
  }

  private expiryFor(doc: Household, ttlSeconds?: number) {
    if (ttlSeconds !== undefined) return this.nowSec() + ttl(ttlSeconds);
    return doc.demo ? this.nowSec() + this.demoTtlSeconds : undefined;
  }

  private async readDoc(householdId: string): Promise<DocItem | undefined> {
    const out = await this.client.send(new GetCommand({ TableName: this.table, Key: docKey(householdId), ConsistentRead: true }));
    const item = out.Item as DocItem | undefined;
    if (!item || !this.isLive(item)) return undefined;
    item.doc.version = item.version;
    return item;
  }

  private async writeDoc(
    householdId: string,
    doc: Household,
    opts: { expiresAt?: number; expectedVersion?: number; mustBeNew?: boolean },
  ) {
    fitDocSize(doc, doc.demo ? DEMO_MAX_DOC_BYTES : MAX_DOC_BYTES, { trimLiveState: doc.demo });
    const input: PutCommandInput = {
      TableName: this.table,
      Item: { ...docKey(householdId), doc, version: doc.version, expiresAt: opts.expiresAt },
    };
    if (opts.mustBeNew) {
      // An expired demo household that TTL has not removed yet does not block re-creation.
      input.ConditionExpression = "attribute_not_exists(PK) OR expiresAt <= :now";
      input.ExpressionAttributeValues = { ":now": this.nowSec() };
    } else if (opts.expectedVersion !== undefined) {
      input.ConditionExpression = "#ver = :v";
      input.ExpressionAttributeNames = { "#ver": "version" };
      input.ExpressionAttributeValues = { ":v": opts.expectedVersion };
    }
    await this.client.send(new PutCommand(input));
  }

  // Follows LastEvaluatedKey (each page is capped at 1 MB) until `max` items or the end.
  private async query(input: Partial<QueryCommandInput>, max = Number.POSITIVE_INFINITY) {
    const items: Item[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const remaining = max - items.length;
      const out = await this.client.send(
        new QueryCommand({
          ...input,
          TableName: this.table,
          ExclusiveStartKey: start,
          Limit: Number.isFinite(remaining) ? remaining : undefined,
        }),
      );
      items.push(...((out.Items ?? []) as Item[]));
      start = out.LastEvaluatedKey;
    } while (start && items.length < max);
    return items;
  }
}

// Brings an oversized document back under `maxBytes` by dropping the oldest entries (index 0 is
// oldest, as capPush appends). Mutates `doc`; returns true when anything was trimmed.
export function fitDocSize(doc: Household, maxBytes = MAX_DOC_BYTES, opts: { trimLiveState?: boolean } = {}) {
  // CAPS always hold on write, even for small docs; the byte bound below only adds extra trimming.
  for (const field of Object.keys(CAPS) as (keyof typeof CAPS)[]) {
    const list: unknown[] = doc[field];
    if (list.length > CAPS[field]) list.splice(0, list.length - CAPS[field]);
  }
  const before = byteSize(doc);
  if (before <= maxBytes) return false;
  let size = before;
  const halve = (fields: readonly (keyof typeof CAPS)[]) => {
    while (size > maxBytes) {
      let trimmed = false;
      for (const field of fields) {
        const list: unknown[] = doc[field];
        if (list.length <= 1) continue;
        list.splice(0, Math.ceil(list.length / 2));
        trimmed = true;
        size = byteSize(doc);
        if (size <= maxBytes) break;
      }
      if (!trimmed) break;
    }
  };
  halve(TRIM_ORDER);
  if (opts.trimLiveState) halve(LIVE_TRIM_ORDER);
  console.warn(
    JSON.stringify({ level: "warn", msg: "household_doc_trimmed", householdId: doc.id, bytesBefore: before, bytesAfter: size, maxBytes }),
  );
  return true;
}

function byteSize(doc: Household) {
  return Buffer.byteLength(JSON.stringify(doc), "utf8");
}

function ttl(seconds: number) {
  return Math.max(1, Math.ceil(seconds));
}

function isConditionalFailure(err: unknown) {
  return err instanceof Error && err.name === "ConditionalCheckFailedException";
}
