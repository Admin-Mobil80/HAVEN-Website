import { digestBody, gatherFacts, voiceScript, writeDigest, type DigestContent, type DigestFacts } from "../agent/digest.js";
import { CAPS, type DigestRecord, type OutboxEntry } from "../domain/types.js";
import { capPush, istDate, nextId } from "../domain/util.js";
import type { Notifier } from "../notify/index.js";
import type { Repo } from "../store/repo.js";
import { mediaKey } from "../store/s3Media.js";

// Builds and sends one household's evening digest. Every step is awaited (Lambda freezes once
// the response goes out). Media and speech are optional so the job still works without AWS.

export type DigestDeps = {
  repo: Repo;
  notifier: Notifier;
  now: () => Date;
  write?: (facts: DigestFacts) => Promise<DigestContent>;
  voiceNote?: (text: string) => Promise<Buffer>; // ogg_opus for WhatsApp
  mp3?: (text: string) => Promise<Buffer>; // for the dashboard player
  media?: { put(key: string, data: Buffer, contentType: string): Promise<void> };
};

export type DigestResult =
  | { status: "skipped"; reason: "household_not_found" | "no_summary_consent" | "no_primary_member" }
  | { status: "done"; digest: DigestRecord; delivery?: OutboxEntry };

export async function runDigest(householdId: string, deps: DigestDeps): Promise<DigestResult> {
  const now = deps.now();
  const doc = await deps.repo.get(householdId);
  if (!doc) return { status: "skipped", reason: "household_not_found" };
  // Amma agreed to summaries being shared; without that nothing leaves the house.
  if (!doc.consents.shareSummaries || doc.consents.shareSummaries.revokedAt) return { status: "skipped", reason: "no_summary_consent" };
  const primary = doc.members.find((m) => m.role === "primary");
  if (!primary) return { status: "skipped", reason: "no_primary_member" };

  const sessions = await deps.repo.listSessions(householdId, istDate(now));
  const facts = gatherFacts(doc, sessions, now);
  const content = await (deps.write ?? writeDigest)(facts);
  const stamp = now.toISOString().replace(/[^0-9]/g, "").slice(0, 14);

  let voiceNoteKey: string | undefined;
  let audioKey: string | undefined;
  if (deps.media) {
    const script = voiceScript(facts, content);
    const [ogg, mp3] = await Promise.all([
      deps.voiceNote?.(script).catch(warn("voice_note")),
      deps.mp3?.(script).catch(warn("mp3")),
    ]);
    if (ogg) await deps.media.put((voiceNoteKey = mediaKey(householdId, doc.demo, `digest/${stamp}.ogg`)), ogg, "audio/ogg");
    if (mp3) await deps.media.put((audioKey = mediaKey(householdId, doc.demo, `digest/${stamp}.mp3`)), mp3, "audio/mpeg");
  }

  const digest = await deps.repo.update(householdId, (d) => {
    const record: DigestRecord = {
      id: nextId(d, "dg"),
      date: facts.date,
      createdAt: now.toISOString(),
      summary: content.summary,
      mood: content.mood,
      topics: content.topics,
      starters: content.starters,
      openDeferrals: facts.openDeferralIds,
      tier: facts.tier,
      audioKey,
      voiceNoteKey,
    };
    capPush(d.digests, record, CAPS.digests);
    return record;
  });

  const delivery = await deps.notifier.send(
    {
      householdId,
      member: primary,
      kind: "digest",
      body: digestBody(facts, content),
      template: { name: "haven_daily_digest", params: [primary.name, facts.calledBy, content.summary.slice(0, 250)] },
      refId: digest.id,
    },
    now,
  );
  await deps.repo.update(householdId, (d) => capPush(d.outbox, delivery, CAPS.outbox));
  return { status: "done", digest, delivery };
}

const warn = (what: string) => (err: Error) => {
  console.warn(JSON.stringify({ msg: "digest_audio_failed", what, error: err.message?.slice(0, 200) }));
  return undefined;
};
