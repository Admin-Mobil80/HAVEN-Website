import { useCallback, useEffect, useRef, useState } from "react";
import { api, poll } from "../lib/api";
import { emit, log, on } from "../lib/bus";
import type { FamilyState } from "../lib/types";
import { useNames } from "../lib/names";

// The family member's phone. What they need before they call, and one tap to act. In judge mode it also
// mirrors what WhatsApp delivered, since judges cannot receive messages from the test number.
export function Family({ framed }: { framed?: boolean }) {
  const [s, setS] = useState<FamilyState>();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const n = useNames();
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

  if (!s) return <section className={`panel family${framed ? " family--framed" : ""}`}><p className="muted">Loading…</p></section>;
  const amma = s.elder.calledBy;
  const incident = [...s.incidents].reverse().find((i) => i.state === "open" || i.state === "acknowledged");
  const digest = s.digests.at(-1);
  const open = s.deferrals.filter((d) => d.status === "open");
  const stats = s.callStats;
  const mirror = [...s.outbox].reverse().slice(0, 6);

  return (
    <section className={`panel family${framed ? " family--framed" : ""}`} aria-label={`${n.user}'s phone`}>
      <header className="panel__head">
        <h2>{n.user}'s phone</h2>
        <span className="muted">Haven for family</span>
      </header>

      <div className="family__body">
        <div className="metric" aria-label="Real calls this week">
          <div className="metric__num">
            {stats.realCallsThisWeek}
            <span>/ {stats.goal}</span>
          </div>
          <div className="metric__label">
            real calls with {amma} this week
            <br />
            <span className="muted">
              before Haven: {stats.baseline}/week · {stats.promptedByHaven} prompted by Haven{stats.demoSeeded ? ` · ${stats.demoSeeded} demo data` : ""}
            </span>
          </div>
        </div>

        {incident && (
          <div className={`card card--alert${incident.state === "acknowledged" ? " is-acked" : ""}`} role="alert">
            <p className="card__kicker">{incident.state === "acknowledged" ? "Alert · you're on it" : "Urgent · call now"}</p>
            <p className="card__title">{amma} may need you right now ({incident.reason.replace(/_/g, " ")}).</p>
            <p className="muted">
              Detected {new Date(incident.openedAt).toLocaleTimeString()} by Haven's safety rules. Haven is an AI and can be wrong.
            </p>
            <div className="row row--wrap">
              {incident.state === "open" && (
                <button className="btn btn--yes" disabled={!!busy} onClick={() => act("Calling now", async () => { await api(`/api/incidents/${incident.id}/ack`, { body: {} }); await api("/api/calls", { body: {} }); }, `Marked as seen. Call ${amma} on +${s.elder.phone}.`)}>
                  Calling now
                </button>
              )}
              <a className="btn" href={`tel:+${s.elder.phone}`}>Call {amma}</a>
              <button className="btn btn--ghost" disabled={!!busy} onClick={() => act("Close alert", () => api(`/api/incidents/${incident.id}/close`, { body: {} }), `Closed. Haven tells ${amma} you've got it.`)}>
                She's safe, close
              </button>
            </div>
            <ol className="timeline">
              {incident.timeline.slice(-5).map((e, i) => (
                <li key={i}>
                  <span>{e.at.slice(11, 19)}</span> {e.event.replace(/_/g, " ").replace(/:/g, " · ")}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="card">
          <p className="card__kicker">Today's update{digest ? ` · ${new Date(digest.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
          {digest ? (
            <>
              <p className="card__title">{digest.summary}</p>
              {digest.audioUrl && <audio className="player" controls preload="none" src={digest.audioUrl} />}
              {digest.starters.length > 0 && (
                <>
                  <p className="muted">When you call, ask about:</p>
                  <ul className="starters">{digest.starters.map((x) => <li key={x}>{x}</li>)}</ul>
                </>
              )}
            </>
          ) : (
            <p className="muted">Haven sends the update every evening at 9 pm.</p>
          )}
          <button className="btn btn--ghost" disabled={!!busy} onClick={() => act("Send digest now", () => api("/api/digest/run", { body: {} }), "Today's update is ready.")}>
            {busy === "Send digest now" ? "Writing…" : "Send today's update now"}
          </button>
        </div>

        {open.length > 0 && (
          <div className="card">
            <p className="card__kicker">{amma} asked you</p>
            {open.map((d) => (
              <Question key={d.id} id={d.id} question={d.question} onDone={() => act("Reply sent", async () => undefined, `Haven will play your reply to ${amma} in your own voice.`)} />
            ))}
          </div>
        )}

        <div className="row row--wrap">
          <button className="btn" disabled={!!busy} onClick={() => act("I'll call tonight", () => api("/api/call-promise", { body: {} }), `Haven will tell ${amma} you'll call tonight.`)}>
            I'll call tonight
          </button>
          <button className="btn btn--yes" disabled={!!busy} onClick={() => act(`Call ${amma}`, () => api("/api/calls", { body: {} }), `Calling ${amma}… ${n.companion} steps aside.`)}>
            📞 Call {amma}
          </button>
        </div>
        {note && <p className="note" role="status">{note}</p>}

        <details className="mirror">
          <summary>WhatsApp messages ({s.outbox.length})</summary>
          <p className="muted">What Haven sent to the family. In the demo household these are simulated.</p>
          <ul>
            {mirror.map((o) => (
              <li key={o.id}>
                <span className={`tag tag--${o.status}`}>{o.channel === "whatsapp" ? o.status : "simulated"}</span> <strong>{o.kind.replace(/_/g, " ")}</strong>: {o.body}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}

// Answer one of their questions with a voice note (MediaRecorder) or text.
function Question({ id, question, onDone }: { id: string; question: string; onDone: () => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const chunks = useRef<Blob[]>([]);

  const start = async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        try {
          await api(`/api/recordings?deferral=${encodeURIComponent(id)}`, { raw: blob, contentType: blob.type.split(";")[0] });
          onDone();
        } catch (e) {
          setErr(`Upload failed: ${(e as Error).message}`);
        }
      };
      r.start();
      setRec(r);
    } catch {
      setErr("Microphone not available. You can type a reply instead.");
    }
  };

  return (
    <div className="question">
      <p className="question__q">"{question}"</p>
      <div className="row row--wrap">
        {rec ? (
          <button className="btn btn--rec is-on" onClick={() => (rec.stop(), setRec(null))}>■ Stop and send</button>
        ) : (
          <button className="btn btn--rec" onClick={start}>🎙 Reply in your voice</button>
        )}
        <form
          className="typebox"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            await api(`/api/deferrals/${encodeURIComponent(id)}/answer`, { body: { text } });
            setText("");
            onDone();
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="or type a reply" aria-label="Type a reply" maxLength={500} />
          <button className="btn" type="submit" disabled={!text.trim()}>Send</button>
        </form>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
