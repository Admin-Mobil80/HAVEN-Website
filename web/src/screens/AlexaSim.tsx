import { useEffect, useRef, useState } from "react";
import { speakBrowser, unlockAudio } from "../lib/audio";
import { emit, log, on } from "../lib/bus";
import { callTool, connect } from "../lib/mcp";
import { canListen, listen, speechLang } from "../lib/speech";
import { useNames } from "../lib/names";

// "Simulated Alexa+ add-on": a real MCP client of Haven's server. It routes a few fixed intents
// itself (as Alexa+ would) and hands the conversation to the tablet. Not an Alexa product and no
// Alexa branding: plain text label, a neutral voice.
export function AlexaSim() {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState("");
  const [typed, setTyped] = useState("");
  const n = useNames();
  const talkTo = `Alexa, talk to ${n.user}`;

  const reply = async (text: string) => {
    setLast(text);
    await speakBrowser(text, { lang: "en-GB", male: true });
  };

  const handle = async (utterance: string) => {
    const u = utterance.toLowerCase();
    setBusy(true);
    try {
      const who = n.user.toLowerCase();
      if (u.includes(`talk to ${who}`) || /talk to haven|open haven/.test(u) || (who && u.includes(`open ${who}`))) {
        const tools = await connect();
        log({ source: "alexa-sim", dir: "•", title: `connected: ${tools.length} tools` });
        const [mem, rem, peek] = await Promise.all([
          callTool<{ memories: { content: string }[] }>("recall_memory", { limit: 3 }),
          callTool<{ reminders: { text: string }[] }>("get_reminders", { window: "today" }),
          callTool<{ message: unknown; remaining: number }>("play_family_message", { peek: true }),
        ]);
        log({ source: "alexa-sim", dir: "•", title: `context: ${mem.data.memories?.length ?? 0} memories, ${rem.data.reminders?.length ?? 0} reminders, ${peek.data.remaining ?? 0} family messages` });
        await reply(`Opening ${n.companion}, an AI version of ${n.user}, on your screen.`);
        emit("tablet:open");
      } else if (/message|anything from/.test(u)) {
        const r = await callTool<{ remaining: number }>("play_family_message", { peek: true });
        await reply(r.data.remaining ? `You have ${r.data.remaining} message${r.data.remaining > 1 ? "s" : ""} from family. I'll play it on your screen.` : "No new messages from family right now.");
        if (r.data.remaining) emit("tablet:open");
      } else if (/help|ambulance|i fell|emergency/.test(u)) {
        // Safety goes straight to the deterministic path: no conversation, no LLM.
        emit("tablet:say", utterance);
        await reply("I'm alerting your family now. If you are in danger, call 112.");
      } else if (/remind|reminder/.test(u)) {
        const r = await callTool<{ reminders: { text: string }[] }>("get_reminders", { window: "today" });
        const list = r.data.reminders?.map((x) => x.text) ?? [];
        await reply(list.length ? `Today: ${list.join(". ")}.` : "No reminders for today.");
      } else {
        await reply(`You can say: talk to ${n.user}, any messages, or what are my reminders.`);
      }
    } catch (e) {
      await reply("Sorry, something went wrong.");
      log({ source: "alexa-sim", dir: "•", title: `error: ${(e as Error).message}`, isError: true });
    } finally {
      setBusy(false);
    }
  };

  const handleRef = useRef(handle);
  handleRef.current = handle;
  useEffect(() => {
    const off = on("alexa:say", (u) => void handleRef.current(u));
    return () => off();
  }, []);

  const mic = async () => {
    unlockAudio();
    if (!canListen) return handle(talkTo);
    setLast("Listening…");
    const text = await listen({ lang: speechLang(n.setup?.elder.language) }).done.catch(() => "");
    if (text) await handle(text);
    else setLast("");
  };

  return (
    <section className="panel alexa" aria-label="Simulated Alexa+ add-on">
      <header className="panel__head">
        <h2>Simulated Alexa+ add-on</h2>
        <span className="muted">real MCP client</span>
      </header>
      <div className={`ring${busy ? " is-busy" : ""}`} aria-hidden />
      <p className="alexa__last" aria-live="polite">{last || `Try: “${talkTo}”`}</p>
      <div className="row row--wrap">
        <button className="btn btn--primary" disabled={busy} onClick={() => (unlockAudio(), void handle(talkTo))}>
          "{talkTo}"
        </button>
        <button className="btn" disabled={busy} onClick={mic}>🎤 Speak</button>
      </div>
      <form
        className="typebox"
        onSubmit={(e) => {
          e.preventDefault();
          unlockAudio();
          void handle(typed);
          setTyped("");
        }}
      >
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Any messages for me?" aria-label="Say something to the simulator" maxLength={200} />
        <button className="btn" disabled={busy || !typed.trim()}>Send</button>
      </form>
    </section>
  );
}
