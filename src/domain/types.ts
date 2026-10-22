// Domain model for one Haven household. Everything for a household lives in one versioned
// document (DynamoDB item HH#<id>/DOC), plus a few side items (sessions, log, dedupe, counters).
// All demo data is SYNTHETIC.

export type ISODate = string;

export type ConsentRecord = { by: string; at: ISODate; witnessedBy?: string; revokedAt?: ISODate };

export const PRONOUNS = ["she", "he", "they"] as const;
export type Pronouns = (typeof PRONOUNS)[number];

// The person Haven keeps company: anyone who is lonely, not only a mother.
export type Elder = {
  name: string;
  calledBy: string; // what the main user calls them ("Ummi", "Appa", "Nani"); the only source for it
  relationToUser: string; // "mother", "father", "grandmother", "friend", ...
  pronouns: Pronouns;
  age?: number;
  city: string;
  phone: string; // shown in urgent alerts so family can tap to call
  language: "en-US" | "en-IN" | "hi-IN";
  // A voice note of this person, kept for Voice ID: recognising them, and not strangers, before
  // Haven shares anything. Stored now, not yet used to gate replies (see docs/DECISIONS.md).
  voiceSample?: { key: string; contentType: string; at: ISODate; consent: ConsentRecord };
};

export type Member = {
  id: string; // stable id, e.g. "priya"
  name: string;
  relation: string; // their relation to the elder: "son", "daughter", "grandson", "neighbour"
  role: "primary" | "backup";
  pronouns?: Pronouns;
  phone?: string; // E.164 without "+", e.g. "9198xxxxxxxx"
  waOptIn?: ConsentRecord; // WhatsApp opt-in, required before any real send
  lastInboundAt?: ISODate; // last inbound WhatsApp message (opens the 24 h window)
};

export const DEFER_TOPICS = ["plans", "visit", "money", "health", "family", "promise", "other"] as const;
export type DeferTopic = (typeof DEFER_TOPICS)[number];

export type StyleCard = {
  phrases: string[]; // words the main user really uses with them: "achha", "inshallah"
  tone: string; // "warm, teasing, short sentences"
  topicsTheyLove: string[];
  neverSays: string[]; // "never promises dates"
};

export type Persona = {
  mode: "child" | "neutral"; // neutral = plain "Haven" companion (consent revoked or dementia safeguard)
  childMemberId: string; // the member whose AI version this is (the main user who set Haven up)
  displayName: string; // "Digital <their name>"
  style: StyleCard;
  deferTopics: DeferTopic[];
  avoidTopics: string[]; // things the avatar must never store or raise
  likenessConsent?: ConsentRecord; // the child approved this avatar
  voice?: VoiceChoice; // absent: the default Polly voice
  avatar?: AvatarChoice; // absent: the illustrated avatar
};

// The companion's voice: cloned from the main user's own recording (with consent) or picked from
// the ElevenLabs library.
export type VoiceChoice = {
  provider: "elevenlabs";
  voiceId: string;
  name: string;
  source: "cloned" | "library";
  consent?: ConsentRecord; // required for a cloned voice
};

// The photo-real face: an Anam avatar made from the main user's own photo (with consent).
export type AvatarChoice = {
  provider: "anam";
  avatarId: string;
  photoKey?: string; // our copy of the photo, shown while the tablet is asleep
  stillUrl?: string; // a stock avatar's still (the "Start demo" preset), served with the web app
  consent: ConsentRecord;
};

export type Consents = {
  conversationStorage?: ConsentRecord; // elder agrees conversations are summarised
  shareSummaries?: ConsentRecord; // elder agrees summaries go to family (required for digests)
  healthNotes?: ConsentRecord;
};

