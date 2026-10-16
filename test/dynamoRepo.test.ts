import { test } from "node:test";
import assert from "node:assert/strict";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DEMO_MAX_DOC_BYTES, DynamoRepo, MAX_DOC_BYTES } from "../src/store/dynamoRepo.js";
import { ConflictError, NotFoundError } from "../src/store/repo.js";
import { seedHousehold } from "../src/store/seed.js";
import type { Household, LogEntry, SessionRecord } from "../src/domain/types.js";

// Hand-written stand-in for DynamoDBDocumentClient. It implements only the expressions DynamoRepo
// uses and throws on anything else, so a change in the repo's expressions shows up here.
type Item = Record<string, any>;
type Hook = (name: string, input: any, fake: FakeDocClient) => void;

const T0 = Date.parse("2026-10-15T06:00:00.000Z");
const sec = (ms: number) => Math.floor(ms / 1000);

class FakeDocClient {
  items = new Map<string, Item>();
  calls: { name: string; input: any }[] = [];
  beforeSend?: Hook;
  pageSize = Number.POSITIVE_INFINITY;

  key(pk: string, sk: string) {
    return `${pk}\u0000${sk}`;
  }

  raw(pk: string, sk: string) {
    return this.items.get(this.key(pk, sk));
  }

  async send(command: { input: any }) {
    const name = command.constructor.name;
    // JSON round trip mirrors removeUndefinedValues and keeps stored state isolated from callers.
    const input = clone(command.input);
    this.calls.push({ name, input });
    this.beforeSend?.(name, input, this);
    checkExpressionTokens(input);
    switch (name) {
      case "GetCommand": {
        const item = this.raw(input.Key.PK, input.Key.SK);
        return { Item: item ? clone(item) : undefined };
      }
      case "PutCommand": {
        const k = this.key(input.Item.PK, input.Item.SK);
        if (input.ConditionExpression && !evalCondition(input.ConditionExpression, this.items.get(k) ?? {}, input)) {
          throw new ConditionalCheckFailedException({ message: "The conditional request failed", $metadata: {} });
        }
        this.items.set(k, clone(input.Item));
        return {};
      }
      case "UpdateCommand": {
        const m = /^ADD (\S+) (:\w+) SET (\w+) = if_not_exists\((\w+), (:\w+)\)$/.exec(input.UpdateExpression);
        if (!m || m[3] !== m[4]) throw new Error(`fake: unsupported UpdateExpression ${input.UpdateExpression}`);
        const k = this.key(input.Key.PK, input.Key.SK);
        const item = this.items.get(k) ?? { ...input.Key };
        const addAttr = resolveName(m[1], input);
        item[addAttr] = (item[addAttr] ?? 0) + input.ExpressionAttributeValues[m[2]];
        if (item[m[3]] === undefined) item[m[3]] = input.ExpressionAttributeValues[m[5]];
        this.items.set(k, item);
        if (input.ReturnValues !== "ALL_NEW") throw new Error(`fake: unsupported ReturnValues ${input.ReturnValues}`);
        return { Attributes: clone(item) };
      }
      case "DeleteCommand":
        this.items.delete(this.key(input.Key.PK, input.Key.SK));
        return {};
      case "QueryCommand":
        return this.query(input);
      default:
        throw new Error(`fake: unsupported command ${name}`);
    }
  }

