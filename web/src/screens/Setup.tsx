import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { emit } from "../lib/bus";

type SetupView = {
  elder: { name: string; calledBy: string; city: string; age: number };
  childName: string;
  displayName: string;
  style: { callsElder: string; phrases: string[]; tone: string; topicsSheLoves: string[]; neverSays: string[] };
  deferTopics: string[];
  avoidTopics: string[];
  goals: { baselineCallsPerWeek: number; goalCallsPerWeek: number };
  consents: { shareSummaries: boolean; likeness: boolean; likenessAt?: string };
};

const TOPICS = ["plans", "visit", "money", "health", "family", "promise"] as const;
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

// "Teach Haven about Amma": Priya sets who her mother is, how she herself talks, what Digital
// Priya must always pass back to her, and the consents. Pre-filled from the household.
export function Setup() {
  const [v, setV] = useState<SetupView>();
  const [saved, setSaved] = useState("");
  useEffect(() => {
    api<SetupView>("/api/setup").then(setV, () => undefined);
  }, []);
  if (!v) return <section className="panel setup"><p className="muted">Loading…</p></section>;

  const save = async () => {
    setSaved("Saving…");
    try {
      setV(await api<SetupView>("/api/setup", { body: { elder: v.elder, style: v.style, deferTopics: v.deferTopics, avoidTopics: v.avoidTopics, goals: v.goals, consents: v.consents } }));
      setSaved("Saved. Digital Priya uses this from her next sentence.");
      emit("refresh");
    } catch (e) {
      setSaved(`Couldn't save: ${(e as Error).message}`);
    }
  };
  const set = (patch: Partial<SetupView>) => setV({ ...v, ...patch });
  const style = (patch: Partial<SetupView["style"]>) => set({ style: { ...v.style, ...patch } });

  return (
    <section className="panel setup" aria-label="Teach Haven about Amma">
      <header className="panel__head">
        <h2>Teach Haven about {v.elder.calledBy}</h2>
        <span className="muted">only {v.childName} can change this</span>
      </header>
      <div className="setup__grid">
        <fieldset>
          <legend>{v.elder.calledBy}'s world</legend>
          <label>Her name<input value={v.elder.name} onChange={(e) => set({ elder: { ...v.elder, name: e.target.value } })} /></label>
          <label>You call her<input value={v.elder.calledBy} onChange={(e) => set({ elder: { ...v.elder, calledBy: e.target.value } })} /></label>
          <label>City<input value={v.elder.city} onChange={(e) => set({ elder: { ...v.elder, city: e.target.value } })} /></label>
          <label>Things she loves (one per line)<textarea rows={4} value={v.style.topicsSheLoves.join("\n")} onChange={(e) => style({ topicsSheLoves: lines(e.target.value) })} /></label>
        </fieldset>

        <fieldset>
          <legend>How you talk to her</legend>
          <label>Your words and phrases (one per line)<textarea rows={3} value={v.style.phrases.join("\n")} onChange={(e) => style({ phrases: lines(e.target.value) })} /></label>
          <label>Tone<input value={v.style.tone} onChange={(e) => style({ tone: e.target.value })} /></label>
          <label>{v.displayName} must never (one per line)<textarea rows={3} value={v.style.neverSays.join("\n")} onChange={(e) => style({ neverSays: lines(e.target.value) })} /></label>
        </fieldset>

        <fieldset>
          <legend>Always pass these to the real you</legend>
          <p className="muted">{v.displayName} says "let me check with the real {v.childName}" instead of answering.</p>
          {TOPICS.map((t) => (
            <label key={t} className="check">
              <input type="checkbox" checked={v.deferTopics.includes(t)} onChange={(e) => set({ deferTopics: e.target.checked ? [...v.deferTopics, t] : v.deferTopics.filter((x) => x !== t) })} />
              {t}
            </label>
          ))}
          <label>Topics to avoid (one per line)<textarea rows={2} value={v.avoidTopics.join("\n")} onChange={(e) => set({ avoidTopics: lines(e.target.value) })} /></label>
        </fieldset>

        <fieldset>
          <legend>Calls and consent</legend>
          <label>Calls a week today<input type="number" min={0} max={21} value={v.goals.baselineCallsPerWeek} onChange={(e) => set({ goals: { ...v.goals, baselineCallsPerWeek: Number(e.target.value) } })} /></label>
          <label>Your goal<input type="number" min={1} max={21} value={v.goals.goalCallsPerWeek} onChange={(e) => set({ goals: { ...v.goals, goalCallsPerWeek: Number(e.target.value) } })} /></label>
          <label className="check">
            <input type="checkbox" checked={v.consents.likeness} onChange={(e) => set({ consents: { ...v.consents, likeness: e.target.checked } })} />
            I approve "{v.displayName} · AI", an illustrated AI version of me{v.consents.likenessAt ? ` (approved ${new Date(v.consents.likenessAt).toLocaleDateString()})` : ""}. Unticking switches to a neutral "Haven" companion.
          </label>
          <label className="check">
            <input type="checkbox" checked={v.consents.shareSummaries} onChange={(e) => set({ consents: { ...v.consents, shareSummaries: e.target.checked } })} />
            {v.elder.calledBy} agreed that a short daily summary is shared with family. Things she asks to keep private are never shared.
          </label>
        </fieldset>
      </div>
      <div className="row">
        <button className="btn btn--primary" onClick={save}>Save</button>
        {saved && <span className="note" role="status">{saved}</span>}
      </div>
    </section>
  );
}
