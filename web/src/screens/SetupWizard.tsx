import { useState } from "react";
import { api } from "../lib/api";
import { emit } from "../lib/bus";
import { forms, type Pronouns } from "../lib/names";
import { Icon } from "../components/Icon";

const USER_RELATIONS = ["son", "daughter", "grandson", "granddaughter", "nephew", "niece", "friend", "neighbour", "other"];
const ELDER_RELATIONS = ["mother", "father", "grandmother", "grandfather", "aunt", "uncle", "friend", "neighbour", "other"];

// First thing every demo shows: a ready-made demo (fictional family, stock face and voice) or
// your own (your names, then your photo and voice).
export function SetupWizard({ onDone }: { onDone: (how: "demo" | "own") => void }) {
  const [own, setOwn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const startDemo = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("/api/setup/demo", { body: {} });
      emit("refresh");
      onDone("demo");
    } catch (e) {
      setErr(`Couldn't start the demo: ${(e as Error).message}`);
      setBusy(false);
    }
  };
  if (own) return <OwnSetup onDone={() => onDone("own")} onBack={() => setOwn(false)} />;
  return (
    <section className="wizard" aria-label="Start Haven">
      <div className="hero">
        <span className="pill pill--brand"><Icon name="favorite" fill />Makes families call more, not less</span>
        <h2>Welcome to Haven</h2>
        <p>
          Haven keeps someone you love company when you can't be there. They talk to a clearly labelled AI version of you, and each evening you get a short update with ideas for
          your next call, plus an urgent alert if something is wrong.
        </p>
      </div>
      <div className="choices">
        <article className="choice">
          <div className="choice__media">
            <img src="/demo/digital-daniel.webp" alt="Digital Daniel, the demo companion" />
            <span className="avatar__badge"><Icon name="smart_toy" fill />Digital Daniel · AI</span>
          </div>
          <p className="kicker">Ready-made demo</p>
          <h3>Start demo</h3>
          <p>Meet Digital Daniel, keeping his mother Mary company in Seattle. A fictional family with a stock AI face and voice. Ready in one click.</p>
          <button className="btn btn--primary" onClick={startDemo} disabled={busy}>
            {busy ? "Starting…" : "Start demo"}
            <Icon name="arrow_forward" />
          </button>
        </article>
        <article className="choice choice--own">
          <div className="choice__media">
            <span className="choice__plus"><Icon name="add" /></span>
          </div>
          <p className="kicker">Your own family</p>
          <h3>Create your own</h3>
          <p>Enter your name and who Haven is for, then add your own photo and voice. About two minutes.</p>
          <button className="btn" onClick={() => setOwn(true)} disabled={busy}>
            Create your own
            <Icon name="arrow_forward" />
          </button>
        </article>
      </div>
      {err && <p className="error">{err}</p>}
    </section>
  );
}

