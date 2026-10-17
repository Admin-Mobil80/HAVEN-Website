import type { Household } from "./types.js";

// Brings a household stored by an older version up to the current shape, on every read, so old
// demo households and the owner household keep working after a release. Idempotent.
export function upgradeDoc(doc: Household): Household {
  const style = doc.persona.style as Household["persona"]["style"] & { topicsSheLoves?: string[]; callsElder?: string };
  style.topicsTheyLove ??= style.topicsSheLoves ?? [];
  style.phrases ??= [];
  style.neverSays ??= [];
  style.tone ??= "warm, patient, short sentences";
  delete style.topicsSheLoves;
  if (style.callsElder && !doc.elder.calledBy) doc.elder.calledBy = style.callsElder;
  delete style.callsElder;
  doc.persona.deferTopics ??= [];
  doc.persona.avoidTopics ??= [];
  doc.elder.pronouns ??= "she";
  doc.elder.relationToUser ??= "mother";
  doc.configured ??= true; // households created before setup existed were fully seeded
  return doc;
}
