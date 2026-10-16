import { useState } from "react";
import { McpLog } from "../components/McpLog";
import { api, newDemoSession } from "../lib/api";
import { unlockAudio } from "../lib/audio";
import { emit } from "../lib/bus";
import { resetConnection } from "../lib/mcp";
import { AlexaSim } from "./AlexaSim";
import { Family } from "./Family";
import { Setup } from "./Setup";
import { Tablet } from "./Tablet";

// One page for judges: the simulator, Amma's tablet and Priya's phone side by side, a step bar
// that walks the story, and a private demo household per browser tab (no sign-up, no tokens).
const STEPS: { label: string; run: () => void | Promise<unknown> }[] = [
  { label: "1 · Alexa, talk to Priya", run: () => emit("alexa:say", "Alexa, talk to Priya") },
  { label: "2 · A memory", run: () => emit("tablet:say", "I met Saroja at the temple today, we used to sing together") },
  { label: "3 · Will you come for Diwali?", run: () => emit("tablet:say", "Will you come for Diwali?") },
  { label: "4 · Tell Priya…", run: () => emit("tablet:say", "Tell Priya the jasmine has bloomed") },
  { label: "5 · Haan", run: () => emit("tablet:say", "Haan, send it") },
  { label: "6 · Evening update", run: () => api("/api/digest/run", { body: {} }).then(() => emit("refresh")) },
  { label: "7 · Help, I feel dizzy", run: () => emit("tablet:say", "Help, I feel dizzy") },
];

export function Judge() {
  const [tab, setTab] = useState<"demo" | "setup">("demo");
  const [resetting, setResetting] = useState(false);

  const reset = async () => {
    setResetting(true);
    try {
      await api("/api/demo/reset", { body: {} });
    } catch {
      await newDemoSession();
    }
    resetConnection();
    emit("refresh");
    setResetting(false);
    location.reload();
  };

  return (
    <div className="judge">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden>H</span>
          <div>
            <h1>Haven</h1>
            <p>Most AI companions want more of Amma's time. Haven wants more of Priya's calls.</p>
          </div>
        </div>
        <nav className="row">
          <button className={`tab${tab === "demo" ? " is-on" : ""}`} onClick={() => setTab("demo")}>Demo</button>
          <button className={`tab${tab === "setup" ? " is-on" : ""}`} onClick={() => setTab("setup")}>Setup</button>
          <button className="btn btn--ghost" onClick={reset} disabled={resetting}>{resetting ? "Resetting…" : "Reset demo"}</button>
        </nav>
      </header>
      <p className="disclaimer">
        Demo household with synthetic data (Kamala, 74, Bengaluru; her daughter Priya). "Digital Priya" is an AI and always says so. "Simulated Alexa+ add-on" is our own MCP client, not an Amazon product. WhatsApp sends are simulated here and mirrored on Priya's phone.
      </p>

      {tab === "setup" ? (
        <Setup />
      ) : (
        <>
          <div className="steps" role="toolbar" aria-label="Demo steps">
            {STEPS.map((s) => (
              <button key={s.label} className="step" onClick={() => (unlockAudio(), void s.run())}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="grid">
            <div className="col">
              <AlexaSim />
              <McpLog />
            </div>
            <Tablet compact />
            <Family framed />
          </div>
        </>
      )}
    </div>
  );
}
