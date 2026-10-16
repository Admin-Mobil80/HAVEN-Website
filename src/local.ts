import { randomBytes } from "node:crypto";
import path from "node:path";
import { createApp } from "./app.js";
import { SimulatedNotifier } from "./notify/index.js";
import { MemoryRepo } from "./store/memoryRepo.js";
import { speak } from "./voice/polly.js";

// No-keys local run: in-memory store, simulated notifications, rules brain, browser speech.
// Opt in to AWS with HAVEN_BRAIN=bedrock and/or HAVEN_SPEECH=polly (uses your AWS credentials).
const port = Number(process.env.PORT ?? 3000);

let secret = process.env.HOUSEHOLD_SECRET;
if (!secret) {
  secret = randomBytes(32).toString("base64url");
  console.warn("HOUSEHOLD_SECRET is not set: using a random dev secret, so household tokens stop working after a restart.");
}

const app = createApp({
  repo: new MemoryRepo(),
  notifier: new SimulatedNotifier(),
  householdSecret: secret,
  allowedHosts: [`localhost:${port}`, `127.0.0.1:${port}`],
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  webDir: path.resolve(process.env.WEB_DIR ?? "web/dist"),
  brain: process.env.HAVEN_BRAIN === "bedrock" ? "bedrock" : "rules",
  speak: process.env.HAVEN_SPEECH === "polly" ? (text) => speak(text) : undefined,
});

// Loopback only: the Host allowlist is not a substitute for keeping the dev server off the LAN.
app.listen(port, "127.0.0.1", (err?: Error) => {
  if (err) throw err;
  console.log(`Haven listening on http://localhost:${port} (MCP endpoint: http://localhost:${port}/mcp)`);
});