function OwnSetup({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [f, setF] = useState({
    userName: "",
    userRelation: "son",
    userPronouns: "he" as Pronouns,
    elderName: "",
    relationToUser: "mother",
    calledBy: "",
    elderPronouns: "she" as Pronouns,
    city: "",
    language: "en-US",
    loves: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const E = forms(f.elderPronouns);
  const them = f.calledBy || f.elderName || "them";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.userName.trim() || !f.elderName.trim()) return setErr("Please fill in both names.");
    setBusy(true);
    try {
      await api("/api/setup/new", {
        body: {
          userName: f.userName.trim(),
          userRelation: f.userRelation,
          userPronouns: f.userPronouns,
          elderName: f.elderName.trim(),
          relationToUser: f.relationToUser,
          calledBy: f.calledBy.trim(),
          elderPronouns: f.elderPronouns,
          city: f.city.trim() || undefined,
          language: f.language,
          thingsTheyLove: f.loves.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 8),
        },
      });
      emit("refresh");
      onDone();
    } catch (e2) {
      setErr(`Couldn't save: ${(e2 as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const pronounPicker = (value: Pronouns, onChange: (p: Pronouns) => void, label: string) => (
    <div className="pron" role="radiogroup" aria-label={label}>
      {(["she", "he", "they"] as Pronouns[]).map((p) => (
        <button type="button" key={p} className={`chip${value === p ? " is-on" : ""}`} aria-pressed={value === p} onClick={() => onChange(p)}>
          {value === p && <Icon name="check" />}
          {p}/{forms(p).obj}
        </button>
      ))}
    </div>
  );

  return (
    <form className="wizard wizard--form" onSubmit={submit} aria-label="Create your own">
      <button type="button" className="btn btn--ghost backlink" onClick={onBack}><Icon name="arrow_back" />Back to start</button>
      <div>
        <h2 className="row" style={{ fontSize: "2rem", fontWeight: 700, gap: 12, flexWrap: "wrap" }}>
          Create your own <span className="pill pill--real"><Icon name="schedule" />takes about 2 minutes</span>
        </h2>
        <p className="muted" style={{ fontSize: "1.05rem", marginTop: 6 }}>Set up a clearly labelled AI companion for someone you love. It keeps them company and reminds you to call more often.</p>
      </div>

      <section className="formcard" aria-label="About you">
        <div className="formcard__head">
          <Icon name="person" />
          <div>
            <h3>About you</h3>
            <p>The family member setting this up</p>
          </div>
        </div>
        <label>Your name<input value={f.userName} onChange={(e) => set({ userName: e.target.value })} placeholder="Your first name" autoFocus required maxLength={40} /></label>
        <label>
          You are {f.elderName ? `${f.elderName}'s` : "their"}
          <select value={f.userRelation} onChange={(e) => set({ userRelation: e.target.value })}>
            {USER_RELATIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <div className="row row--wrap" style={{ gap: 8 }}>
          <span className="kicker">Your pronouns</span>
          {pronounPicker(f.userPronouns, (p) => set({ userPronouns: p }), "Your pronouns")}
        </div>
      </section>

      <section className="formcard formcard--for" aria-label="Who Haven is for">
        <div className="formcard__head">
          <Icon name="favorite" />
          <div>
            <h3>Who Haven is for</h3>
            <p>Your parent, relative or friend who will talk to the companion</p>
          </div>
        </div>
        <label>{E.Subj === "They" ? "Their" : E.poss[0].toUpperCase() + E.poss.slice(1)} name<input value={f.elderName} onChange={(e) => set({ elderName: e.target.value })} placeholder="Their first name" required maxLength={40} /></label>
        <div className="two">
          <label>
            {f.elderName || "They"} {f.elderName ? "is" : "are"} your
            <select value={f.relationToUser} onChange={(e) => set({ relationToUser: e.target.value })}>
              {ELDER_RELATIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label>What do you call {E.obj}?<input value={f.calledBy} onChange={(e) => set({ calledBy: e.target.value })} placeholder="e.g. Mom, Grandma, or a name" maxLength={30} /></label>
        </div>
        <div className="row row--wrap" style={{ gap: 8 }}>
          <span className="kicker">{E.Subj === "They" ? "Their" : E.poss[0].toUpperCase() + E.poss.slice(1)} pronouns</span>
          {pronounPicker(f.elderPronouns, (p) => set({ elderPronouns: p }), "Their pronouns")}
        </div>
        <div className="two">
          <label>City (optional)<input value={f.city} onChange={(e) => set({ city: e.target.value })} maxLength={40} /></label>
          <label>
            {E.Subj} {E.Subj === "They" ? "speak" : "speaks"}
            <select value={f.language} onChange={(e) => set({ language: e.target.value })}>
              <option value="en-US">English (US)</option>
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi</option>
            </select>
          </label>
        </div>
        <label>Things {them} loves to talk about (comma-separated)<textarea rows={3} value={f.loves} onChange={(e) => set({ loves: e.target.value })} placeholder="e.g. the garden, old songs, cooking" /></label>
        <p className="helper"><Icon name="lightbulb" />{f.userName.trim() ? `Digital ${f.userName.trim()}` : "Your companion"} uses these to start warm, familiar conversations.</p>
      </section>

      {err && <p className="error">{err}</p>}
      <button className="btn btn--huge" disabled={busy}>{busy ? "Setting up…" : `Create Digital ${f.userName.trim() || "me"}`}<Icon name="arrow_forward" /></button>
      <p className="muted" style={{ textAlign: "center" }}>Next you can add your photo and voice. You can change anything later in Setup.</p>
    </form>
  );
}
