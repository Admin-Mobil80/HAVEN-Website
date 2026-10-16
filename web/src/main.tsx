import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ensureToken } from "./lib/api";
import { McpLog } from "./components/McpLog";
import { Family } from "./screens/Family";
import { Judge } from "./screens/Judge";
import { Setup } from "./screens/Setup";
import { Tablet } from "./screens/Tablet";
import "./styles.css";

// Routes: "/" judge demo; "/tablet", "/family", "/setup" for a single device. The real household's
// links carry its token in the hash (#t=...), which never reaches the server's access logs.
function App() {
  const [ready, setReady] = useState<"wait" | "ok" | string>("wait");
  useEffect(() => {
    ensureToken().then(() => setReady("ok"), (e: Error) => setReady(e.message));
  }, []);
  if (ready === "wait") return <p className="splash">Starting Haven…</p>;
  if (ready !== "ok") return <p className="splash error">{ready}</p>;

  const path = location.pathname.replace(/\/+$/, "");
  if (path === "/tablet") return <div className="single"><Tablet /><McpLog /></div>;
  if (path === "/family") return <div className="single single--phone"><Family /></div>;
  if (path === "/setup") return <div className="single"><Setup /></div>;
  return <Judge />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
