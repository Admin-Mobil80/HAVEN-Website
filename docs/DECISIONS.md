# Decisions log

Newest first. Each entry gives the date, the decision, why, and the evidence.

## 15 Oct 2026: build plan locked
- **Builder:** one person plus Claude Code. Feature freeze Wed 21 Oct 12:00 IST; internal submit Fri 23 Oct 18:00 IST.
- **Track:** Alexa+ via Path B. That means a real MCP server (spec 2025-11-25, Streamable HTTP, stateless JSON responses) plus a simulated Alexa+ web client that is itself a real MCP client. Mini challenge: AWS Builder.
- **Digital Priya:**
  - A stylised SVG avatar based on a consenting performer's photo, always labelled "Digital Priya · AI".
  - Voice: Polly Kajal neural, with lip-sync from viseme speech marks.
  - No voice cloning, no photo-real avatar. Anam has been removed.
  - Priya is heard in her own voice only through her real recordings.
- **WhatsApp:** the Meta Cloud API test number, for notifications only (digest, voice note, urgent alert). The family dashboard mirrors everything.
- **Region:** ap-south-1 for everything.
- **Model order** (changed 16 Oct; see the bake-off entry): `openai.gpt-oss-120b-1:0` (in-region, no Marketplace), then `apac.amazon.nova-lite-v1:0`, then the deterministic rules brain. Claude is not used at runtime, because Indian AWS accounts hit Marketplace payment failures.
- **Hosting:** one Lambda (Express on the Lambda Web Adapter) behind a Function URL, CDK in TypeScript, DynamoDB single table, S3 media, and EventBridge Scheduler.
- **Safety:** deterministic rules open incidents with no LLM involved. Urgent alerts are awaited before the response. Only a human can cancel, acknowledge or close an incident.

## 16 Oct 2026: WhatsApp verified end to end on a real phone (owner household)
- **Setup:**
  - The Haven app (1802222657589249) is subscribed to the test WABA via `POST /{waba}/subscribed_apps`.
  - Its webhook is active with `messages`; there is no override URL.
  - The Sportzlytics app is also subscribed to that WABA and gets copies, which is harmless.
- **Inbound:** "hi" from Priya's phone reaches the webhook, is stored as a message, and Haven replies.
- **Urgent alert:**
  - "Help, I feel dizzy" on the tablet sends a real WhatsApp alert in 1.6 s; Ravi has no phone, so his copy is simulated.
  - Tapping **Calling now** on the alert acknowledges the incident (ackBy priya, 2 min after opening), logs a real call prompted by Haven (calls this week: 1, goal 4, baseline 1) and sends a confirmation reply.

## 16 Oct 2026: conversation engine (`POST /api/turn`)
- **Pipeline order:**
  1. The host writes the elder's turn.
  2. Safety rules, which can raise an incident without the LLM.
  3. A scripted "are you real?" answer.
  4. Yes/no matching for a pending send.
  5. The commitment detector, which creates a deferral.
  6. The Bedrock brain, with the rules brain as fallback (on failure or past 300 turns per household per day).
  7. The output guard.
  8. MCP tool calls.
  9. Polly mp3 with visemes.
- **Change from the plan:** the engine calls the MCP server through an **in-process MCP client** over an in-memory transport, not HTTP loopback. It is the same JSON-RPC, tools and consent checks, with no port dependency and no rate-limit hit.
- **Sends need an explicit ask:** a brain-proposed send to Priya only starts when the elder explicitly asked ("tell Priya ..."). Even then it becomes a "Shall I send this?" question, and nothing goes out until her spoken yes.
- **Live run on the hosted URL** (gpt-oss-120b, Kajal), every turn with audio and visemes:

  | Turn | Time |
  |---|---|
  | Greeting | 0.70 s |
  | Small talk | 1.2 s |
  | Remember | 1.9 s |
  | Send preview | 2.3 s |
  | Consent send | 0.37 s |
  | Deferral | 0.85 s |
  | Honesty | 0.63 s |
  | Urgent alert | 0.48 s |
- **Local runs:** default to the rules brain and browser speech. Opt in with `HAVEN_BRAIN=bedrock` and `HAVEN_SPEECH=polly`.

## 16 Oct 2026: first deploy of HavenStack (ap-south-1)
- Function URL: https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/ (MCP endpoint at `/mcp`).
- Deploy took 63 s. Lambda Web Adapter pinned to arm64 layer v30.
- Smoke test passed:
  - `/api/health` returns 200.
  - `initialize` echoes 2025-11-25; `tools/list` lists 8 tools.
  - `recall_memory` and `create_deferral` read and write DynamoDB.
  - Demo session returns 201.
  - GET `/mcp` returns 405; a foreign Origin returns 403.
- Known gaps:
  - No alert email is set yet (the alarms and budget notify nobody).
  - `/events` is not built, so the Scheduler's warm, digest and reset calls do nothing yet.
  - The WhatsApp notifier is still simulated.

## 16 Oct 2026: WhatsApp templates submitted (test number)
- Templates submitted, each returned PENDING / UTILITY:
  - `haven_daily_digest` (id 1951027502537585)
  - `haven_urgent_alert` (id 1697051121783562)
  - `haven_family_question` (id 867923293013396)
