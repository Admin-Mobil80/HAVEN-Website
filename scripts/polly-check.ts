// Pre-flight check of Amazon Polly for the Digital Priya voice, run against the real service:
//   npm run polly-check            (uses AWS_PROFILE / AWS_REGION, default region ap-south-1)
// Prints a PASS/WARN/FAIL table to paste into docs/DECISIONS.md. Exit codes: 0 = no FAIL,
// 1 = at least one FAIL, 2 = no AWS credentials.
import {
  DescribeVoicesCommand,
  PollyClient,
  SynthesizeSpeechCommand,
  type LanguageCode,
  type Voice,
  type VoiceId,
} from "@aws-sdk/client-polly";
import { parseMarks, toSsml, voiceNote } from "../src/voice/polly.js";
import { toMouthTimeline, type SpeechMark } from "../src/voice/visemes.js";

const region = process.env.AWS_REGION ?? "ap-south-1";
const voiceId = process.env.POLLY_VOICE_PRIYA ?? "Kajal";
const client = new PollyClient({ region, maxAttempts: 2 });

type Status = "PASS" | "WARN" | "FAIL";
const results: { check: string; status: Status; detail: string }[] = [];
const record = (check: string, status: Status, detail: string) => {
  results.push({ check, status, detail });
  console.log(`  ${status.padEnd(4)} ${check}: ${detail}`);
};

// Below this the avatar's mouth visibly lags the audio; switch to the loudness fallback
// described in src/voice/visemes.ts. Conversational speech is ~10-14 phonemes per second.
const DENSITY_PASS = 8;
const DENSITY_WARN = 5;
const OGG_MAX_BYTES = 512 * 1024;

const LINES = {
  english: "Good morning Amma, did you sleep well? Tell me about the temple, and did Saroja sing with you today?",
  hinglish: "Achha Amma, aaj aapne khana khaya? Saroja aunty ke saath mandir gayi thi na, kaisa laga?",
  devanagari: "अम्मा, आज आपने खाना खाया? सरोजा आंटी के साथ मंदिर गई थीं, कैसा लगा?",
};

// Roughly 45 s at Kajal's 90% rate. Synthetic content.
const LONG_NOTE =
  "Hi Priya, this is today's note from Haven, the AI companion. Amma had a good morning. " +
  "She went to the temple with Saroja, her old friend from the music class, and they sang two songs together after the evening prayer. " +
  "She said her knee was a little stiff after physio, but the new exercises are getting easier. " +
  "She ate idli for breakfast and rice with sambar for lunch, and she watered the jasmine plant, which has finally bloomed. " +
  "She asked whether you are coming home for Diwali. I told her that question is for you, so she is waiting to hear it from you directly. " +
  "She also mentioned Lalitha called from Mysuru on Sunday and they talked for almost an hour. " +
  "If you have a few minutes this evening, a short call would make her very happy. That is all for today.";

async function haveCredentials() {
  try {
    const creds = await client.config.credentials();
    return Boolean(creds?.accessKeyId);
  } catch {
    return false;
  }
}

async function synthMarks(text: string, languageCode: string, ratePercent: number): Promise<SpeechMark[]> {
  const { ssml, byteAt } = toSsml(text, ratePercent);
  const out = await client.send(
    new SynthesizeSpeechCommand({
      Engine: "neural",
      VoiceId: voiceId as VoiceId,
      LanguageCode: languageCode as LanguageCode,
      Text: ssml,
      TextType: "ssml",
      OutputFormat: "json",
      SpeechMarkTypes: ["viseme", "word"],
    }),
  );
  if (!out.AudioStream) throw new Error("empty speech-mark stream");
  return parseMarks(Buffer.from(await out.AudioStream.transformToByteArray()).toString("utf8"), byteAt);
}

// The last mark is close to the end of speech; good enough for a density estimate.
const spokenMs = (marks: SpeechMark[]) => Math.max(0, ...marks.map((m) => m.time));

const errText = (err: unknown) => {
  const e = err as { name?: string; message?: string };
  return `${e?.name ?? "Error"}: ${e?.message ?? String(err)}`.slice(0, 160);
};

