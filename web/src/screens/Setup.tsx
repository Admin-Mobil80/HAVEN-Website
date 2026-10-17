import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { emit } from "../lib/bus";
import { forms, type Pronouns, type SetupView } from "../lib/names";

const TOPICS = ["plans", "visit", "money", "health", "family", "promise"] as const;
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

// A one-item-per-line box. It keeps exactly what was typed (blank lines included) while editing,
// so Enter starts a new line; the parent only ever sees the cleaned list.
function LinesField({ value, onChange, rows }: { value: string[]; onChange: (v: string[]) => void; rows: number }) {
  const [raw, setRaw] = useState(value.join("\n"));
  return <textarea rows={rows} value={raw} onChange={(e) => (setRaw(e.target.value), onChange(lines(e.target.value)))} />;
}

// "Teach Haven about <them>": who they are, how the main user talks to them, what the companion
// must always pass back, and the consents. Pre-filled from the household's setup.
export function Setup() {
  const [v, setV] = useState<SetupView>();
  const [saved, setSaved] = useState("");
  useEffect(() => {
    api<SetupView>("/api/setup").then(setV, () => undefined);
  }, []);
  if (!v) return <section className="panel setup"><p className="muted">Loading…</p></section>;

  const E = forms(v.elder.pronouns);
  const them = v.elder.calledBy || v.elder.name;
  const save = async () => {
    setSaved("Saving…");
    try {
      setV(await api<SetupView>("/api/setup", { body: { elder: v.elder, user: v.user, style: v.style, deferTopics: v.deferTopics, avoidTopics: v.avoidTopics, goals: v.goals, consents: v.consents } }));
      setSaved(`Saved. ${v.displayName} uses this from the next sentence.`);
      emit("refresh");
    } catch (e) {
      setSaved(`Couldn't save: ${(e as Error).message}`);
    }
  };
  const set = (patch: Partial<SetupView>) => setV({ ...v, ...patch });
  const elder = (patch: Partial<SetupView["elder"]>) => set({ elder: { ...v.elder, ...patch } });
  const user = (patch: Partial<SetupView["user"]>) => set({ user: { ...v.user, ...patch } });
  const style = (patch: Partial<SetupView["style"]>) => set({ style: { ...v.style, ...patch } });
  const pron = (value: Pronouns, onChange: (p: Pronouns) => void) => (
    <div className="pron" role="radiogroup">
      {(["she", "he", "they"] as Pronouns[]).map((p) => (
        <button type="button" key={p} className={`chip${value === p ? " is-on" : ""}`} aria-pressed={value === p} onClick={() => onChange(p)}>
          {p}/{forms(p).obj}
        </button>
      ))}
    </div>
  );

  return (
    <section className="panel setup" aria-label={`Teach Haven about ${them}`}>
      <header className="panel__head">
        <h2>Teach Haven about {them}</h2>
        <span className="muted">only {v.user.name} can change this</span>
      </header>
      <div className="setup__grid">
        <fieldset>
          <legend>{them}</legend>
          <label>Name<input value={v.elder.name} onChange={(e) => elder({ name: e.target.value })} /></label>
          <label>You call {E.obj}<input value={v.elder.calledBy} onChange={(e) => elder({ calledBy: e.target.value })} /></label>
          <label>{E.Subj === "They" ? "They are" : `${E.Subj} is`} your<input value={v.elder.relationToUser} onChange={(e) => elder({ relationToUser: e.target.value })} /></label>
          {pron(v.elder.pronouns, (p) => elder({ pronouns: p }))}
          <label>City<input value={v.elder.city} onChange={(e) => elder({ city: e.target.value })} /></label>
          <label>Things {them} loves (one per line)<LinesField rows={4} value={v.style.topicsTheyLove} onChange={(v) => style({ topicsTheyLove: v })} /></label>
        </fieldset>

        <fieldset>
          <legend>You</legend>
          <label>Your name<input value={v.user.name} onChange={(e) => user({ name: e.target.value })} /></label>
          <label>You are {E.poss}<input value={v.user.relation} onChange={(e) => user({ relation: e.target.value })} /></label>
          {pron(v.user.pronouns, (p) => user({ pronouns: p }))}
          <label>Words you use with {E.obj} (one per line)<LinesField rows={3} value={v.style.phrases} onChange={(v) => style({ phrases: v })} /></label>
          <label>Tone<input value={v.style.tone} onChange={(e) => style({ tone: e.target.value })} /></label>
          <label>{v.displayName} must never (one per line)<LinesField rows={3} value={v.style.neverSays} onChange={(v) => style({ neverSays: v })} /></label>
        </fieldset>

        <fieldset>
          <legend>Always pass these to the real you</legend>
          <p className="muted">{v.displayName} says "let me check with the real {v.user.name}" instead of answering.</p>
          {TOPICS.map((t) => (
            <label key={t} className="check">
              <input type="checkbox" checked={v.deferTopics.includes(t)} onChange={(e) => set({ deferTopics: e.target.checked ? [...v.deferTopics, t] : v.deferTopics.filter((x) => x !== t) })} />
              {t}
            </label>
          ))}
          <label>Topics to avoid (one per line)<LinesField rows={2} value={v.avoidTopics} onChange={(v) => set({ avoidTopics: v })} /></label>
        </fieldset>

        <fieldset>
          <legend>Calls and consent</legend>
          <label>Calls a week today<input type="number" min={0} max={21} value={v.goals.baselineCallsPerWeek} onChange={(e) => set({ goals: { ...v.goals, baselineCallsPerWeek: Number(e.target.value) } })} /></label>
          <label>Your goal<input type="number" min={1} max={21} value={v.goals.goalCallsPerWeek} onChange={(e) => set({ goals: { ...v.goals, goalCallsPerWeek: Number(e.target.value) } })} /></label>
          <label className="check">
            <input type="checkbox" checked={v.consents.likeness} onChange={(e) => set({ consents: { ...v.consents, likeness: e.target.checked } })} />
            I approve "{v.displayName} · AI", an AI version of me{v.consents.likenessAt ? ` (approved ${new Date(v.consents.likenessAt).toLocaleDateString()})` : ""}. Unticking switches to a neutral "Haven" companion.
          </label>
          <label className="check">
            <input type="checkbox" checked={v.consents.shareSummaries} onChange={(e) => set({ consents: { ...v.consents, shareSummaries: e.target.checked } })} />
            {them} agreed that a short daily summary is shared with family. Things {E.subj} asks to keep private are never shared.
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