- Quick-reply labels the webhook must match exactly: "Play voice note", "I will call tonight", "Calling now".
- They were submitted with the temporary token from the "Try it out" page.
- **16 Oct update:** all three are now **APPROVED**.
  - `/haven/wa-token` now holds the permanent system-user token for `haven-bot` (Employee access, with Full access to the Haven app and the Test WhatsApp Business Account).
  - The earlier stored token was a user token, and Meta invalidated it after a password change (error 190/460).

## 16 Oct 2026: model bake-off (`npm run bakeoff`, profile `haven`, ap-south-1)
| Model | Correct /15 | p50 | p95 | Errors |
|---|---|---|---|---|
| global.amazon.nova-2-lite-v1:0 | 13 | 1.10 s | 1.26 s | 0 |
| apac.amazon.nova-lite-v1:0 | 13 | 0.76 s | 0.93 s | 0 |
| openai.gpt-oss-120b-1:0 | 14 | 0.83 s | 2.00 s | 0 |

**Chosen:** `openai.gpt-oss-120b-1:0` as primary and `apac.amazon.nova-lite-v1:0` as fallback. This changes the original plan, which had Nova 2 Lite as primary.
- gpt-oss scored best.
- It runs in-region in Mumbai, so the model never processes data outside India.
- Nova 2 Lite is only reachable through the Global profile, which can route data out of India.
- Nova Lite stays as the Amazon-model fallback for the AWS Builder story.

**Prompt issues to fix in `persona.ts` / `scripts/eval.ts`** (seen across all three models):
- `send_to_priya` fires without an explicit request: "Nobody visits me" auto-drafts a message, and a goodbye repeats an earlier send.
- Invented facts about Priya ("her new job is going well", "She loves it").
- The model announces a send ("I'll tell Priya right away") before consent. The server-side two-phase consent still blocks the actual send.
- The `private` flag is sometimes dropped for "Don't tell Priya". The server backstop catches it.

## 16 Oct 2026: Polly check (`npm run polly-check`, ap-south-1): all PASS
- Kajal neural viseme density: 8.2 to 9.9 visemes per second, using all 5 mouth shapes. This holds for en-IN and hi-IN, and for English, Hinglish and Devanagari text. Viseme lip-sync works; the loudness fallback is not needed.
- SSML `prosody rate="90%"` is applied (the speech is 1.09 times longer).
- A 48.7-second ogg_opus voice note is 142 KB, mono, 48 kHz. That is under WhatsApp's 512 KB inline-play limit.
- System voice candidates (neural male): Brian and Arthur (en-GB); Gregory, Kevin, Matthew, Justin, Joey and Stephen (en-US). Default `POLLY_VOICE_SYSTEM=Brian`; listen before the video.

## 16 Oct 2026: first live AWS run blocked by IAM
**Resolved:** the project now uses the AWS profile `haven` (a separate account). The details below are kept for the record.

In ap-south-1, the first AWS identity tried (a different account, not used for Haven) got AccessDenied on:
- `polly:SynthesizeSpeech` and `polly:DescribeVoices`;
- `bedrock:InvokeModel` (`openai.gpt-oss-120b-1:0`);
- `iam:List*`.

The Polly check and the bake-off are rerun after the user gets the Haven developer permissions (`docs/iam-haven-dev-policy.json`).

## Demo start, avatar mood and avatar cost (20 Oct)
- **Two ways to start.** "Start demo" builds a fictional household in one click: Daniel (son) and his mother Mary ("Mom") in Seattle, in US English. Alexa+ does not support Indian languages yet, and the judges are mostly outside India. Its face is an Anam stock avatar ("Daniel", picked over the widely used first-page avatars) and its voice an ElevenLabs premade voice ("Chris"), so no real person's likeness is used and no voice slot is taken. "Create your own" takes the user's names, then their photo and voice.
- **A warmer face.** Each Anam session starts with Director Notes `presetStyle: "warm"`, expressivity 0.65. Each reply also sends a mood cue: "happy" for greetings and goodbyes, "concerned" for safety replies, "warm" otherwise. The source photo still matters most: a soft smile in the photo gives a smiling avatar.
- **The live face only while speaking.** The tablet starts the Anam session when a turn begins, so it connects while the person talks and Haven thinks. The video shows only while the reply plays, and the session closes 4 s later. In between, the tablet shows the still photo. If the live face fails, the same voice plays through the speaker with the illustrated avatar.
- **Limits.** Anam sessions are capped at 300 per household per day and 15 minutes each. ElevenLabs Starter has 10 voice slots, so library voices already in the account are reused rather than added again. Before a new demo clone, the oldest demo clones are deleted so that at most 5 remain. The owner's own clone is never deleted this way.

## Voice ID enrolment (22 Oct)
Setup collects a consented voice note of the person Haven is for. It is stored at `voice-id/sample.*` in the media store, and only Setup can play it back; the tablet and the family view never receive it. It is enrolment only for now. Speaker verification and a "soft gate" come after the hackathon:
- safety always runs;
- anything personal or any send is shared only with the recognised voice.

Alexa+ add-ons don't receive the recognised speaker (friction log #17), so Alexa's own Voice ID can't be used yet.

## Pending: AWS account checks
- Classic account or "new sign-up" (new sign-up blocks Global inference profiles and Transcribe): _tbd_
- Lambda ConcurrentExecutions quota in ap-south-1: _tbd_
- Budgets alerts at $25 and $50: _tbd_