async function checkVisemeDensity() {
  console.log(`\n(1) ${voiceId} neural viseme density`);
  for (const languageCode of ["en-IN", "hi-IN"]) {
    for (const [name, text] of Object.entries(LINES)) {
      const label = `viseme density ${languageCode} ${name}`;
      try {
        const marks = await synthMarks(text, languageCode, 90);
        const visemes = marks.filter((m) => m.type === "viseme" && m.value !== "sil");
        const words = marks.filter((m) => m.type === "word").length;
        const seconds = spokenMs(marks) / 1000;
        if (!visemes.length || seconds <= 0) {
          record(label, "FAIL", `no visemes returned (${words} word marks)`);
          continue;
        }
        const perSecond = visemes.length / seconds;
        const timeline = toMouthTimeline(marks);
        const shapes = new Set(timeline.map((x) => x.mouth)).size;
        const changesPerSecond = (timeline.length - 1) / seconds;
        const status: Status = perSecond >= DENSITY_PASS && shapes >= 4 ? "PASS" : perSecond >= DENSITY_WARN ? "WARN" : "FAIL";
        record(
          label,
          status,
          `${perSecond.toFixed(1)} visemes/s, ${changesPerSecond.toFixed(1)} mouth changes/s, ${shapes}/5 mouth shapes, ${words} words in ${seconds.toFixed(1)} s`,
        );
      } catch (err) {
        record(label, "FAIL", errText(err));
      }
    }
  }
}

async function checkProsodyRate() {
  console.log(`\n(2) SSML <prosody rate="90%"> on ${voiceId} neural`);
  const label = "prosody rate 90% accepted and applied";
  try {
    const slow = spokenMs(await synthMarks(LINES.english, "en-IN", 90));
    const normal = spokenMs(await synthMarks(LINES.english, "en-IN", 100));
    const ratio = normal > 0 ? slow / normal : 0;
    // 90% speed should stretch the line by ~11%. Neural voices may accept the tag but ignore it.
    const status: Status = ratio >= 1.05 ? "PASS" : "WARN";
    record(label, status, `90% = ${slow} ms, 100% = ${normal} ms, ratio ${ratio.toFixed(2)}${status === "WARN" ? " (accepted but no audible slow-down)" : ""}`);
  } catch (err) {
    record(label, "FAIL", `rejected: ${errText(err)}`);
  }
}

// Ogg page header: "OggS", version, type, then a 64-bit granule position (48 kHz samples for Opus).
function inspectOgg(buf: Buffer) {
  if (buf.subarray(0, 4).toString("latin1") !== "OggS") throw new Error("not an Ogg stream");
  const head = buf.indexOf("OpusHead", 0, "latin1");
  if (head < 0) throw new Error("no OpusHead packet");
  const channels = buf[head + 9];
  const preSkip = buf.readUInt16LE(head + 10);
  const inputRate = buf.readUInt32LE(head + 12);
  const lastPage = buf.lastIndexOf("OggS", buf.length - 1, "latin1");
  const granule = lastPage >= 0 && lastPage + 14 <= buf.length ? Number(buf.readBigInt64LE(lastPage + 6)) : NaN;
  const seconds = Number.isFinite(granule) && granule > 0 ? (granule - preSkip) / 48000 : NaN;
  return { channels, inputRate, seconds };
}

async function checkVoiceNote() {
  console.log("\n(3) ~45 s ogg_opus 48 kHz voice note");
  const label = "45 s ogg_opus is mono and <= 512 KB";
  try {
    const audio = await voiceNote(LONG_NOTE, { client, voiceId, languageCode: "en-IN" });
    const { channels, inputRate, seconds } = inspectOgg(audio);
    const kb = audio.length / 1024;
    const ok = channels === 1 && audio.length <= OGG_MAX_BYTES;
    record(
      label,
      ok ? "PASS" : "FAIL",
      `${audio.length} bytes (${kb.toFixed(0)} KB), ${channels} channel(s), input rate ${inputRate} Hz, ${Number.isFinite(seconds) ? `${seconds.toFixed(1)} s` : "duration unknown"}`,
    );
    if (Number.isFinite(seconds) && (seconds < 35 || seconds > 60)) {
      record("voice note sample length", "WARN", `sample text gave ${seconds.toFixed(1)} s, not ~45 s; adjust LONG_NOTE and rerun for a fair size check`);
    }
  } catch (err) {
    record(label, "FAIL", errText(err));
  }
}

