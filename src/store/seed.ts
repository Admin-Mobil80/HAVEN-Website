import type { Household } from "../domain/types.js";
import { DAY, HOUR, isoMinus } from "../domain/util.js";

// SYNTHETIC demo household: Kamala (74, Bengaluru), her daughter Priya (Mumbai), backup Ravi.
// Phone numbers are fictional placeholders; real numbers come only from /setup or .env for the
// owner household, never from the repo.
export function seedHousehold(id: string, now: Date, opts: { demo: boolean } = { demo: true }): Household {
  const at = (msAgo: number) => isoMinus(now, msAgo);
  return {
    id,
    version: 1,
    createdAt: now.toISOString(),
    demo: opts.demo,
    elder: { name: "Kamala", calledBy: "Amma", age: 74, city: "Bengaluru", phone: "910000000001", language: "en-IN" },
    members: [
      { id: "priya", name: "Priya", relation: "daughter (Mumbai)", role: "primary", phone: "910000000002" },
      { id: "ravi", name: "Ravi", relation: "nephew (Bengaluru), backup contact", role: "backup", phone: "910000000003" },
    ],
    persona: {
      mode: "child",
      childMemberId: "priya",
      displayName: "Digital Priya",
      style: {
        callsElder: "Amma",
        phrases: ["achha", "arre Amma", "you know na"],
        tone: "warm, a little teasing, short sentences",
        topicsSheLoves: ["her garden (jasmine, curry leaves)", "old Kannada film songs", "temple visits", "cooking for festivals"],
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
