import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.js";
import { SimulatedNotifier, type Notifier } from "../notify/index.js";
import { DynamoRepo } from "../store/dynamoRepo.js";
import { speak } from "../voice/polly.js";

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

// Seam for the WhatsApp channel: construct it here from the SSM parameters wa-token and
// wa-app-secret. Until then nothing leaves the process and the dashboard shows "simulated".
async function createNotifier(): Promise<Notifier> {
  return new SimulatedNotifier();
}

// Bundled next to index.mjs by scripts/build-lambda.mjs when web/dist exists.
function webDir(): string | undefined {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "web");
  return existsSync(dir) ? dir : undefined;
}

async function main() {
  const app = createApp({
    repo: new DynamoRepo({ tableName: requireEnv("TABLE_NAME") }),
    notifier: await createNotifier(),
    householdSecret: await loadHouseholdSecret(),
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