export const MEMORY_TYPES = ["person", "event", "preference", "story", "routine", "other"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export type Memory = {
  id: string;
  type: MemoryType;
  content: string;
  private: boolean; // "Don't tell Priya": usable in conversation, never in reports
  source: "setup" | "conversation" | "digest";
  createdAt: ISODate;
  lastMentionedAt?: ISODate;
};

export type FamilyMessage = {
  id: string;
  from: string; // member id
  kind: "voice" | "text" | "deferral_answer" | "call_promise";
  text?: string; // text body or transcript
  audioKey?: string; // S3/media key of the real recording
  inReplyTo?: string; // deferral id
  createdAt: ISODate;
  playedAt?: ISODate;
};

export type Deferral = {
  id: string;
  topic: DeferTopic;
  question: string;
  context: string;
  status: "open" | "answered" | "relayed";
  createdAt: ISODate;
  answeredAt?: ISODate;
  answerMessageId?: string;
  relayedAt?: ISODate;
};

export const MOODS = ["happy", "okay", "low", "anxious"] as const;
export type Mood = (typeof MOODS)[number];
export type Tier = "urgent" | "important" | "worth_knowing";

export type Wellbeing = {
  id: string;
  at: ISODate;
  mood: Mood;
  energy?: "low" | "normal" | "high";
  sleep?: "poor" | "ok" | "good";
  appetite?: "poor" | "ok" | "good";
  mentions: string[];
  note?: string;
  private: boolean;
  tier: Exclude<Tier, "urgent">; // the server computes this and never returns urgent
};

export type Reminder = {
  id: string;
  text: string;
  due: ISODate;
  source: "family" | "call_promise";
  confirmedBy: string; // member id
};

export type IncidentState = "open" | "acknowledged" | "cancelled" | "closed";
export type IncidentEvent = { at: ISODate; event: string; detail?: string };

export type Incident = {
  id: string;
  tier: "urgent" | "important";
  emergency: boolean;
  source: "rule" | "agent" | "alexa";
  reason: string;
  elderWords: string;
  state: IncidentState;
  openedAt: ISODate;
  lastAlertAt?: ISODate; // last alert attempt; rolled back when every send in it failed
  alertDeliveredAt?: ISODate; // last alert that reached at least one family member
  timeline: IncidentEvent[];
  ackBy?: string;
  closedBy?: string;
  closedAt?: ISODate;
};

export type Confirmation = {
  id: string;
  tool: "record_reply";
  argsHash: string;
  issuedAt: ISODate;
  usedAt?: ISODate;
  supersededAt?: ISODate; // a newer preview replaced it, so one "yes" can approve only one send
};

export type ContactEvent = {
  id: string;
  type: "call" | "visit" | "message";
  by: string; // member id
  at: ISODate;
  promptedByHaven: boolean;
  demoSeed?: boolean; // seeded history, labelled as demo data in the UI
};

export type Turn = {
  id: string;
  at: ISODate;
  speaker: "elder" | "avatar" | "system";
  text: string;
  private?: boolean;
};

export type OutboxKind = "digest" | "voice_note" | "urgent_alert" | "important_alert" | "elder_reply" | "family_question";

export type OutboxEntry = {
  id: string;
  at: ISODate;
  to: string; // member id
  kind: OutboxKind;
  body: string;
  channel: "whatsapp" | "simulated";
  status: "sent" | "failed" | "simulated";
  wamid?: string;
  refId?: string; // incident / deferral / digest id
  error?: string;
};

export type DigestRecord = {
  id: string;
  date: string; // YYYY-MM-DD (IST)
  createdAt: ISODate;
  summary: string; // short, non-clinical, privacy-filtered
  mood?: Mood;
  topics: string[];
  starters: string[]; // conversation starters from Amma's own stories
  openDeferrals: string[]; // deferral ids
  tier: Tier;
  audioKey?: string; // mp3 for the dashboard
  voiceNoteKey?: string; // ogg_opus for WhatsApp
};

export type Household = {
  id: string;
  version: number; // optimistic locking
  createdAt: ISODate;
  demo: boolean; // judge/demo household (expires)
  elder: Elder;
  members: Member[];
  persona: Persona;
  consents: Consents;
  goals: { baselineCallsPerWeek: number; goalCallsPerWeek: number };
  memories: Memory[];
  messages: FamilyMessage[];
  deferrals: Deferral[];
  wellbeing: Wellbeing[];
  reminders: Reminder[];
  incidents: Incident[];
  confirmations: Confirmation[];
  contacts: ContactEvent[];
  digests: DigestRecord[];
  outbox: OutboxEntry[];
  turns: Turn[]; // last N turns only (capped)
  seq: number; // id counter
  session?: ActiveSession; // the tablet conversation in progress, if any
  configured: boolean; // false until the main user has finished setup
};

// The conversation currently open on the tablet. Written to a SessionRecord when it ends.
export type ActiveSession = {
  id: string;
  startedAt: ISODate;
  lastTurnAt: ISODate;
  disclosedAt: ISODate; // last spoken "I'm an AI" disclosure (session start, then every 3 h)
  deferralIds: string[];
  toolsCalled: string[];
  ruleEvents: string[];
  // A record_reply preview waiting for her yes. The confirmation binds these exact arguments.
  pendingReply?: { confirmationId: string; message: string; kind: "reply" | "call_request" };
};

// Activity log item (external MCP clients, rule events, webhooks). Simulator calls come back inline.
export type LogEntry = {
  at: ISODate;
  client: string; // "alexa-sim" | "agent" | "inspector" | "rule" | "webhook" | ...
  kind: "mcp" | "rule" | "webhook" | "job";
  method?: string; // JSON-RPC method
  tool?: string;
  summary: string; // short, already redacted of private text
  isError?: boolean;
};

// One chat session, written at session end; the digest reads a day's sessions.
export type SessionRecord = {
  id: string;
  date: string; // YYYY-MM-DD (IST)
  startedAt: ISODate;
  endedAt: ISODate;
  turns: Turn[]; // private turns removed
  deferralIds: string[];
  toolsCalled: string[];
  ruleEvents: string[];
};

// Caps keep the household document well under DynamoDB's 400 KB item limit.
export const CAPS = {
  memories: 200,
  messages: 100,
  deferrals: 100,
  wellbeing: 200,
  reminders: 50,
  incidents: 50,
  confirmations: 20,
  contacts: 200,
  digests: 30,
  outbox: 100,
  turns: 20,
} as const;

// Why an incident was opened. Shared by the rule engine (safety.ts) and the start_escalation tool.
export const ESCALATION_REASONS = [
  "help_phrase",
  "fall",
  "breathing",
  "chest_pain",
  "unconscious",
  "dizzy",
  "confused",
  "scared",
  "wants_family",
  "not_eating",
  "missed_medicine",
  "very_lonely",
  "other",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];
