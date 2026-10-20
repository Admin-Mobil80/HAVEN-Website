import { useEffect, useRef, useState } from "react";
import { on, type LogItem } from "../lib/bus";
import { Icon } from "./Icon";

const LABEL: Record<LogItem["source"], string> = {
  "alexa-sim": "Alexa+ sim",
  tablet: "tablet",
  agent: "Haven agent",
  rule: "safety rule",
  webhook: "WhatsApp",
  external: "external",
  family: "family",
};

// Live MCP activity: the simulator's own JSON-RPC, the agent's tool calls from each turn, and
// rule events (which never involve the LLM).
export function McpLog() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const off = on("log", (item) => setItems((xs) => [...xs.slice(-199), item]));
    return () => off();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [items.length]);

  return (
    <section className="panel log" aria-label="MCP activity log">
      <header className="panel__head">
        <div>
          <h2><Icon name="terminal" />MCP activity</h2>
          <span className="muted">spec 2025-11-25 · Streamable HTTP</span>
        </div>
      </header>
      <div className="log__body" role="log" aria-live="polite">
        {items.length === 0 && <p className="muted">Start with "Alexa, talk to …" to see the MCP calls.</p>}
        {items.map((it, i) => (
          <div key={i} className={`log__row log__row--${it.source}${it.isError ? " log__row--error" : ""}`}>
            <button className="log__line" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <span className="log__time">{it.at.slice(11, 19)}</span>
              <span className="log__src">[{LABEL[it.source]}]</span>
              <span className="log__dir">{it.dir}</span>
              <span className="log__title">{it.title}</span>
            </button>
            {open === i && it.detail && <pre className="log__detail">{it.detail}</pre>}
          </div>
        ))}
        <div ref={end} />
      </div>
    </section>
  );
}
