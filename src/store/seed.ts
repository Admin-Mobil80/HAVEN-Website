import type { Household, Pronouns } from "../domain/types.js";
import { DAY, HOUR, isoMinus } from "../domain/util.js";

// What the main user tells Haven in setup. Everything the companion says is built from this.
export type SetupInput = {
  userName: string; // "Fazil"
  userPronouns: Pronouns;
  userRelation: string; // the user's relation to them: "son", "daughter", "grandson", "friend"
  elderName: string; // "Jesy"
  relationToUser: string; // "mother", "father", "grandmother", "friend"
  calledBy: string; // "Ummi"
  elderPronouns: Pronouns;
  city?: string;
  language?: "en-IN" | "hi-IN";
  thingsTheyLove?: string[];
  phrases?: string[];
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "me";

// A new household from setup: no invented memories, no invented call history.
export function newHousehold(id: string, now: Date, input: SetupInput, opts: { demo: boolean }): Household {
  const at = now.toISOString();
  const ownerId = slug(input.userName);
  const loves = (input.thingsTheyLove ?? []).filter(Boolean).slice(0, 8);
  return {
    id,
    version: 1,
    createdAt: at,
    demo: opts.demo,
    configured: true,
    elder: {
      name: input.elderName,
      calledBy: input.calledBy || input.elderName,
      relationToUser: input.relationToUser,
      pronouns: input.elderPronouns,
      city: input.city ?? "",
      phone: "",
      language: input.language ?? "en-IN",
    },
    members: [{ id: ownerId, name: input.userName, relation: input.userRelation, role: "primary", pronouns: input.userPronouns }],
    persona: {
      mode: "child",
      childMemberId: ownerId,
      displayName: `Digital ${input.userName}`,
      style: {
        phrases: (input.phrases ?? []).filter(Boolean).slice(0, 8),
        tone: "warm, patient, short sentences",
        topicsTheyLove: loves,
        neverSays: ["never promises dates or visits", "never talks about money", "never gives medical advice"],
      },
      deferTopics: ["plans", "visit", "money", "health", "family", "promise"],
      avoidTopics: [],
      likenessConsent: { by: ownerId, at },
    },
    consents: { conversationStorage: { by: "elder", at, witnessedBy: ownerId }, shareSummaries: { by: "elder", at, witnessedBy: ownerId } },
    goals: { baselineCallsPerWeek: 1, goalCallsPerWeek: 4 },
    memories: loves.map((content, i) => ({ id: `m_${i + 1}`, type: "preference" as const, content: `Loves ${content}`, private: false, source: "setup" as const, createdAt: at })),
    messages: [],
    deferrals: [],
    wellbeing: [],
    reminders: [],
    incidents: [],
    confirmations: [],
    contacts: [],
    digests: [],
    outbox: [],
    turns: [],
    seq: 100,
  };
}

// A household that has not been set up yet (a fresh demo session). The screens ask for setup first.
export function blankHousehold(id: string, now: Date, opts: { demo: boolean }): Household {
  const doc = newHousehold(id, now, { userName: "You", userPronouns: "they", userRelation: "family", elderName: "your loved one", relationToUser: "loved one", calledBy: "", elderPronouns: "they" }, opts);
  doc.configured = false;
  return doc;
}

// TEST FIXTURE ONLY (never shown in the product): a fully populated example household.
// Phone numbers are fictional placeholders.
export function seedHousehold(id: string, now: Date, opts: { demo: boolean } = { demo: true }): Household {
  const at = (msAgo: number) => isoMinus(now, msAgo);
  return {
    id,
    version: 1,
    createdAt: now.toISOString(),
    demo: opts.demo,
    configured: true,
    elder: { name: "Kamala", calledBy: "Amma", relationToUser: "mother", pronouns: "she", age: 74, city: "Bengaluru", phone: "910000000001", language: "en-IN" },
    members: [
      { id: "priya", name: "Priya", relation: "daughter", role: "primary", pronouns: "she", phone: "910000000002" },
      { id: "ravi", name: "Ravi", relation: "nephew (Bengaluru), backup contact", role: "backup", phone: "910000000003" },
    ],
    persona: {
      mode: "child",
      childMemberId: "priya",
      displayName: "Digital Priya",
      style: {
        phrases: ["achha", "arre Amma", "you know na"],
        tone: "warm, a little teasing, short sentences",
        topicsTheyLove: ["her garden (jasmine, curry leaves)", "old Kannada film songs", "temple visits", "cooking for festivals"],
        neverSays: ["never promises dates or visits", "never talks about money", "never gives medical advice"],
      },
      deferTopics: ["plans", "visit", "money", "health", "family", "promise"],
      avoidTopics: ["property dispute with uncle"],
      likenessConsent: { by: "priya", at: at(2 * DAY) },
    },
    consents: {
      conversationStorage: { by: "kamala", at: at(2 * DAY), witnessedBy: "priya" },
      shareSummaries: { by: "kamala", at: at(2 * DAY), witnessedBy: "priya" },
    },
    goals: { baselineCallsPerWeek: 1, goalCallsPerWeek: 4 },
    memories: [
      { id: "m_1", type: "routine", content: "Has knee physiotherapy on Tuesdays and Fridays", private: false, source: "setup", createdAt: at(2 * DAY) },
      { id: "m_2", type: "event", content: "Went for knee physio yesterday; said the new exercises are hard", private: false, source: "conversation", createdAt: at(DAY), lastMentionedAt: at(DAY) },
      { id: "m_3", type: "person", content: "Lalitha is her school friend from Mysuru; they talk on Sundays", private: false, source: "setup", createdAt: at(2 * DAY) },
      { id: "m_4", type: "preference", content: "Loves the song 'Ninnindale' and listens to it while cooking", private: false, source: "setup", createdAt: at(2 * DAY) },
      { id: "m_5", type: "story", content: "Used to make 40 kinds of sweets for Diwali when Priya was a child", private: false, source: "setup", createdAt: at(2 * DAY) },
    ],
    messages: [],
    deferrals: [],
    wellbeing: [
      { id: "w_1", at: at(DAY), mood: "okay", energy: "normal", mentions: ["physio", "garden"], private: false, tier: "worth_knowing" },
    ],
    reminders: [],
    incidents: [],
    confirmations: [],
    contacts: [
      // Seeded history so the "real calls this week" tile has context. Labelled as demo data in the UI.
      { id: "c_1", type: "call", by: "priya", at: at(5 * DAY), promptedByHaven: true, demoSeed: true },
      { id: "c_2", type: "call", by: "priya", at: at(3 * DAY), promptedByHaven: true, demoSeed: true },
      { id: "c_3", type: "call", by: "priya", at: at(DAY + 3 * HOUR), promptedByHaven: true, demoSeed: true },
    ],
    digests: [],
    outbox: [],
    turns: [],
    seq: 100,
  };
}
