import { useCallback, useEffect, useRef, useState } from "react";
import { api, poll } from "../lib/api";
import { emit, log, on } from "../lib/bus";
import type { FamilyState } from "../lib/types";
import { useNames } from "../lib/names";
import { Icon } from "../components/Icon";

type Digest = FamilyState["digests"][number];
type Incident = FamilyState["incidents"][number];
type Deferral = FamilyState["deferrals"][number];
type Message = FamilyState["messages"][number];
type Outbox = FamilyState["outbox"][number];

// One chat line, in time order. Haven's messages come in on the left; the family member's own
// replies go out on the right.
type Item =
  | { at: string; type: "digest"; digest: Digest }
  | { at: string; type: "alert"; incident: Incident }
  | { at: string; type: "question"; deferral: Deferral }
  | { at: string; type: "text"; body: string; kind: string }
  | { at: string; type: "mine"; message: Message };

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();

// The family member's side of Haven, styled as the chat it arrives in. Real families get these
// messages on WhatsApp; in the demo household they are simulated and shown here instead.
export function Family({ framed }: { framed?: boolean }) {
  const [s, setS] = useState<FamilyState>();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const n = useNames();
  const chat = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => setS(await api<FamilyState>("/api/state/family")), []);
  useEffect(() => {
    const off = poll(refresh, 5000);
    return () => off();
  }, [refresh]);
  useEffect(() => {
    const off = on("refresh", () => void refresh());
    return () => off();
  }, [refresh]);

  const act = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    setNote("");
    try {
      await fn();
      if (done) setNote(done);
      log({ source: "family", dir: "•", title: label });
      emit("refresh");
      await refresh();
    } catch (e) {
      setNote(`Couldn't ${label.toLowerCase()}: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  const items = s ? timeline(s) : [];
  const count = items.length;
  // Scroll the chat itself, never the page.
  useEffect(() => {
    const el = chat.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, note]);

  if (!s) return <section className={`wa${framed ? " wa--framed" : ""}`}><p className="muted" style={{ padding: 16 }}>Loading…</p></section>;
  const mom = s.elder.calledBy;
  const E = n.elderP;
  const stats = s.callStats;
  const openQuestion = [...s.deferrals].reverse().find((d) => d.status === "open");
  const callMom = () => act(`Call ${mom}`, () => api("/api/calls", { body: {} }), `Calling ${mom}… ${n.companion} steps aside.`);
  const callTonight = () => act("I'll call tonight", () => api("/api/call-promise", { body: {} }), `Haven will tell ${mom} you'll call tonight.`);

  return (
    <section className={`wa${framed ? " wa--framed" : ""}`} aria-label={`${n.user}'s WhatsApp`}>
      {framed && (
        <div className="wa__status" aria-hidden>
          <span>{new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "")}</span>
          <span className="wa__statusicons"><Icon name="signal_cellular_alt" /><Icon name="wifi" /><Icon name="battery_full" /></span>
        </div>
      )}
      <header className="wa__bar">
        <Icon name="arrow_back" />
        <span className="wa__avatar" aria-hidden><Icon name="cottage" fill /></span>
        <div className="wa__who">
          <strong>Haven</strong>
          <span>{mom}'s companion · Business account</span>
        </div>
        <span className="wa__baricons" aria-hidden><Icon name="videocam" /><Icon name="call" /><Icon name="more_vert" /></span>
      </header>

      <div className="wa__chat" role="log" aria-live="polite" ref={chat}>
        <div className="wa__pinned">
          <Icon name="push_pin" fill />
          <div>
            <strong>Real calls with {mom} this week: {stats.realCallsThisWeek} / {stats.goal}</strong>
            <span>before Haven: {stats.baseline}/week · {stats.promptedByHaven} prompted by Haven{stats.demoSeeded ? ` · ${stats.demoSeeded} demo data` : ""}</span>
          </div>
        </div>
        <p className="wa__system"><Icon name="lock" />Messages from Haven about {mom}. {s.demo ? "Simulated in this demo: nothing is sent to a real phone." : "Delivered on WhatsApp."}</p>
        <p className="wa__day">Today</p>

        <Bubble at={items[0]?.at}>
          Hi {n.user} 👋 I'm Haven, keeping {mom} company. Every evening you'll get {E.poss} update here, with what to ask when you call. If {E.subj} ever needs you, I'll message you straight away.
        </Bubble>

        {items.map((it, i) => {
          if (it.type === "digest") {
            const d = it.digest;
            return (
              <Bubble key={i} at={it.at} buttons={[
                { label: `Call ${mom}`, icon: "call", onClick: callMom },
                { label: "I'll call tonight", onClick: callTonight },
              ]} busy={!!busy}>
                <p className="wa__title"><Icon name="wb_twilight" />Today's update · {mom}</p>
                <p>{d.summary}</p>
                {d.audioUrl && <audio className="wa__audio" controls preload="none" src={d.audioUrl} />}
                {d.starters.length > 0 && (
                  <>
                    <p className="wa__title wa__title--ask"><Icon name="lightbulb" />When you call, ask about:</p>
                    <ul className="wa__list">{d.starters.map((x) => <li key={x}>{x}</li>)}</ul>
                  </>
                )}
              </Bubble>
            );
          }
          if (it.type === "alert") {
            const inc = it.incident;
            const active = inc.state === "open" || inc.state === "acknowledged";
            return (
              <Bubble key={i} at={it.at} tone={active ? "alert" : undefined} busy={!!busy} buttons={active ? [
                ...(inc.state === "open" ? [{ label: "Calling now", icon: "call" as const, onClick: () => act("Calling now", async () => { await api(`/api/incidents/${inc.id}/ack`, { body: {} }); await api("/api/calls", { body: {} }); }, `Marked as seen. Calling ${mom}.`) }] : []),
                { label: `${E.Subj === "They" ? "They're" : `${E.Subj}'s`} safe, close`, icon: "check" as const, onClick: () => act("Close alert", () => api(`/api/incidents/${inc.id}/close`, { body: {} }), `Closed. Haven tells ${mom} you've got it.`) },
              ] : undefined}>
                <p className="wa__title wa__title--alert"><Icon name="shield_with_heart" fill />{inc.state === "acknowledged" ? "Alert · you're on it" : inc.state === "open" ? "Urgent · call now" : "Alert · closed"}</p>
                <p><strong>{mom} may need you right now</strong> ({inc.reason.replace(/_/g, " ")}).</p>
                <p className="wa__small">Detected by Haven's safety rules. Haven is an AI and can be wrong.</p>
                {s.elder.phone && active && <a className="wa__link" href={`tel:+${s.elder.phone}`}>Call {mom} directly</a>}
              </Bubble>
            );
          }
          if (it.type === "question") {
            const d = it.deferral;
            return (
              <Bubble key={i} at={it.at}>
                <p className="wa__title"><Icon name="mark_chat_unread" />{mom} asked you</p>
                <p className="wa__quote">"{d.question}"</p>
                <p className="wa__small">{d.status === "open" ? `${n.companion} didn't answer for you. Reply below, in your own voice if you can: ${mom} will hear the real you.` : "✓ You answered."}</p>
              </Bubble>
            );
          }
          if (it.type === "text") return <Bubble key={i} at={it.at}>{it.body}</Bubble>;
          const m = it.message;
          return (
            <Bubble key={i} at={it.at} mine read={Boolean(m.playedAt)}>
              {m.audioUrl ? <audio className="wa__audio" controls preload="none" src={m.audioUrl} /> : <p>{m.kind === "call_promise" ? `I'll call you tonight, ${mom} 📞` : m.text}</p>}
            </Bubble>
          );
        })}

        {note && <p className="wa__system" role="status">{note}</p>}
        <div className="wa__actions">
          <button className="wa__chip" disabled={!!busy} onClick={() => act("Send digest now", () => api("/api/digest/run", { body: {} }), "Today's update is ready.")}>
            {busy === "Send digest now" ? "Writing…" : "Send today's update now"}
          </button>
        </div>
      </div>

      <Composer mom={mom} openQuestion={openQuestion} onSent={(what) => act(what, async () => undefined, what === "Voice note sent" ? `${mom} will hear your voice note on the tablet.` : `${mom} will see your message on the tablet.`)} />
    </section>
  );
}

// Haven's messages and the family member's replies, oldest first.
function timeline(s: FamilyState): Item[] {
  const items: Item[] = [];
  const shownDigests = new Set<string>();
  const shownIncidents = new Set<string>();
  for (const o of s.outbox as Outbox[]) {
    if (o.kind === "digest") {
      const d = s.digests.find((x) => x.id === o.refId) ?? s.digests.find((x) => Math.abs(Date.parse(x.createdAt) - Date.parse(o.at)) < 120_000);
      if (d && !shownDigests.has(d.id)) {
        shownDigests.add(d.id);
        items.push({ at: o.at, type: "digest", digest: d });
      }
    } else if (o.kind === "urgent_alert" || o.kind === "important_alert") {
      const inc = s.incidents.find((x) => x.id === o.refId);
      if (inc && !shownIncidents.has(inc.id)) {
        shownIncidents.add(inc.id);
        items.push({ at: o.at, type: "alert", incident: inc });
      }
    } else if (o.kind === "elder_reply") {
      items.push({ at: o.at, type: "text", body: o.body, kind: o.kind });
    }
  }
  // Anything that never went out (no recipient yet, or a failed send) still shows in the chat.
  for (const d of s.digests) if (!shownDigests.has(d.id)) items.push({ at: d.createdAt, type: "digest", digest: d });
  for (const inc of s.incidents) if (!shownIncidents.has(inc.id)) items.push({ at: inc.openedAt, type: "alert", incident: inc });
  for (const d of s.deferrals) items.push({ at: d.createdAt, type: "question", deferral: d });
  for (const m of s.messages) items.push({ at: m.createdAt, type: "mine", message: m });
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

type Button = { label: string; icon?: "call" | "check"; onClick: () => void };

function Bubble({ at, mine, read, tone, buttons, busy, children }: { at?: string; mine?: boolean; read?: boolean; tone?: "alert"; buttons?: Button[]; busy?: boolean; children: React.ReactNode }) {
  return (
    <div className={`wa__row${mine ? " wa__row--mine" : ""}`}>
      <div className="wa__bubblewrap">
        <div className={`wa__bubble${mine ? " wa__bubble--mine" : ""}${tone === "alert" ? " wa__bubble--alert" : ""}`}>
          <div className="wa__body">{children}</div>
          <span className="wa__meta">
            {at ? time(at) : ""}
            {mine && <Icon name="done_all" className={read ? "wa__read" : ""} />}
          </span>
        </div>
        {buttons && buttons.length > 0 && (
          <div className="wa__buttons">
            {buttons.map((b) => (
              <button key={b.label} disabled={busy} onClick={b.onClick}>
                {b.icon && <Icon name={b.icon} />}
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// The message bar: type, or hold a voice note. When the person asked a question, the reply answers it.
function Composer({ mom, openQuestion, onSent }: { mom: string; openQuestion?: Deferral; onSent: (what: string) => void }) {
  const [text, setText] = useState("");
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState("");
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const sendText = async () => {
    const t = text.trim();
    if (!t) return;
    setErr("");
    try {
      if (openQuestion) await api(`/api/deferrals/${encodeURIComponent(openQuestion.id)}/answer`, { body: { text: t } });
      else await api("/api/messages", { body: { text: t } });
      setText("");
      onSent("Message sent");
    } catch (e) {
      setErr(`Couldn't send: ${(e as Error).message}`);
    }
  };

  const record = async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timer.current);
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        try {
          const q = openQuestion ? `?deferral=${encodeURIComponent(openQuestion.id)}` : "";
          await api(`/api/recordings${q}`, { raw: blob, contentType: blob.type.split(";")[0] });
          onSent("Voice note sent");
        } catch (e) {
          setErr(`Upload failed: ${(e as Error).message}`);
        }
      };
      r.start();
      setSecs(0);
      timer.current = setInterval(() => setSecs((x) => x + 1), 1000);
      setRec(r);
    } catch {
      setErr("Microphone not available. You can type instead.");
    }
  };

  return (
    <div className="wa__compose">
      {err && <p className="wa__err">{err}</p>}
      {openQuestion && !rec && <p className="wa__replying">Replying to: "{openQuestion.question}"</p>}
      <form
        className="wa__inputrow"
        onSubmit={(e) => {
          e.preventDefault();
          void sendText();
        }}
      >
        {rec ? (
          <div className="wa__recording" role="status">
            <span className="wa__dot" aria-hidden />Recording {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
            <button type="button" className="wa__cancel" onClick={() => ((rec.onstop = null), rec.stop(), rec.stream.getTracks().forEach((t) => t.stop()), clearInterval(timer.current), setRec(null))} aria-label="Cancel voice note">
              <Icon name="cancel" />
            </button>
          </div>
        ) : (
          <div className="wa__field">
            <Icon name="mood" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={openQuestion ? `Reply to ${mom}` : "Message"} aria-label={`Message ${mom}`} maxLength={500} />
            <Icon name="attach_file" />
            {!text.trim() && <Icon name="photo_camera" />}
          </div>
        )}
        {text.trim() && !rec ? (
          <button className="wa__send" type="submit" aria-label="Send"><Icon name="send" fill /></button>
        ) : rec ? (
          <button className="wa__send" type="button" onClick={() => (rec.stop(), setRec(null))} aria-label="Send voice note"><Icon name="send" fill /></button>
        ) : (
          <button className="wa__send" type="button" onClick={() => void record()} aria-label={openQuestion ? "Reply in your own voice" : "Record a voice note"}><Icon name="mic" fill /></button>
        )}
      </form>
    </div>
  );
}
