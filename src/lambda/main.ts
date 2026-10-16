import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.js";
import { SimulatedNotifier, type Notifier } from "../notify/index.js";
import { WhatsAppNotifier } from "../notify/whatsapp.js";
import { WhatsAppClient } from "../notify/whatsappClient.js";
import { S3MediaStore } from "../store/s3Media.js";
import { DynamoRepo } from "../store/dynamoRepo.js";
import { speak, voiceNote } from "../voice/polly.js";

// Production entry, bundled to build/lambda/index.mjs and started by run.sh. The Lambda Web Adapter
// waits for GET /api/health on this port, then proxies every request (and POSTs non-HTTP events to
// /events). Must match AWS_LWA_PORT in infra/lib/haven-stack.ts.
const PORT = Number(process.env.AWS_LWA_PORT ?? 3000);
const REGION = process.env.AWS_REGION ?? "ap-south-1";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// The household-token signing secret lives in SSM (created by hand, see docs/DEPLOY.md), never in
// the template or the bundle. HOUSEHOLD_SECRET in the environment wins, for local runs of the bundle.
async function loadHouseholdSecret(): Promise<string> {
  let secret = process.env.HOUSEHOLD_SECRET?.trim();
  if (!secret) {
    const name = `${process.env.SSM_PREFIX ?? "/haven/"}household-secret`;
    const out = await new SSMClient({ region: REGION }).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    secret = out.Parameter?.Value?.trim();
    if (!secret) throw new Error(`SSM parameter ${name} is empty`);
  }
  if (secret.length < 32) throw new Error("household secret must be at least 32 characters");
  return secret;
}

const ssm = new SSMClient({ region: REGION });
const prefix = process.env.SSM_PREFIX ?? "/haven/";

// Optional secrets: a missing parameter turns the feature off instead of failing startup.
async function optionalSecret(name: string): Promise<string | undefined> {
  try {
    const out = await ssm.send(new GetParameterCommand({ Name: `${prefix}${name}`, WithDecryption: true }));
    return out.Parameter?.Value?.trim() || undefined;
  } catch (err) {
    if ((err as { name?: string }).name === "ParameterNotFound") return undefined;
    throw err;
  }
}

// WhatsApp is on when the token, app secret, verify token and phone number id are all present.
// Real sends only for WA_LIVE_HOUSEHOLDS (default: the owner household); demo households stay simulated.
async function createWhatsApp() {
  const [token, appSecret, verifyToken] = await Promise.all([optionalSecret("wa-token"), optionalSecret("wa-app-secret"), optionalSecret("wa-verify-token")]);
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID?.trim();
  if (!token || !appSecret || !verifyToken || !phoneNumberId) {
    console.warn(JSON.stringify({ msg: "whatsapp_disabled", missing: { token: !token, appSecret: !appSecret, verifyToken: !verifyToken, phoneNumberId: !phoneNumberId } }));
    return undefined;
  }
  const client = new WhatsAppClient({ token, phoneNumberId, graphVersion: process.env.WA_GRAPH_VERSION?.trim() || undefined });
  const live = new Set(list(process.env.WA_LIVE_HOUSEHOLDS ?? "owner"));
  return { client, appSecret, verifyToken, notifier: new WhatsAppNotifier(client, (hh) => live.has(hh)) as Notifier };
}

// Bundled next to index.mjs by scripts/build-lambda.mjs when web/dist exists.
function webDir(): string | undefined {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "web");
  return existsSync(dir) ? dir : undefined;
}

async function main() {
  const [householdSecret, whatsapp, adminKey] = await Promise.all([loadHouseholdSecret(), createWhatsApp(), optionalSecret("admin-key")]);
  const media = new S3MediaStore(requireEnv("MEDIA_BUCKET"));
  const app = createApp({
    repo: new DynamoRepo({ tableName: requireEnv("TABLE_NAME") }),
    notifier: whatsapp?.notifier ?? new SimulatedNotifier(),
    householdSecret,
    mediaStore: media,
    whatsapp: whatsapp && { client: whatsapp.client, appSecret: whatsapp.appSecret, verifyToken: whatsapp.verifyToken, media, voiceNote: (text) => voiceNote(text) },
    adminKey,
    publicDemoId: process.env.PUBLIC_DEMO_ID?.trim() || undefined,
    // The adapter's readiness check calls 127.0.0.1 directly; real traffic arrives with the
    // Function URL host, which is unknown at synth time (it would be a circular reference).
    allowedHosts: [`localhost:${PORT}`, `127.0.0.1:${PORT}`],
    allowedHostSuffixes: [`.lambda-url.${REGION}.on.aws`],
    allowedOrigins: list(process.env.ALLOWED_ORIGINS),
    webDir: webDir(),
    // Hosted: Bedrock brain (rules brain on failure or past the daily cap) and Polly speech.
    brain: process.env.HAVEN_BRAIN === "rules" ? "rules" : "bedrock",
    speak: process.env.HAVEN_SPEECH === "off" ? undefined : (text) => speak(text),
    dailyBrainCap: Number(process.env.DAILY_BRAIN_CAP) || undefined,
  });

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, "127.0.0.1", (err?: Error) => (err ? reject(err) : resolve()));
    server.on("error", reject);
  });
  console.log(JSON.stringify({ msg: "haven_listening", port: PORT, region: REGION }));
}

main().catch((err: unknown) => {
  console.error(JSON.stringify({ msg: "haven_startup_failed", error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
