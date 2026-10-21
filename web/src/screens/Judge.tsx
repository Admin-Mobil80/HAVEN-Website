import { useState } from "react";
import { McpLog } from "../components/McpLog";
import { api, newDemoSession } from "../lib/api";
import { unlockAudio } from "../lib/audio";
import { emit } from "../lib/bus";
import { resetConnection } from "../lib/mcp";
import { AlexaSim } from "./AlexaSim";
import { Family } from "./Family";
import { Setup } from "./Setup";
import { SetupWizard } from "./SetupWizard";
import { Likeness } from "./Likeness";
import { useNames, type Names } from "../lib/names";
import { Tablet } from "./Tablet";
import { Icon } from "../components/Icon";

// One page for judges: the simulator, the tablet and the family member's phone side by side, a
// step bar that walks the story, and a private demo household per browser tab (no sign-up, no
// tokens). Every demo starts with setup; the steps use the names given there.
const steps = (n: Names): { label: string; run: () => void | Promise<unknown> }[] => [
  { label: `1. Alexa, talk to ${n.user}`, run: () => emit("alexa:say", `Alexa, talk to ${n.user}`) },
  { label: "2. A memory", run: () => emit("tablet:say", "I met my old friend at the market today, we used to sing together") },
  { label: "3. Will you come home?", run: () => emit("tablet:say", "Will you come home next month?") },
  { label: `4. Tell ${n.user}…`, run: () => emit("tablet:say", `Tell ${n.user} the flowers in the garden have bloomed`) },
  { label: "5. Yes, send it", run: () => emit("tablet:say", "Yes, send it") },
  { label: "6. Evening update", run: () => api("/api/digest/run", { body: {} }).then(() => emit("refresh")) },
  { label: "7. Help, I feel dizzy", run: () => emit("tablet:say", "Help, I feel dizzy") },
];

export function Judge() {
  const [tab, setTab] = useState<"demo" | "setup">("demo");
  const [resetting, setResetting] = useState(false);
  const [lastStep, setLastStep] = useState(-1);
  const names = useNames();

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

  const story = steps(names);
  return (
    <div className="judge">
      <header className="topbar">
        <div className="topbar__in">
          <span className="brand"><Icon name="cottage" fill />Haven</span>
          <p className="brand__tag">Most AI companions want more of your loved one's time. Haven wants more of your calls.</p>
          <nav className="tabs" aria-label="Sections">
            <button className={`tab${tab === "demo" ? " is-on" : ""}`} aria-current={tab === "demo" ? "page" : undefined} onClick={() => setTab("demo")}>
              <Icon name="smart_toy" />Demo
            </button>
            <button className={`tab${tab === "setup" ? " is-on" : ""}`} aria-current={tab === "setup" ? "page" : undefined} onClick={() => setTab("setup")}>
              <Icon name="tune" />Setup
            </button>
            <button className="btn btn--soft btn--sm" onClick={reset} disabled={resetting}>
              <Icon name="restart_alt" />{resetting ? "Resetting…" : "Reset demo"}
            </button>
          </nav>
        </div>
      </header>
      <div className="notice">
        <p>
          <Icon name="verified_user" />
          {names.configured
            ? `A private demo household for this browser tab. "${names.companion}" is an AI and always says so. "Simulated Alexa+ add-on" is our own MCP client, not an Amazon product. WhatsApp sends are simulated here and mirrored on ${names.user}'s phone.`
            : "A private demo household for this browser tab. Haven's companion is an AI and always says so."}
        </p>
      </div>

      {names.ready && !names.configured ? (
        <main className="judge__main">
          <SetupWizard onDone={(how) => setTab(how === "own" ? "setup" : "demo")} />
        </main>
      ) : tab === "setup" ? (
        <main className="judge__main">
          <Likeness />
          <Setup />
        </main>
      ) : (
        <>
          <div className="steps" role="toolbar" aria-label="Demo walkthrough">
            <div className="steps__in">
              <span className="steps__label"><Icon name="route" />Walkthrough:</span>
              {story.map((s, i) => (
                <button
                  key={s.label}
                  className={`step${i === story.length - 1 ? " step--safety" : ""}${i === lastStep ? " is-on" : ""}`}
                  onClick={() => (unlockAudio(), setLastStep(i), void s.run())}
                >
                  {i === story.length - 1 && <Icon name="shield_with_heart" />}
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <main className="judge__main">
            <div className="grid">
              <div className="col">
                <AlexaSim />
                <McpLog />
              </div>
              <div className="col">
                <div>
                  <div className="device__label device__label--tablet">
                    <span className="kicker"><Icon name="tablet_mac" />{names.calledBy}'s tablet</span>
                    <span className="pill pill--brand">Who Haven is for</span>
                  </div>
                  <div className="bezel">
                    <Tablet compact />
                  </div>
                </div>
              </div>
              <div className="col">
                <div>
                  <div className="device__label device__label--phone">
                    <span className="kicker"><Icon name="chat" />{names.user}'s WhatsApp</span>
                    <span className="pill pill--real">Haven for family</span>
                  </div>
                  <div className="bezel bezel--phone">
                    <Family framed />
                  </div>
                </div>
              </div>
            </div>
          </main>
        </>
      )}
    </div>
  );
}
