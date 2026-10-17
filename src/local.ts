import { randomBytes } from "node:crypto";
import path from "node:path";
import { createApp } from "./app.js";
import { SimulatedNotifier } from "./notify/index.js";
import { MemoryRepo } from "./store/memoryRepo.js";
import { pcm16, speak } from "./voice/polly.js";
import { ElevenLabs } from "./voice/eleven.js";
import { Anam } from "./voice/anam.js";
import { fallbackDigest } from "./agent/digest.js";

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
  // Locally the digest uses the rules writer unless Bedrock is on; no media store, so no audio.
  digest: process.env.HAVEN_BRAIN === "bedrock" ? {} : { write: async (facts) => fallbackDigest(facts) },
  // Optional: ELEVENLABS_API_KEY / ANAM_API_KEY in .env turn on custom voices and the photo avatar.
  likeness: {
    eleven: async () => (process.env.ELEVENLABS_API_KEY ? new ElevenLabs(process.env.ELEVENLABS_API_KEY) : undefined),
    anam: async () => (process.env.ANAM_API_KEY ? new Anam(process.env.ANAM_API_KEY) : undefined),
    pollyPcm: process.env.HAVEN_SPEECH === "polly" ? (text) => pcm16(text) : undefined,
  },
});

// Loopback only: the Host allowlist is not a substitute for keeping the dev server off the LAN.
app.listen(port, "127.0.0.1", (err?: Error) => {
  if (err) throw err;
  console.log(`Haven listening on http://localhost:${port} (MCP endpoint: http://localhost:${port}/mcp)`);
});
