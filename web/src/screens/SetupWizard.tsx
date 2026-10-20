import { useState } from "react";
import { api } from "../lib/api";
import { emit } from "../lib/bus";
import { forms, type Pronouns } from "../lib/names";

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
    <section className="panel wizard" aria-label="Start Haven">
      <header className="panel__head">
        <h2>Welcome to Haven</h2>
      </header>
      <p>Haven keeps someone you love company when you can't be there, and tells you each evening what to talk about when you call. It speaks as a clearly labelled AI version of you.</p>
      <div className="choices">
        <button className="choice" onClick={startDemo} disabled={busy}>
          <img src="/demo/digital-arjun.webp" alt="" />
          <strong>{busy ? "Starting…" : "Start demo"}</strong>
          <span>Meet Digital Arjun, keeping his mother Kamala ("Amma") company in Chennai. A fictional family with a stock AI face and voice. Ready in one click.</span>
        </button>
        <button className="choice" onClick={() => setOwn(true)} disabled={busy}>
          <span className="choice__icon" aria-hidden>＋</span>
          <strong>Create your own</strong>
          <span>Enter your name and who Haven is for, then add your own photo and voice. About two minutes.</span>
        </button>
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
          {p}/{forms(p).obj}
        </button>
      ))}
    </div>
  );

  return (
    <form className="panel wizard" onSubmit={submit} aria-label="Set up Haven">
      <header className="panel__head">
        <h2>Create your own</h2>
        <span className="muted">takes a minute</span>
      </header>

      <fieldset>
        <legend>You</legend>
        <label>Your name<input value={f.userName} onChange={(e) => set({ userName: e.target.value })} placeholder="Your first name" autoFocus required maxLength={40} /></label>
        <label>
          You are {f.elderName ? `${f.elderName}'s` : "their"}
          <select value={f.userRelation} onChange={(e) => set({ userRelation: e.target.value })}>
            {USER_RELATIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        {pronounPicker(f.userPronouns, (p) => set({ userPronouns: p }), "Your pronouns")}
      </fieldset>

      <fieldset>
        <legend>Who Haven is for</legend>
        <label>{E.Subj === "They" ? "Their" : E.poss[0].toUpperCase() + E.poss.slice(1)} name<input value={f.elderName} onChange={(e) => set({ elderName: e.target.value })} placeholder="Their first name" required maxLength={40} /></label>
        <label>
          {f.elderName || "They"} {f.elderName ? "is" : "are"} your
          <select value={f.relationToUser} onChange={(e) => set({ relationToUser: e.target.value })}>
            {ELDER_RELATIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label>What do you call {E.obj}?<input value={f.calledBy} onChange={(e) => set({ calledBy: e.target.value })} placeholder="e.g. Amma, Appa, Nani, or their name" maxLength={30} /></label>
        {pronounPicker(f.elderPronouns, (p) => set({ elderPronouns: p }), "Their pronouns")}
        <label>City (optional)<input value={f.city} onChange={(e) => set({ city: e.target.value })} maxLength={40} /></label>
        <label>Things {them} loves to talk about (comma-separated)<textarea rows={2} value={f.loves} onChange={(e) => set({ loves: e.target.value })} placeholder="e.g. the garden, old songs, cooking" /></label>
      </fieldset>

      {err && <p className="error">{err}</p>}
      <button className="btn btn--primary btn--huge" disabled={busy}>{busy ? "Setting up…" : `Create Digital ${f.userName.trim() || "me"}`}</button>
      <p className="muted">Next you can add your photo and voice. You can change anything later in Setup.</p>
      <button type="button" className="btn btn--ghost" onClick={onBack}>← Back</button>
    </form>
  );
}
