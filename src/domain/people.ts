import type { Household, Member, Pronouns } from "./types.js";

// Names and pronouns for every sentence Haven says or writes. Nothing in the product assumes a
// mother and a daughter: the household's setup decides who is who.

export type Forms = { subj: string; obj: string; poss: string; Subj: string; Poss: string; is: string; has: string };

export function forms(p: Pronouns | undefined): Forms {
  const f =
    p === "he" ? { subj: "he", obj: "him", poss: "his", is: "is", has: "has" }
    : p === "she" ? { subj: "she", obj: "her", poss: "her", is: "is", has: "has" }
    : { subj: "they", obj: "them", poss: "their", is: "are", has: "have" };
  return { ...f, Subj: cap(f.subj), Poss: cap(f.poss) };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The member whose AI version the companion is (the person who set Haven up).
export function owner(doc: Household): Member | undefined {
  return doc.members.find((m) => m.id === doc.persona.childMemberId) ?? doc.members.find((m) => m.role === "primary");
}

export type People = {
  user: string; // "Fazil"
  userP: Forms;
  elder: string; // "Jesy"
  calledBy: string; // "Ummi"
  elderP: Forms;
  relation: string; // "mother"
  companion: string; // "Digital Fazil", or "Haven" in neutral mode
};

export function people(doc: Household): People {
  const o = owner(doc);
  return {
    user: o?.name ?? "your family",
    userP: forms(o?.pronouns),
    elder: doc.elder.name,
    calledBy: doc.elder.calledBy || doc.elder.name,
    elderP: forms(doc.elder.pronouns),
    relation: doc.elder.relationToUser || "loved one",
    companion: doc.persona.mode === "neutral" ? "Haven" : doc.persona.displayName,
  };
}
