import type { Household } from "./types.js";
import { newHousehold, type SetupInput } from "../store/seed.js";

// "Start demo": a ready-made, clearly fictional household so a judge can see the whole story in
// one click. The face is an Anam stock avatar and the voice an ElevenLabs library voice, so no
// real person's likeness is used. "Create your own" builds the same thing from the user's answers.
export const DEMO_PRESET: SetupInput = {
  userName: "David",
  userPronouns: "he",
  userRelation: "son",
  elderName: "Margaret",
  relationToUser: "mother",
  calledBy: "Mom",
  elderPronouns: "she",
  city: "Seattle",
  language: "en-US",
  thingsTheyLove: ["her rose garden", "big band music", "baking for the grandkids", "old Hollywood movies"],
  phrases: ["Mom", "love you, Mom"],
};

export const DEMO_AVATAR_ID = process.env.DEMO_AVATAR_ID || "6cc28442-cccd-42a8-b6e4-24b7210a09c5"; // Anam stock "Gabriel"
export const DEMO_AVATAR_STILL = "/demo/digital-david.webp";
export const DEMO_VOICE_ID = process.env.DEMO_VOICE_ID || "iP95p4xoKVk53GoZ742B"; // ElevenLabs premade "Chris" (American; uses no voice slot)

export function demoPresetHousehold(id: string, now: Date): Household {
  const doc = newHousehold(id, now, DEMO_PRESET, { demo: true });
  const at = now.toISOString();
  const owner = doc.persona.childMemberId;
  doc.persona.avatar = { provider: "anam", avatarId: DEMO_AVATAR_ID, stillUrl: DEMO_AVATAR_STILL, consent: { by: owner, at } };
  doc.persona.voice = { provider: "elevenlabs", voiceId: DEMO_VOICE_ID, name: "Chris (stock voice)", source: "library" };
  return doc;
}