async function describeNeural(languageCode: string) {
  const voices: Voice[] = [];
  let NextToken: string | undefined;
  do {
    const out = await client.send(
      new DescribeVoicesCommand({ Engine: "neural", LanguageCode: languageCode as LanguageCode, IncludeAdditionalLanguageCodes: true, NextToken }),
    );
    voices.push(...(out.Voices ?? []));
    NextToken = out.NextToken;
  } while (NextToken);
  return voices;
}

async function checkVoices() {
  console.log(`\n(4) Neural voices in ${region}`);
  const byLang: Record<string, Voice[]> = {};
  for (const lang of ["en-GB", "en-US", "en-IN"]) {
    try {
      byLang[lang] = await describeNeural(lang);
      const list = byLang[lang].map((v) => `${v.Id}(${v.Gender?.[0] ?? "?"})`).join(", ") || "none";
      console.log(`  ${lang}: ${list}`);
    } catch (err) {
      record(`DescribeVoices ${lang}`, "FAIL", errText(err));
    }
  }

  const priya = (byLang["en-IN"] ?? []).find((v) => v.Id === voiceId);
  record(
    `${voiceId} neural available`,
    priya ? "PASS" : "FAIL",
    priya ? `languages ${[priya.LanguageCode, ...(priya.AdditionalLanguageCodes ?? [])].join(", ")}` : `not listed for en-IN neural in ${region}`,
  );

  const males = ["en-GB", "en-US"].flatMap((lang) =>
    (byLang[lang] ?? []).filter((v) => v.Gender === "Male").map((v) => ({ lang, id: v.Id ?? "?" })),
  );
  if (!males.length) {
    record("male en-GB/en-US neural system voice", "FAIL", "none available");
    return;
  }
  const pick = males.find((m) => m.lang === "en-GB") ?? males[0];
  record(
    "male en-GB/en-US neural system voice",
    "PASS",
    `available: ${males.map((m) => `${m.id} (${m.lang})`).join(", ")}; suggested POLLY_VOICE_SYSTEM=${pick.id} (listen before deciding)`,
  );
}

async function main() {
  console.log(`Polly check: region ${region}, voice ${voiceId}, ${new Date().toISOString()}`);
  if (!(await haveCredentials())) {
    console.error(
      `\nNo AWS credentials found. Sign in first (for example: aws sso login --profile haven), then run\n` +
        `  AWS_PROFILE=haven AWS_REGION=${region} npm run polly-check\n` +
        `or set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env. Nothing was sent to AWS.`,
    );
    process.exit(2);
  }

  await checkVisemeDensity();
  await checkProsodyRate();
  await checkVoiceNote();
  await checkVoices();

  const fails = results.filter((r) => r.status === "FAIL").length;
  const warns = results.filter((r) => r.status === "WARN").length;
  const cell = (s: string) => s.replace(/\|/g, "\\|");
  console.log(`\n### Polly check (${region}, ${voiceId} neural, ${new Date().toISOString().slice(0, 10)})\n`);
  console.log("| Check | Result | Detail |\n|---|---|---|");
  for (const r of results) console.log(`| ${cell(r.check)} | ${r.status} | ${cell(r.detail)} |`);
  console.log(
    `\nThresholds: viseme PASS >= ${DENSITY_PASS}/s with >= 4 mouth shapes, WARN >= ${DENSITY_WARN}/s, else use the loudness fallback. ` +
      `Overall: ${fails ? `FAIL (${fails} failing, ${warns} warnings)` : warns ? `PASS with ${warns} warning(s)` : "PASS"}`,
  );
  process.exit(fails ? 1 : 0);
}

main().catch((err) => {
  console.error(`polly-check crashed: ${errText(err)}`);
  process.exit(1);
});
