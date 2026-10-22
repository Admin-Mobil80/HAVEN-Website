# Friction log

Each entry has the six fields the hackathon asks for: task, steps, expected vs actual, severity (blocker / major / minor), workaround, and suggestion. Entries are in the order we hit them. Dates and evidence are in [docs/DECISIONS.md](docs/DECISIONS.md) and the commit history.

## 1. Alexa+ MCP toolkit not available to entrants
- **Task:** Deploy the MCP server as a real Alexa+ add-on.
- **Steps:** Read the dev-setup and quickstart pages, then looked for the `@alexa-ai/cli` package.
- **Expected vs actual:** Setup pages read as self-serve (free Alexa developer account, Node 24+, `alexa-ai configure`). The docs home and the Devpost FAQ say "select partners only" with no way to apply, and the CLI package returns npm 404.
- **Severity:** blocker for the real path.
- **Workaround:** Built a real MCP server plus a simulated Alexa+ web client.
- **Suggestion:** Put the gating note on every setup page, and document a self-serve sandbox for hackathon entrants.

## 2. Alexa+ auth docs disagree on 401 behaviour
- **Task:** Design the auth layer.
- **Steps:** Read the Alexa+ MCP toolkit quickstart, its authentication and account-linking pages, and the MCP 2025-11-25 authorization spec.
- **Expected vs actual:** The quickstart says return 401 *without* `WWW-Authenticate`; the MCP 2025-11-25 spec expects protected-resource metadata discovery through that header or a well-known URI. The account-linking page calls linking optional while the quickstart checklist reads as unconditional.
- **Severity:** major (unresolved).
- **Workaround:** Path B needs no Alexa auth. Our server returns 401 with `WWW-Authenticate: Bearer error="invalid_token"` for a bad household token, which follows the MCP spec.
- **Suggestion:** State one authoritative flow, and say exactly which discovery paths Alexa+ calls.

## 3. Anam pricing page is internally inconsistent
- **Task:** Work out the free-tier limits.
- **Steps:** Compared the Anam pricing page's plan cards, its comparison table, and the billing-and-limits docs.
- **Expected vs actual:** One page shows 30 free minutes and a 3-minute cap, while the plan card shows 50 minutes and a 5-minute cap. Starter concurrency is 3 on the card and 1 in the table.
- **Severity:** minor.
- **Workaround:** Budgeted for a paid plan and capped usage ourselves: 15-minute sessions, a daily session cap per household, and the face connected only while it speaks.
- **Suggestion:** Generate the card and table from one source.

## 4. Anam webhook tool timeout contradiction
- **Task:** Choose between client tools and webhook tools.
- **Steps:** Read the Anam tools overview, the webhook-tools page and the Terms of Service.
- **Expected vs actual:** The tools overview says 5 s and the webhook-tools page says 60 s. Tool calling is also labelled beta, and the ToS bars publishing details of beta features without consent.
- **Severity:** major.
- **Workaround:** Drive tools from our own backend and avoid beta features in public text.
- **Suggestion:** Document one timeout, and clarify the beta-disclosure clause for hackathon write-ups.

## 5. Anam quickstart puts the API key in browser code
- **Task:** Follow the JS SDK quickstart.
- **Steps:** Followed the quickstart, then read the authentication page.
- **Expected vs actual:** The quickstart shows a key-in-browser pattern and imports `@latest`; the authentication page says to keep the key server-side.
- **Severity:** minor (security footgun).
- **Workaround:** Backend session-token endpoint and a pinned SDK version.
- **Suggestion:** Make the quickstart mint a session token from a tiny backend, and pin a version in the import.

## 6. No Hindi/Tamil TTS voice listing
- **Task:** Pick a voice for Tamil- and Hindi-speaking elders.
- **Steps:** Searched the Anam docs for language and voice listings.
- **Expected vs actual:** The docs list Hindi and Tamil speech recognition but no page lists Hindi or Tamil TTS voices.
- **Severity:** minor.
- **Workaround:** Haven speaks through its own TTS (Polly or ElevenLabs) piped into the avatar, so the avatar's voice list no longer mattered.
- **Suggestion:** Publish a voice list filterable by language, next to the speech-recognition language list.

## 7. Bedrock models disagree on `toolChoice`
- **Task:** Force a structured reply (a `respond` tool) from every model in the Bedrock fallback chain through the Converse API.
- **Steps:** Sent the same Converse request with `toolConfig.toolChoice: {tool: {name: "respond"}}` to `openai.gpt-oss-120b-1:0` and `apac.amazon.nova-lite-v1:0`.
- **Expected vs actual:** One schema should work everywhere, since Converse is meant to be model-agnostic. Instead, some models reject `toolChoice` with a validation error, and some accept it but still answer in plain text.
- **Severity:** major.
- **Workaround:** On a `toolChoice` validation error, retry without it, and remember that model for the life of the warm process ([src/agent/brain.ts](src/agent/brain.ts)). Accept either JSON or plain text as the reply.
- **Suggestion:** Publish a per-model matrix of supported Converse tool features, and return a typed "unsupported parameter" error code instead of a generic validation message.

