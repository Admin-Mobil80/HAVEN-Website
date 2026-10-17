import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { emit } from "../lib/bus";
import { useNames } from "../lib/names";

type Voices = { available: boolean; current: { name: string; source: string } | null; library: { voiceId: string; publicOwnerId: string; name: string; accent?: string; gender?: string; language?: string; previewUrl?: string }[] };

// The companion's face and voice, both from the main user and both with explicit consent.
// Everything here is optional: without it the illustrated avatar and the default voice are used.
export function Likeness() {
  const n = useNames();
  const [voices, setVoices] = useState<Voices>();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const load = () => api<Voices>("/api/voices").then(setVoices, () => setVoices({ available: false, current: null, library: [] }));
  useEffect(() => {
    void load();
  }, []);

  const run = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label);
    setMsg("");
    try {
      await fn();
      setMsg(done);
      emit("refresh");
      await load();
    } catch (e) {
      setMsg(`Couldn't ${label.toLowerCase()}: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  const photoOn = n.setup?.photoAvatar;
  return (
    <section className="panel likeness" aria-label="Your face and voice">
      <header className="panel__head">
        <h2>Your face and voice</h2>
        <span className="muted">optional · always labelled AI</span>
      </header>
      <div className="setup__grid">
        <PhotoUpload user={n.user} on={Boolean(photoOn)} busy={busy} run={run} />
        <fieldset>
          <legend>Voice</legend>
          <p>Now: <strong>{voices?.current ? `${voices.current.name}` : "default voice (Amazon Polly)"}</strong></p>
          {voices && !voices.available ? (
            <p className="muted">Custom voices are not set up on this server yet.</p>
          ) : (
            <>
              <Recorder user={n.user} relation={n.setup?.elder.relationToUser ?? "loved one"} calledBy={n.calledBy} busy={busy} run={run} />
              <details>
                <summary>Or pick a voice</summary>
                <ul className="voices">
                  {(voices?.library ?? []).map((v) => (
                    <li key={v.voiceId}>
                      <div>
                        <strong>{v.name}</strong> <span className="muted">{[v.gender, v.accent, v.language].filter(Boolean).join(" · ")}</span>
                        {v.previewUrl && <audio controls preload="none" src={v.previewUrl} />}
                      </div>
                      <button className="btn" disabled={!!busy} onClick={() => run("Use this voice", () => api("/api/voice/select", { body: { voiceId: v.voiceId, publicOwnerId: v.publicOwnerId, name: v.name } }), `${n.companion} now speaks with ${v.name}'s voice.`)}>
                        Use
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
              {voices?.current && (
                <button className="btn btn--ghost" disabled={!!busy} onClick={() => run("Reset voice", () => api("/api/voice/reset", { body: {} }), "Back to the default voice.")}>
                  Use the default voice
                </button>
              )}
            </>
          )}
        </fieldset>
      </div>
      {msg && <p className="note" role="status">{msg}</p>}
    </section>
  );
}

type Run = (label: string, fn: () => Promise<unknown>, done: string) => Promise<void>;

// About a minute of reading. The first sentence is the consent, on the recording itself.
function Recorder({ user, relation, calledBy, busy, run }: { user: string; relation: string; calledBy: string; busy: string; run: Run }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [blob, setBlob] = useState<Blob>();
  const [consent, setConsent] = useState(false);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const script = [
    `I am ${user}, and I agree that Haven may make an AI copy of my voice, only to keep my ${relation}, ${calledBy}, company.`,
    `Good morning, ${calledBy}! Did you sleep well? I was thinking about you today. Tell me what you had for breakfast, and whether you went for your walk.`,
    `The weather here has been changing a lot. I hope it is pleasant where you are. Did anyone visit you this week? I would love to hear all about it.`,
    `Remember to drink some water and rest a little in the afternoon. I will call you soon, and we can talk properly. Take care, ${calledBy}.`,
  ];

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 128000 } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(timer.current);
      setBlob(new Blob(chunks.current, { type: r.mimeType || "audio/webm" }));
    };
    r.start(1000);
    setSecs(0);
    setBlob(undefined);
    timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
    setRec(r);
  };

  return (
    <div className="recorder">
      <p className="muted">Record your own voice: read this aloud in a quiet room (about a minute).</p>
      <blockquote className="script">{script.map((l, i) => <p key={i}>{l}</p>)}</blockquote>
      <div className="row row--wrap">
        {rec ? (
          <button className="btn btn--rec is-on" onClick={() => (rec.stop(), setRec(null))}>■ Stop ({secs}s)</button>
        ) : (
          <button className="btn btn--rec" disabled={!!busy} onClick={() => void start().catch(() => alert("Microphone not available"))}>🎙 {blob ? "Record again" : "Start recording"}</button>
        )}
        {blob && <audio controls src={URL.createObjectURL(blob)} />}
      </div>
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        This is my own voice. I agree Haven may create an AI copy of it, used only as "{user}'s voice (AI)" for my {relation}.
      </label>
      <button
        className="btn btn--primary"
        disabled={!blob || !consent || secs < 30 || !!busy}
        onClick={() => blob && run("Create your voice", () => api("/api/voice/clone?consent=yes", { raw: blob, contentType: blob.type.split(";")[0] }), `Done. Digital ${user} now speaks in your voice (labelled AI).`)}
      >
        {busy === "Create your voice" ? "Creating…" : secs < 30 && blob ? "Record at least 30 seconds" : "Use my voice"}
      </button>
    </div>
  );
}

// One clear, front-facing photo. Cropped to a square and resized in the browser before upload.
function PhotoUpload({ user, on, busy, run }: { user: string; on: boolean; busy: string; run: Run }) {
  const [preview, setPreview] = useState<string>();
  const [file, setFile] = useState<Blob>();
  const [consent, setConsent] = useState(false);

  const pick = async (f: File) => {
    const img = await createImageBitmap(f);
    const side = Math.min(img.width, img.height);
    const size = Math.max(1152, Math.min(1536, side));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    // Centre crop, a little above centre so the head and shoulders stay in frame.
    const sx = (img.width - side) / 2;
    const sy = Math.max(0, (img.height - side) * 0.35);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.9));
    setFile(blob);
    setPreview(URL.createObjectURL(blob));
  };

  return (
    <fieldset>
      <legend>Face</legend>
      <p>Now: <strong>{on ? "your photo-real avatar" : "the illustrated avatar"}</strong></p>
      <p className="muted">Use one clear, front-facing photo: good light, plain background, both eyes visible, mouth closed, neutral expression. It becomes a live, photo-real face that always shows an AI label.</p>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
      {preview && <img className="photo-preview" src={preview} alt="Your photo, cropped" />}
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        This is a photo of me ({user}), and I agree Haven may turn it into a labelled AI avatar.
      </label>
      <div className="row row--wrap">
        <button className="btn btn--primary" disabled={!file || !consent || !!busy} onClick={() => file && run("Create your avatar", () => api("/api/avatar/photo?consent=yes", { raw: file, contentType: "image/jpeg" }), "Your photo avatar is ready. Start a new conversation on the tablet to see it.")}>
          {busy === "Create your avatar" ? "Creating (up to a minute)…" : "Create my avatar"}
        </button>
        {on && (
          <button className="btn btn--ghost" disabled={!!busy} onClick={() => run("Remove avatar", () => api("/api/avatar/reset", { body: {} }), "Back to the illustrated avatar.")}>
            Use the illustration
          </button>
        )}
      </div>
    </fieldset>
  );
}