  private query(input: any) {
    const v = input.ExpressionAttributeValues;
    let match: (sk: string) => boolean;
    if (input.KeyConditionExpression === "PK = :pk AND begins_with(SK, :prefix)") {
      match = (sk) => sk.startsWith(v[":prefix"]);
    } else if (input.KeyConditionExpression === "PK = :pk AND SK BETWEEN :lo AND :hi") {
      match = (sk) => sk >= v[":lo"] && sk <= v[":hi"];
    } else {
      throw new Error(`fake: unsupported KeyConditionExpression ${input.KeyConditionExpression}`);
    }
    let rows = [...this.items.values()]
      .filter((i) => i.PK === v[":pk"] && match(i.SK))
      .sort((a, b) => (a.SK < b.SK ? -1 : a.SK > b.SK ? 1 : 0));
    if (input.ScanIndexForward === false) rows.reverse();
    if (input.ExclusiveStartKey) {
      const at = rows.findIndex((i) => i.PK === input.ExclusiveStartKey.PK && i.SK === input.ExclusiveStartKey.SK);
      rows = rows.slice(at + 1);
    }
    const take = Math.min(input.Limit ?? Number.POSITIVE_INFINITY, this.pageSize);
    const page = rows.slice(0, take);
    const last = page.at(-1);
    return {
      Items: clone(page),
      LastEvaluatedKey: rows.length > page.length && last ? { PK: last.PK, SK: last.SK } : undefined,
    };
  }
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function resolveName(token: string, input: any) {
  return token.startsWith("#") ? input.ExpressionAttributeNames[token] : token;
}

// Real DynamoDB rejects requests whose names/values are unused or missing.
function checkExpressionTokens(input: any) {
  const exprs = [input.ConditionExpression, input.KeyConditionExpression, input.UpdateExpression, input.FilterExpression]
    .filter(Boolean)
    .join(" ");
  for (const k of Object.keys(input.ExpressionAttributeNames ?? {})) if (!exprs.includes(k)) throw new Error(`fake: unused name ${k}`);
  for (const k of Object.keys(input.ExpressionAttributeValues ?? {})) if (!exprs.includes(k)) throw new Error(`fake: unused value ${k}`);
  for (const k of exprs.match(/:\w+/g) ?? []) if (!(k in (input.ExpressionAttributeValues ?? {}))) throw new Error(`fake: missing value ${k}`);
}

function evalCondition(expr: string, item: Item, input: any): boolean {
  return expr.split(" OR ").some((term) => {
    const notExists = /^attribute_not_exists\((\S+)\)$/.exec(term.trim());
    if (notExists) return item[resolveName(notExists[1], input)] === undefined;
    const cmp = /^(\S+) (=|<=|<|>=|>) (\S+)$/.exec(term.trim());
    if (!cmp) throw new Error(`fake: unsupported condition ${term}`);
    const operand = (t: string) => (t.startsWith(":") ? input.ExpressionAttributeValues[t] : item[resolveName(t, input)]);
    const a = operand(cmp[1]);
    const b = operand(cmp[3]);
    if (a === undefined || b === undefined) return false;
    switch (cmp[2]) {
      case "=":
        return a === b;
      case "<":
        return a < b;
      case "<=":
        return a <= b;
      case ">":
        return a > b;
      default:
        return a >= b;
    }
  });
}

function setup(opts: { demoTtlSeconds?: number } = {}) {
  const fake = new FakeDocClient();
  const clock = { ms: T0 };
  const repo = new DynamoRepo({
    tableName: "Haven",
    client: fake as unknown as DynamoDBDocumentClient,
    demoTtlSeconds: opts.demoTtlSeconds,
    now: () => new Date(clock.ms),
  });
  return { fake, clock, repo };
}

// Simulates another Lambda committing a write between our read and our conditional put.
function concurrentWriter(times: number): Hook {
  let left = times;
  return (name, input, fake) => {
    if (name !== "PutCommand" || input.ConditionExpression !== "#ver = :v" || left <= 0) return;
    left -= 1;
    const stored = fake.raw(input.Item.PK, input.Item.SK)!;
    stored.version += 1;
    stored.doc.version = stored.version;
    stored.doc.elder.city = `Mysuru-${stored.version}`;
  };
}

const log = (at: string, summary: string): LogEntry => ({ at, client: "rule", kind: "rule", summary });

const session = (date: string, startedAt: string): SessionRecord => ({
  id: `s_${startedAt}`,
  date,
  startedAt,
  endedAt: startedAt,
  turns: [],
  deferralIds: [],
  toolsCalled: [],
  ruleEvents: [],
});

test("create rejects an existing household and get returns the stored doc", async () => {
  const { repo } = setup();
  const doc = seedHousehold("hh1", new Date(T0));
  await repo.create(doc);
  await assert.rejects(repo.create(doc), /household_exists:hh1/);
  const got = await repo.get("hh1");
  assert.equal(got?.elder.name, "Kamala");
  assert.equal(got?.version, 1);
  assert.equal(await repo.get("missing"), undefined);
});

test("demo households get a TTL, owner households do not", async () => {
  const { repo, fake } = setup();
  await repo.create(seedHousehold("demo", new Date(T0), { demo: true }));
  await repo.create(seedHousehold("owner", new Date(T0), { demo: false }));
  assert.equal(fake.raw("HH#demo", "DOC")?.expiresAt, sec(T0) + 7 * 24 * 3600);
  assert.equal("expiresAt" in fake.raw("HH#owner", "DOC")!, false);

  const custom = setup({ demoTtlSeconds: 3600 });
  await custom.repo.put(seedHousehold("demo", new Date(T0), { demo: true }));
  assert.equal(custom.fake.raw("HH#demo", "DOC")?.expiresAt, sec(T0) + 3600);
  await custom.repo.put(seedHousehold("owner", new Date(T0), { demo: false }), { ttlSeconds: 60 });
  assert.equal(custom.fake.raw("HH#owner", "DOC")?.expiresAt, sec(T0) + 60);
});

test("an expired demo household reads as missing and can be created again", async () => {
  const { repo, clock } = setup({ demoTtlSeconds: 60 });
  await repo.create(seedHousehold("demo", new Date(T0)));
  clock.ms += 61_000;
  assert.equal(await repo.get("demo"), undefined);
  await assert.rejects(repo.update("demo", () => undefined), NotFoundError);
  await repo.create(seedHousehold("demo", new Date(clock.ms)));
  assert.equal((await repo.get("demo"))?.version, 1);
});

test("update increments the version, keeps the TTL and returns fn's value", async () => {
  const { repo, fake, clock } = setup();
  await repo.create(seedHousehold("hh1", new Date(T0)));
  const expiresAt = fake.raw("HH#hh1", "DOC")?.expiresAt;
  clock.ms += 3600_000;
  const out = await repo.update("hh1", (doc) => {
    doc.elder.city = "Chennai";
    return "ok";
  });
  assert.equal(out, "ok");
  const stored = fake.raw("HH#hh1", "DOC")!;
  assert.equal(stored.version, 2);
  assert.equal(stored.doc.version, 2);
  assert.equal(stored.expiresAt, expiresAt);
  assert.equal((await repo.get("hh1"))?.elder.city, "Chennai");
  await repo.update("hh1", () => undefined);
  assert.equal((await repo.get("hh1"))?.version, 3);
});

test("update on a missing household throws NotFoundError; a throwing fn writes nothing", async () => {
  const { repo, fake } = setup();
  await assert.rejects(repo.update("nope", () => undefined), NotFoundError);
  await repo.create(seedHousehold("hh1", new Date(T0)));
  await assert.rejects(
    repo.update("hh1", (doc) => {
      doc.elder.city = "Delhi";
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal(fake.raw("HH#hh1", "DOC")?.doc.elder.city, "Bengaluru");
  assert.equal(fake.raw("HH#hh1", "DOC")?.version, 1);
});

test("update retries after a concurrent write and re-runs fn on fresh state", async () => {
  const { repo, fake } = setup();
  await repo.create(seedHousehold("hh1", new Date(T0)));
  fake.beforeSend = concurrentWriter(1);
  const seen: string[] = [];
  await repo.update("hh1", (doc) => {
    seen.push(doc.elder.city);
    doc.elder.age += 1;
  });
  assert.deepEqual(seen, ["Bengaluru", "Mysuru-2"]);
  const stored = fake.raw("HH#hh1", "DOC")!;
  assert.equal(stored.version, 3);
  assert.equal(stored.doc.elder.city, "Mysuru-2"); // the other writer's change survives
  assert.equal(stored.doc.elder.age, 75);
});

test("update gives up with ConflictError after 3 retries", async () => {
  const { repo, fake } = setup();
  await repo.create(seedHousehold("hh1", new Date(T0)));
  fake.beforeSend = concurrentWriter(Number.POSITIVE_INFINITY);
  let runs = 0;
  await assert.rejects(
    repo.update("hh1", () => {
      runs += 1;
    }),
    ConflictError,
  );
  assert.equal(runs, 4);
});

test("delete removes the household document", async () => {
  const { repo } = setup();
  await repo.create(seedHousehold("hh1", new Date(T0)));
  await repo.delete("hh1");
  assert.equal(await repo.get("hh1"), undefined);
});

test("claimOnce is true once, false while the claim lives, true again after it expires", async () => {
  const { repo, clock } = setup();
  assert.equal(await repo.claimOnce("wamid.ABC", 60), true);
  assert.equal(await repo.claimOnce("wamid.ABC", 60), false);
  assert.equal(await repo.claimOnce("wamid.XYZ", 60), true);
  clock.ms += 61_000;
  assert.equal(await repo.claimOnce("wamid.ABC", 60), true);
});

test("incrCounter accumulates per key and restarts a stale window TTL has not deleted", async () => {
  const { repo, fake, clock } = setup();
  assert.equal(await repo.incrCounter("RATE#ip1", 1, 60), 1);
  assert.equal(await repo.incrCounter("RATE#ip1", 1, 60), 2);
  assert.equal(await repo.incrCounter("RATE#ip1", 3, 60), 5);
  assert.equal(await repo.incrCounter("RATE#ip2", 1, 60), 1);
  assert.equal(fake.raw("CTR#RATE#ip1", "CTR")?.expiresAt, sec(T0) + 60);

  clock.ms += 120_000;
  assert.equal(await repo.incrCounter("RATE#ip1", 2, 60), 2);
  assert.equal(fake.raw("CTR#RATE#ip1", "CTR")?.expiresAt, sec(clock.ms) + 60);
  assert.equal(await repo.incrCounter("RATE#ip1", 1, 60), 3);
});

test("listLog returns the newest entries in chronological order, honouring since and limit", async () => {
  const { repo, fake } = setup();
  const ats = ["2026-10-15T06:00:03.000Z", "2026-10-15T06:00:01.000Z", "2026-10-15T06:00:05.000Z", "2026-10-15T06:00:02.000Z", "2026-10-15T06:00:04.000Z"];
  for (const at of ats) await repo.appendLog("hh1", log(at, `e${at.slice(18, 19)}`));
  await repo.appendLog("hh2", log("2026-10-15T06:00:09.000Z", "other household"));
  await repo.putSession("hh1", session("2026-10-15", "2026-10-15T06:00:06.000Z"));

  assert.deepEqual((await repo.listLog("hh1")).map((e) => e.summary), ["e1", "e2", "e3", "e4", "e5"]);
  assert.deepEqual((await repo.listLog("hh1", { limit: 2 })).map((e) => e.summary), ["e4", "e5"]);
  assert.deepEqual((await repo.listLog("hh1", { since: "2026-10-15T06:00:03.000Z" })).map((e) => e.summary), ["e4", "e5"]);
  assert.deepEqual((await repo.listLog("hh1", { since: "2026-10-15T06:00:00.000Z", limit: 3 })).map((e) => e.summary), ["e3", "e4", "e5"]);

  const q = fake.calls.filter((c) => c.name === "QueryCommand").at(-1)!.input;
  assert.equal(q.ScanIndexForward, false);
  assert.equal(q.Limit, 3);
  const e1 = [...fake.items.values()].find((i) => i.entry?.summary === "e1");
  assert.match(e1?.SK, /^LOG#2026-10-15T06:00:01\.000Z#[0-9a-f]{4}$/);
  assert.equal(e1?.expiresAt, sec(T0) + 2 * 24 * 3600);
});

test("listLog follows pagination and skips entries past their TTL", async () => {
  const { repo, fake, clock } = setup();
  await repo.appendLog("hh1", log("2026-10-13T06:00:00.000Z", "old"));
  clock.ms += 2 * 24 * 3600_000 + 1000;
  await repo.appendLog("hh1", log("2026-10-17T06:00:01.000Z", "a"));
  await repo.appendLog("hh1", log("2026-10-17T06:00:02.000Z", "b"));
  await repo.appendLog("hh1", log("2026-10-17T06:00:03.000Z", "c"));
  fake.pageSize = 1;
  assert.deepEqual((await repo.listLog("hh1")).map((e) => e.summary), ["a", "b", "c"]);
  assert.deepEqual((await repo.listLog("hh1", { limit: 2 })).map((e) => e.summary), ["b", "c"]);
});

test("listSessions returns only the requested day, in start order", async () => {
  const { repo, fake } = setup();
  await repo.putSession("hh1", session("2026-10-15", "2026-10-15T09:00:00.000Z"));
  await repo.putSession("hh1", session("2026-10-14", "2026-10-14T09:00:00.000Z"));
  await repo.putSession("hh1", session("2026-10-15", "2026-10-15T04:00:00.000Z"));
  await repo.putSession("hh2", session("2026-10-15", "2026-10-15T05:00:00.000Z"));
  await repo.appendLog("hh1", log("2026-10-15T06:00:00.000Z", "not a session"));

  fake.pageSize = 1;
  const day = await repo.listSessions("hh1", "2026-10-15");
  assert.deepEqual(day.map((s) => s.startedAt), ["2026-10-15T04:00:00.000Z", "2026-10-15T09:00:00.000Z"]);
  assert.equal((await repo.listSessions("hh1", "2026-10-14")).length, 1);
  assert.equal((await repo.listSessions("hh1", "2026-10-16")).length, 0);
  const item = [...fake.items.values()].find((i) => i.SK === "SESSION#2026-10-15#2026-10-15T04:00:00.000Z");
  assert.equal(item?.expiresAt, sec(T0) + 7 * 24 * 3600);
});

test("mapPhone and householdForPhone round-trip", async () => {
  const { repo } = setup();
  await repo.mapPhone("910000000002", "hh1");
  assert.equal(await repo.householdForPhone("910000000002"), "hh1");
  assert.equal(await repo.householdForPhone("910000000009"), undefined);
});

test("an oversized document is trimmed oldest-first before it is written", async () => {
  const { repo, fake } = setup();
  const doc = seedHousehold("big", new Date(T0));
  const filler = "x".repeat(4000);
  for (let i = 0; i < 150; i++) {
    doc.outbox.push({ id: `o_${i}`, at: new Date(T0 + i).toISOString(), to: "priya", kind: "digest", body: filler, channel: "simulated", status: "simulated" });
  }
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (msg: string) => void warnings.push(msg);
  try {
    await repo.create(doc);
  } finally {
    console.warn = warn;
  }
  const stored = fake.raw("HH#big", "DOC")!.doc;
  assert.ok(Buffer.byteLength(JSON.stringify(stored)) <= MAX_DOC_BYTES);
  assert.ok(stored.outbox.length > 0 && stored.outbox.length < 100);
  assert.equal(stored.outbox.at(-1).id, "o_149"); // newest kept
  assert.equal(stored.memories.length, seedHousehold("big", new Date(T0)).memories.length); // live state untouched
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /household_doc_trimmed/);
});

// What an anonymous client can push through the tools on the public demo (see SEC-1): every list
// filled to its CAPS bound with maximum-length entries.
function inflate(doc: Household) {
  for (let i = 0; i < 200; i++) {
    doc.memories.push({ id: `m_x${i}`, type: "story", content: `${i} ${"m".repeat(195)}`, private: false, source: "conversation", createdAt: new Date(T0 + i).toISOString() });
    doc.wellbeing.push({ id: `w_x${i}`, at: new Date(T0 + i).toISOString(), mood: "okay", mentions: ["a".repeat(40), "b".repeat(40), "c".repeat(40), "d".repeat(40)], note: "n".repeat(200), private: false, tier: "worth_knowing" });
  }
  for (let i = 0; i < 100; i++) {
    doc.deferrals.push({ id: `d_x${i}`, topic: "other", question: "q".repeat(200), context: "c".repeat(300), status: "open", createdAt: new Date(T0 + i).toISOString() });
  }
}

test("a demo document is kept under the demo bound, trimming even live state oldest-first", async () => {
  const { repo, fake } = setup();
  const doc = seedHousehold("demo-big", new Date(T0), { demo: true });
  inflate(doc);
  assert.ok(Buffer.byteLength(JSON.stringify(doc)) > 200 * 1024, "inflated past 200 KB");
  const warn = console.warn;
  console.warn = () => {};
  try {
    await repo.create(doc);
    const stored = fake.raw("HH#demo-big", "DOC")!.doc as Household;
    assert.ok(Buffer.byteLength(JSON.stringify(stored)) <= DEMO_MAX_DOC_BYTES);
    assert.equal(stored.memories.at(-1)?.id, "m_x199", "newest memory kept");
    assert.equal(stored.deferrals.at(-1)?.id, "d_x99", "newest deferral kept");

    // Every later write stays bounded too.
    await repo.update("demo-big", (d) => inflate(d));
    const updated = fake.raw("HH#demo-big", "DOC")!.doc as Household;
    assert.ok(Buffer.byteLength(JSON.stringify(updated)) <= DEMO_MAX_DOC_BYTES);
  } finally {
    console.warn = warn;
  }
});

test("an owner document keeps its live state and only the 350 KB bound applies", async () => {
  const { repo, fake } = setup();
  const doc = seedHousehold("owner-big", new Date(T0), { demo: false });
  inflate(doc);
  await repo.create(doc);
  const stored = fake.raw("HH#owner-big", "DOC")!.doc as Household;
  assert.equal(stored.memories.length, doc.memories.length > 200 ? 200 : doc.memories.length);
  assert.equal(stored.deferrals.length, 100);
  assert.ok(Buffer.byteLength(JSON.stringify(stored)) <= MAX_DOC_BYTES);
});

test("incrCounter adds to a window another caller restarted first", async () => {
  const { repo, fake, clock } = setup();
  assert.equal(await repo.incrCounter("BUDGET#day", 1, 60), 1);
  clock.ms += 120_000;
  let raced = false;
  fake.beforeSend = (name, input, f) => {
    if (name !== "PutCommand" || input.ConditionExpression !== "expiresAt = :old" || raced) return;
    raced = true;
    const stored = f.raw("CTR#BUDGET#day", "CTR")!;
    stored.value = 4;
    stored.expiresAt = sec(clock.ms) + 60;
  };
  assert.equal(await repo.incrCounter("BUDGET#day", 1, 60), 5);
  assert.equal(raced, true);
});
