import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, type AvatarState, type Mouth } from "../components/Avatar";
import { api, poll } from "../lib/api";
import { playBase64, playSrc, playTts, speakBrowser, unlockAudio } from "../lib/audio";
import { emit, log, on } from "../lib/bus";
import { callTool } from "../lib/mcp";
import { canListen, listen, type Listening } from "../lib/speech";
import type { ElderState, PlayedMessage, TurnResponse } from "../lib/types";
import { forms, useNames } from "../lib/names";
import { cuePhoto, isLive, speakPhoto, startPhotoAvatar, stopPhotoAvatar } from "../lib/anam";

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
  // The photo-real face: "off" (illustrated avatar), "connecting", "live", or "failed" (fallback).
  const [photo, setPhoto] = useState<"off" | "connecting" | "live" | "failed">("off");
  const [videoOn, setVideoOn] = useState(false); // the live face shows only while it is speaking
  const photoRef = useRef(photo);
  photoRef.current = photo;
  const busy = useRef(false);
  const openRef = useRef(false);
  const listening = useRef<Listening | null>(null);

  const elderRef = useRef<ElderState | undefined>(undefined);
  const refresh = useCallback(async () => {
    const e = await api<ElderState>("/api/state/elder");
    elderRef.current = e;
    setElder(e);
  }, []);
  useEffect(() => {
    const off = poll(refresh, 4000);
    return () => off();
  }, [refresh]);
  useEffect(() => {
    const off = on("refresh", () => void refresh());
    return () => off();
  }, [refresh]);

  // The photo-real face is billed per minute, so it is only connected around a reply: it starts
  // connecting when a turn begins (while they speak and Haven thinks), shows while it talks, and
  // closes a few seconds later. In between, the tablet shows the still photo.
  const wantPhoto = () => Boolean(elderRef.current?.photoAvatar) && photoRef.current !== "failed";
  const connecting = useRef<Promise<boolean> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const warmPhoto = useCallback((): Promise<boolean> => {
    clearTimeout(closeTimer.current);
    if (!wantPhoto()) return Promise.resolve(false);
    if (isLive()) return Promise.resolve(true);
    if (connecting.current) return connecting.current;
    setPhoto("connecting");
    const t0 = performance.now();
    connecting.current = startPhotoAvatar("haven-video", () => (setPhoto("off"), setVideoOn(false)))
      .then(() => {
        setPhoto("live");
        log({ source: "tablet", dir: "•", title: `photo avatar connected in ${Math.round(performance.now() - t0)} ms` });
        return true;
      })
      .catch((e) => {
        console.warn("photo avatar unavailable, using the illustrated one", e);
        setPhoto("failed");
        return false;
      })
      .finally(() => (connecting.current = null));
    return connecting.current;
  }, []);
  const releasePhoto = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (busy.current || listening.current || !isLive()) return;
      stopPhotoAvatar();
      setPhoto("off");
      setVideoOn(false);
    }, 4000);
  }, []);
  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && isLive() && (stopPhotoAvatar(), setPhoto("off"), setVideoOn(false));
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      clearTimeout(closeTimer.current);
      stopPhotoAvatar();
    };
  }, []);

  const flapWhile = async (play: () => Promise<void>) => {
    const flap = setInterval(() => setMouth((m) => (m === "open" ? "narrow" : "open")), 140);
    try {
      await play();
    } finally {
      clearInterval(flap);
    }
  };

  const speak = useCallback(async (r: Pick<TurnResponse, "text" | "audio" | "visemes" | "mode">) => {
    if (!r.text) return;
    setCaption(r.text);
    if (!r.audio && wantPhoto()) {
      const ok = await warmPhoto();
      setState("speaking");
      if (ok) {
        try {
          cuePhoto(r.mode === "safety" ? "concerned" : r.mode === "greeting" || r.mode === "goodbye" ? "happy" : "warm");
          setVideoOn(true);
          await speakPhoto(r.text);
          setVideoOn(false);
          setState("idle");
          releasePhoto();
          return;
        } catch (e) {
          console.warn("photo avatar speech failed, falling back", e);
          setVideoOn(false);
          setPhoto("failed");
        }
      }
      // No live face: the same voice through the speaker, with the illustrated avatar.
      try {
        await flapWhile(() => playTts(r.text));
      } catch {
        await speakBrowser(r.text);
      }
      setMouth("rest");
      setState("idle");
      return;
    }
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
    const photoReply = wantPhoto();
    if (photoReply) void warmPhoto(); // connect while Haven thinks
    {
      setError("");
      setState("thinking");
      try {
        // With the photo avatar, the avatar speaks (via /api/tts), so skip server audio.
        const r = await api<TurnResponse>("/api/turn", { body: { ...body, speech: photoReply ? "none" : "server" } });
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
    if (photoRef.current === "failed") setPhoto("off"); // a new conversation tries the live face again
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

  // Tap once to speak; tap again ("Done") to finish early. Otherwise it finishes after a pause.
  const talk = async () => {
    unlockAudio();
    if (!canListen) return;
    if (listening.current) return listening.current.stop();
    setState("listening");
    setHeard("");
    setError("");
    void warmPhoto(); // the live face connects while they talk
    try {
      listening.current = listen({ lang: elderRef.current?.elder.language === "hi-IN" ? "hi-IN" : "en-IN", onInterim: setHeard });
      const text = await listening.current.done;
      listening.current = null;
      setState("idle");
      if (text) await say(text);
      else setError("I didn't catch that. Tap and try again, a little closer to the microphone.");
    } catch (e) {
      listening.current = null;
      setState("idle");
      const denied = /not-allowed|service-not-allowed/.test((e as Error).message);
      setError(denied ? "The microphone is blocked. Allow it in the browser's address bar, or type below." : "The microphone isn't available. You can type or tap a suggestion below.");
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
          elder?.photoAvatar && photo !== "failed" ? (
            <div className={`photoav${relay ? " avatar--dim" : ""}`}>
              {elder.photoUrl && <img src={elder.photoUrl} alt={`${n.companion}${open ? "" : ", asleep"}`} />}
              <video id="haven-video" className={videoOn ? "is-on" : ""} autoPlay playsInline />
              <div className="avatar__badge" aria-label="This is an AI">{badge}</div>
            </div>
          ) : (
            <Avatar mouth={mouth} state={state} badge={badge} dim={Boolean(relay)} />
          )
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
              {state === "listening" ? "✓ Done" : "🎤 Tap and speak"}
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
