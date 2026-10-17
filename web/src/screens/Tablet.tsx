import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, type AvatarState, type Mouth } from "../components/Avatar";
import { api, poll } from "../lib/api";
import { playBase64, playSrc, speakBrowser, unlockAudio } from "../lib/audio";
import { emit, log, on } from "../lib/bus";
import { callTool } from "../lib/mcp";
import { canListen, listen } from "../lib/speech";
import type { ElderState, PlayedMessage, TurnResponse } from "../lib/types";
import { forms, useNames } from "../lib/names";

// Stable function identity that always calls the latest closure.
function useCallbackRef<A extends unknown[], R>(fn: (...a: A) => R) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...a: A) => ref.current(...a), []);
}

// The tablet for the person Haven keeps company. Large type, captions always on, one big talk
// button, no timers to race.
export function Tablet({ chips: chipsProp, compact }: { chips?: string[]; compact?: boolean }) {
  const n = useNames();
  const chips = chipsProp ?? ["I met my old friend today", `Tell ${n.user} the flowers have bloomed`, "Will you come home next month?", "Are you real?"];
  const [elder, setElder] = useState<ElderState>();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AvatarState>("idle");
  const [mouth, setMouth] = useState<Mouth>("rest");
  const [caption, setCaption] = useState("");
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [confirm, setConfirm] = useState<TurnResponse["awaitingConfirmation"]>();
  const [relay, setRelay] = useState<PlayedMessage | null>(null);
  const [error, setError] = useState("");
  const [callEnded, setCallEnded] = useState<string>();
  const busy = useRef(false);
  const openRef = useRef(false);

  const refresh = useCallback(async () => setElder(await api<ElderState>("/api/state/elder")), []);
  useEffect(() => {
    const off = poll(refresh, 4000);
    return () => off();
  }, [refresh]);
  useEffect(() => {
    const off = on("refresh", () => void refresh());
    return () => off();
  }, [refresh]);

  const speak = useCallback(async (r: Pick<TurnResponse, "text" | "audio" | "visemes">) => {
    if (!r.text) return;
    setCaption(r.text);
    setState("speaking");
    if (r.audio) {
      const timeline = r.visemes;
      let i = 0;
      await playBase64(r.audio.base64, r.audio.contentType, (ms) => {
        while (i + 1 < timeline.length && timeline[i + 1].t <= ms) i++;
        setMouth(ms === Number.POSITIVE_INFINITY ? "rest" : timeline[i]?.mouth ?? "rest");
      }).done;
    } else {
      let flap: ReturnType<typeof setInterval> | undefined;
      await speakBrowser(r.text, {
        onSpeaking: (on) => {
          clearInterval(flap);
          if (on) flap = setInterval(() => setMouth((m) => (m === "open" ? "narrow" : "open")), 140);
        },
      });
      clearInterval(flap);
    }
    setMouth("rest");
    setState("idle");
  }, []);

  // Turns run one at a time in order: a tap while she is still speaking waits its turn.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const turn = useCallback(
    (body: Record<string, unknown>) => (queue.current = queue.current.then(() => runTurn(body))),
    [],
  );
  const runTurn = useCallbackRef(async (body: Record<string, unknown>) => {
    busy.current = true;
    {
      setError("");
      setState("thinking");
      try {
        const r = await api<TurnResponse>("/api/turn", { body });
        for (const t of r.mcpTrace) log({ source: t.client === "rule" ? "rule" : "agent", dir: "•", title: t.summary, isError: t.isError });
        if (r.mode === "safety") log({ source: "rule", dir: "•", title: "safety rule fired: incident opened, family alerted (no LLM)" });
        setConfirm(r.awaitingConfirmation);
        emit("refresh");
        await speak(r);
        void refresh();
      } catch (e) {
        setError("Sorry, I couldn't hear that properly. Please try again.");
        setState("idle");
        console.warn(e);
      } finally {
        busy.current = false;
      }
    }
  });

  const say = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      if (!openRef.current) {
        openRef.current = true;
        setOpen(true);
        void turn({ event: "session_start" });
      }
      setHeard(t);
      await turn({ text: t });
    },
    [turn],
  );

  const start = useCallback(async () => {
    unlockAudio();
    if (openRef.current) return;
    openRef.current = true;
    setOpen(true);
    await turn({ event: "session_start" });
  }, [turn]);

  useEffect(() => {
    const off = on("tablet:open", () => void start());
    return () => off();
  }, [start]);
  useEffect(() => {
    const off = on("tablet:say", (t) => void say(t));
    return () => off();
  }, [say]);

  const talk = async () => {
    unlockAudio();
    if (!canListen) return;
    setState("listening");
    setHeard("");
    try {
      const text = await listen({ onInterim: setHeard }).done;
      setState("idle");
      if (text) await say(text);
    } catch {
      setState("idle");
      setError("The microphone isn't available. You can type or tap a suggestion below.");
    }
  };

  // A real recording or note from the family member: played as them, with the avatar stepped back.
  const playFamily = async () => {
    unlockAudio();
    const r = await callTool<{ message: PlayedMessage | null }>("play_family_message", {});
    const m = r.data.message;
    if (!m) return void refresh();
    setRelay(m);
    setState("idle");
    if (m.audioUrl) await playSrc(m.audioUrl).done;
    else if (m.text) await speakBrowser(`${m.from} wrote: ${m.text}`, { lang: "en-GB", male: true });
    setRelay(null);
    await turn({ event: "relay_done", messageId: m.id });
  };

  const incident = elder?.openIncident;
  const calling = elder?.familyCalling;
  const badge = elder?.persona.badge ?? `${n.companion} · AI`;
  const childP = forms((elder?.persona.childPronouns as "she" | "he" | "they" | undefined) ?? n.setup?.user.pronouns);
  const child = elder?.persona.childName ?? "your family";

  return (
    <section className={`panel tablet${compact ? " tablet--compact" : ""}`} aria-label={`${n.calledBy}'s tablet`}>
      <header className="panel__head">
        <h2>{n.calledBy}'s tablet</h2>
        <span className={`status status--${state}`}>{state === "listening" ? "Listening…" : state === "thinking" ? "Thinking…" : state === "speaking" ? "Speaking" : open ? "Ready" : "Asleep"}</span>
      </header>

      <div className="tablet__stage">
        {incident ? (
          <div className="overlay overlay--safety" role="alert">
            <p className="overlay__kicker">Haven Safety</p>
            <p className="overlay__big">{incident.state === "acknowledged" ? `${child} has seen your alert.` : `${child} has been alerted.`}</p>
            <p>If you are hurt or in danger, call <strong>112</strong> now.</p>
          </div>
        ) : calling && calling.at !== callEnded ? (
          <div className="overlay overlay--call" role="status">
            <div className="overlay__icon" aria-hidden>📞</div>
            <p className="overlay__big">The real {calling.by} is calling!</p>
            <p>I'll step aside. Enjoy your chat, {elder?.elder.calledBy}.</p>
            <button className="btn" onClick={() => setCallEnded(calling.at)}>Call ended</button>
          </div>
        ) : (
          <Avatar mouth={mouth} state={state} badge={badge} dim={Boolean(relay)} />
        )}
        {relay && (
          <div className="realcard" role="status">
            <p className="realcard__kicker">From the real {child}, {relay.audioUrl ? `in ${childP.poss} own voice` : "a note"}</p>
            {relay.question && <p className="realcard__q">You asked: "{relay.question}"</p>}
            {relay.text && <p className="realcard__text">{relay.text}</p>}
          </div>
        )}
      </div>

      <p className="caption" aria-live="polite">
        {caption || (open ? "" : `Say "Alexa, talk to ${n.user}", or tap the button.`)}
      </p>
      {heard && <p className="heard">You: {heard}</p>}
      {error && <p className="error">{error}</p>}

      {!open ? (
        <button className="btn btn--huge" onClick={start}>
          Talk to {child === "your family" ? n.user : child}
        </button>
      ) : (
        <div className="tablet__controls">
          {elder && elder.pendingFamilyMessages > 0 && !relay && (
            <button className="btn btn--real" onClick={playFamily}>
              ▶ A message from the real {child}
            </button>
          )}
          {confirm && (
            <div className="confirm">
              <p>Send to {confirm.to}: "{confirm.message}"?</p>
              <div className="row">
                <button className="btn btn--yes" onClick={() => say("Haan, send it")}>Haan, send it</button>
                <button className="btn btn--no" onClick={() => say("No, leave it")}>No</button>
              </div>
            </div>
          )}
          {canListen && (
            <button className={`btn btn--mic${state === "listening" ? " is-on" : ""}`} onClick={talk} disabled={state === "thinking" || state === "speaking"} aria-label="Tap and speak">
              🎤 Tap and speak
            </button>
          )}
          <form
            className="typebox"
            onSubmit={(e) => {
              e.preventDefault();
              void say(typed);
              setTyped("");
            }}
          >
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type here…" aria-label={`Type to ${n.companion}`} maxLength={500} />
            <button className="btn" type="submit" disabled={!typed.trim()}>Send</button>
          </form>
          <div className="chips" aria-label="Suggestions">
            {chips.map((c) => (
              <button key={c} className="chip" onClick={() => say(c)}>
                {c}
              </button>
            ))}
            <button className="chip chip--end" onClick={() => ((openRef.current = false), setOpen(false), void turn({ event: "session_end" }))} disabled={state !== "idle"}>
              Bye for now
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
