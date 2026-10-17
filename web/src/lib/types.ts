import type { Mouth } from "../components/Avatar";

export type TurnResponse = {
  text: string;
  mode: "greeting" | "safety" | "honesty" | "consent" | "deferral" | "brain" | "rules" | "relay" | "goodbye";
  speaker: string;
  audio?: { base64: string; contentType: string };
  visemes: { t: number; mouth: Mouth }[];
  words: { time: number; value: string }[];
  mcpTrace: { at: string; client: string; tool?: string; summary: string; isError?: boolean }[];
  familyPending: number;
  incident?: { id: string; tier: string; emergency: boolean; state: string };
  awaitingConfirmation?: { to: string; message: string };
  modelId?: string;
  latencyMs: number;
};

export type ElderState = {
  householdId: string;
  demo: boolean;
  configured: boolean;
  photoAvatar: boolean;
  photoUrl?: string;
  persona: { displayName: string; mode: "child" | "neutral"; isAI: true; badge: string; childName?: string; childPronouns?: string };
  elder: { name: string; calledBy: string; pronouns: string; language: string };
  pendingFamilyMessages: number;
  reminders: { id: string; text: string; due: string; source: string }[];
  openIncident: { id: string; tier: string; emergency: boolean; state: string; openedAt: string } | null;
  familyCalling: { by: string; at: string } | null;
};

export type FamilyState = {
  householdId: string;
  demo: boolean;
  elder: { name: string; calledBy: string; age: number; city: string; phone: string };
  members: { id: string; name: string; relation: string; role: string; waOptIn: boolean }[];
  persona: { displayName: string; mode: string };
  consents: { conversationStorage: boolean; shareSummaries: boolean };
  digests: { id: string; date: string; createdAt: string; summary: string; mood?: string; topics: string[]; starters: string[]; tier: string; audioUrl?: string }[];
  deferrals: { id: string; topic: string; question: string; status: "open" | "answered" | "relayed"; createdAt: string }[];
  messages: { id: string; from: string; kind: string; text?: string; audioUrl?: string; inReplyTo?: string; createdAt: string; playedAt?: string }[];
  outbox: { id: string; at: string; to: string; kind: string; body: string; channel: string; status: string }[];
  incidents: { id: string; tier: string; emergency: boolean; reason: string; state: string; openedAt: string; ackBy?: string; timeline: { at: string; event: string }[] }[];
  avatarLines: { at: string; text: string }[];
  callStats: { realCallsThisWeek: number; promptedByHaven: number; demoSeeded: number; goal: number; baseline: number };
  goals: { baselineCallsPerWeek: number; goalCallsPerWeek: number };
};

export type PlayedMessage = {
  id: string;
  from: string;
  kind: string;
  text?: string;
  audioUrl?: string;
  question?: string;
  attribution: "real_family_member";
};