## 8. Claude on Bedrock blocked by Marketplace payment rules for India accounts
- **Task:** Use a Claude model on Bedrock from an India (AISPL) account.
- **Steps:** Read the Bedrock model-access page and AWS's AISPL Marketplace notice, then community reports of `INVALID_PAYMENT_INSTRUMENT` on AISPL accounts.
- **Expected vs actual:** Model access looks like one click. Instead, Anthropic models go through AWS Marketplace, which no longer accepts stored cards for AISPL customers, and community reports show no confirmed fix.
- **Severity:** major (it changed our model plan).
- **Workaround:** Designed around non-Marketplace models: `openai.gpt-oss-120b-1:0` (in-region) as primary and `apac.amazon.nova-lite-v1:0` as fallback, chosen by a bake-off. Claude is not used at runtime.
- **Suggestion:** Show the AISPL restriction on the Bedrock model-access page itself, next to each Marketplace-backed model, with the supported payment route.

## 9. Nova 2 Lite only through a Global inference profile
- **Task:** Use Amazon Nova 2 Lite (the original plan's primary model) while keeping inference in India.
- **Steps:** Ran the model bake-off in ap-south-1 (`npm run bakeoff`).
- **Expected vs actual:** We expected a regional or APAC profile. Nova 2 Lite was only reachable as `global.amazon.nova-2-lite-v1:0`, which can route data outside the region.
- **Severity:** minor.
- **Workaround:** Primary is gpt-oss-120b (in-region), and the fallback is `apac.amazon.nova-lite-v1:0`.
- **Suggestion:** Offer geography-bound (APAC or India) profiles for new Amazon models at launch, or document the timeline.

## 10. First AWS identity got `AccessDenied` with no hint of the missing policy
- **Task:** Run the Polly check and the Bedrock bake-off from the CLI in ap-south-1.
- **Steps:** Ran `npm run polly-check` and `npm run bakeoff` with the default CLI credentials.
- **Expected vs actual:** Both should run, or fail with an actionable message. They failed with `AccessDenied` on `polly:SynthesizeSpeech`, `polly:DescribeVoices`, `bedrock:InvokeModel` and `iam:List*`. The default CLI profile also pointed at a different account from the one meant for Haven.
- **Severity:** major (it blocked AWS work for part of a day).
- **Workaround:** A dedicated `haven` profile for the right account, with a written least-privilege policy ([docs/iam-haven-dev-policy.json](docs/iam-haven-dev-policy.json)).
- **Suggestion:** Show the account ID and the missing action in the CLI error by default, and add a "policy for this error" link in the console.

## 11. ElevenLabs Free plan blocks library voices and cloning through the API
- **Task:** Let a family pick a library voice, or clone their own voice with consent, for the companion.
- **Steps:**
  1. Listed shared voices (`/v1/shared-voices`).
  2. Added one to the account.
  3. Called TTS with it.
  4. Tried an instant voice clone.
- **Expected vs actual:** Expected that a voice the account could add would also be usable. Adding it succeeded, but TTS with a library voice and instant cloning were both refused with HTTP 402 on the Free plan, so the avatar went silent.
- **Severity:** major.
- **Workaround:**
  - `/api/tts` falls back to Polly when the chosen voice fails.
  - Picking a voice now test-speaks it before saving, so a plan restriction shows up at once.
  - We moved to a paid plan.
  - The demo uses a premade voice, which needs no voice slot.
- **Suggestion:** Refuse the "add library voice" call on plans that cannot use it, and state plan requirements on each API endpoint's reference page.

## 12. ElevenLabs voice slots fill up in a public demo
- **Task:** Let any visitor to the public demo clone a voice.
- **Steps:** Cloned voices for several demo households on the Starter plan (10 voice slots).
- **Expected vs actual:** We expected temporary or auto-expiring clones for demos. Every clone and added library voice takes a permanent slot until deleted by hand.
- **Severity:** minor.
- **Workaround:** Reuse library voices already in the account, and delete the oldest demo clones so at most 5 remain. The owner's own clone is never deleted this way.
- **Suggestion:** Add a TTL or "temporary" flag on instant clones, and a slot-usage field in the voices API.

## 13. Anam avatar creation takes more than 30 s in one synchronous call
- **Task:** Build a custom cara-4 avatar from a family member's photo during setup.
- **Steps:** Uploaded a cropped photo to our Lambda, which called Anam's avatar-creation API and saved the avatar id to the household.
- **Expected vs actual:** Expected a quick response or an async job id. The call took over 30 s, so the Function URL returned 502 at our 30 s Lambda timeout and the avatar was never saved.
- **Severity:** major.
- **Workaround:** Raised the Lambda timeout to 120 s and the Anam client timeout to 60 s ([infra/lib/haven-stack.ts](infra/lib/haven-stack.ts), [src/voice/anam.ts](src/voice/anam.ts)).
- **Suggestion:** Return a job id with a status endpoint or webhook, and document the typical creation time.

## 14. Anam video does not start in a hidden element
- **Task:** Connect the live face while it is invisible (while the elder talks), and reveal it only when it speaks.
- **Steps:** Called `streamToVideoElement()` on a `<video>` that was hidden until the reply.
- **Expected vs actual:** Expected the stream to connect and play when shown. Instead, the first frame never arrived (`VIDEO_PLAY_STARTED` never fired), our 12 s guard timed out, and the tablet fell back to the illustrated avatar.
- **Severity:** major.
- **Workaround:** Keep the `<video>` rendered and mounted at `opacity: 0`, and fade it in while the avatar speaks ([web/src/styles.css](web/src/styles.css), [web/src/screens/Tablet.tsx](web/src/screens/Tablet.tsx)).
- **Suggestion:** Document that the element must be rendered, or emit an explicit error event when playback cannot start.

## 15. Lambda zip pins file dates to 1980, so browsers kept the old app page
- **Task:** Ship a new UI and have judges see it straight after `cdk deploy`.
- **Steps:**
  1. Deployed a new web build.
  2. Reloaded the hosted page.
- **Expected vs actual:** Expected the new page. The deployment zip sets every file's modified time to 1980, so Express sent the same `Last-Modified` (and a matching `ETag`) for the new `index.html`. Browsers revalidated, got 304 and kept the old app shell.
- **Severity:** major (judges could see a stale app).
- **Workaround:** Serve the app shell with `Cache-Control: no-store` and no `ETag` or `Last-Modified`. Hashed asset files are cached as usual ([src/app.ts](src/app.ts)).
- **Suggestion:** Note the fixed mtimes in the Lambda deployment-package docs and in the Lambda Web Adapter README, with the recommended cache headers.

## 16. WhatsApp: tokens and webhook subscription
- **Task:** Send template alerts from the Meta test number and receive quick-reply taps through our webhook.
- **Steps:**
  1. Created templates.
  2. Configured the webhook in the app dashboard.
  3. Sent a message from the elder's phone.
  4. Later changed the account password.
- **Expected vs actual:**
  - Expected the dashboard webhook to receive messages. Nothing arrived until the app was subscribed to the WABA with `POST /{waba}/subscribed_apps`.
  - The stored user token was invalidated by the password change (error 190/460).
- **Severity:** major.
- **Workaround:** Subscribed the app to the WABA through the API, and switched to a permanent system-user token stored in SSM.
- **Suggestion:** Show the WABA subscription status on the webhook settings page, and warn when a user token is stored for server use.

## 17. Alexa+ add-ons can't tell who is speaking (Voice ID)
- **Task:** Make Haven answer only the person it was set up for (Mom), not visitors, children or strangers. That's a security need: the companion knows family messages, reminders and private memories.
- **Steps:**
  - Read the Alexa+ add-on policy and functional requirements, and the MCP toolkit's overview, client lifecycle and authentication pages.
  - Compared them with the classic custom-skill personalisation docs.
- **Expected vs actual:**
  - **Expected:** Classic Alexa skills receive the recognised speaker as `context.System.person.personId` when that person has a Voice ID profile with "Personalize skills" turned on. We expected Alexa+ add-ons to get the same.
  - **Actual:** In the Alexa+ MCP client lifecycle, a tool call carries only `name` and `arguments`. Identity arrives only as an account-linked OAuth user token: it says which household is linked, not who is talking.
  - **Not covered:** We didn't read the Alexa+ account-linking and supported-capabilities pages.
- **Severity:** major. Without it, every add-on that holds personal data must build its own speaker verification, which means storing voiceprints.
- **Workaround:**
  - **What Setup does now:** it collects a consented voice note of the person Haven is for (record it, or upload one, for example from WhatsApp) and stores it privately, ready for speaker verification. It is **not yet used** to decide who Haven answers.
  - **Planned:** an on-device check with an open speaker-embedding model, and a soft gate. Safety rules always run, and "help" from anyone still alerts the family. An unrecognised voice gets a polite reply, but no family messages, reminders or memories, and no sends.
- **Suggestion:** Pass Alexa's existing speaker recognition to add-ons as an opaque per-household person id, with a confidence level, behind the same customer opt-in as classic skills. Then add-ons never need to handle voiceprints at all.
