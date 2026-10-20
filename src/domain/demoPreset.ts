import type { Household } from "./types.js";
import { newHousehold, type SetupInput } from "../store/seed.js";

// "Start demo": a ready-made, clearly fictional household so a judge can see the whole story in
// one click. The face is an Anam stock avatar and the voice an ElevenLabs library voice, so no
// real person's likeness is used. "Create your own" builds the same thing from the user's answers.
export const DEMO_PRESET: SetupInput = {
  userName: "Arjun",
  userPronouns: "he",
  userRelation: "son",
  elderName: "Kamala",
  relationToUser: "mother",
  calledBy: "Amma",
  elderPronouns: "she",
  city: "Chennai",
  thingsTheyLove: ["Carnatic music", "her jasmine plants", "cooking for the family", "old Tamil films"],
  phrases: ["Amma", "take care, Amma"],
};

export const DEMO_AVATAR_ID = process.env.DEMO_AVATAR_ID || "6cc28442-cccd-42a8-b6e4-24b7210a09c5"; // Anam stock "Gabriel"
export const DEMO_AVATAR_STILL = "/demo/digital-arjun.webp";
export const DEMO_VOICE_ID = process.env.DEMO_VOICE_ID || "9PvnT6XRzlljoaDG6Knu"; // ElevenLabs library "Ranbir - Warm and Friendly"

export function demoPresetHousehold(id: string, now: Date): Household {
  const doc = newHousehold(id, now, DEMO_PRESET, { demo: true });
  const at = now.toISOString();
  const owner = doc.persona.childMemberId;
  doc.persona.avatar = { provider: "anam", avatarId: DEMO_AVATAR_ID, stillUrl: DEMO_AVATAR_STILL, consent: { by: owner, at } };
  doc.persona.voice = { provider: "elevenlabs", voiceId: DEMO_VOICE_ID, name: "Ranbir (stock voice)", source: "library" };
  return doc;
}
