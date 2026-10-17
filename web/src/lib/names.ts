import { useEffect, useState } from "react";
import { api } from "./api";
import { on } from "./bus";

// Who is who in this household, from its setup. Every label and suggestion on screen comes from
// here, so the same app works for a son and his father, a granddaughter and her grandmother, or
// two friends.

export type Pronouns = "she" | "he" | "they";
export type SetupView = {
  configured: boolean;
  voice: { name: string; source: string } | null;
  photoAvatar: boolean;
  elder: { name: string; calledBy: string; city: string; relationToUser: string; pronouns: Pronouns };
  user: { name: string; relation: string; pronouns: Pronouns };
  childName: string;
  displayName: string;
  style: { phrases: string[]; tone: string; topicsTheyLove: string[]; neverSays: string[] };
  deferTopics: string[];
  avoidTopics: string[];
  goals: { baselineCallsPerWeek: number; goalCallsPerWeek: number };
  consents: { shareSummaries: boolean; likeness: boolean; likenessAt?: string };
};

export function forms(p: Pronouns | undefined) {
  const f = p === "he" ? { subj: "he", obj: "him", poss: "his" } : p === "she" ? { subj: "she", obj: "her", poss: "her" } : { subj: "they", obj: "them", poss: "their" };
  return { ...f, Subj: f.subj[0].toUpperCase() + f.subj.slice(1) };
}

export type Names = {
  ready: boolean;
  configured: boolean;
  user: string; // "Fazil"
  userP: ReturnType<typeof forms>;
  elder: string; // "Jesy"
  calledBy: string; // "Ummi"
  elderP: ReturnType<typeof forms>;
  companion: string; // "Digital Fazil"
  setup?: SetupView;
};

const EMPTY: Names = { ready: false, configured: false, user: "you", userP: forms("they"), elder: "your loved one", calledBy: "your loved one", elderP: forms("they"), companion: "Digital companion" };

export function toNames(v: SetupView): Names {
  return {
    ready: true,
    configured: v.configured,
    user: v.user.name || "you",
    userP: forms(v.user.pronouns),
    elder: v.elder.name,
    calledBy: v.elder.calledBy || v.elder.name,
    elderP: forms(v.elder.pronouns),
    companion: v.displayName,
    setup: v,
  };
}

export function useNames(): Names {
  const [names, setNames] = useState<Names>(EMPTY);
  useEffect(() => {
    const load = () => api<SetupView>("/api/setup").then((v) => setNames(toNames(v)), () => undefined);
    load();
    const off = on("refresh", () => void load());
    return () => off();
  }, []);
  return names;
}
