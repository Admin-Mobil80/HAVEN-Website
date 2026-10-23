# Devpost submission: Haven

The full submission, in the order of the Devpost form. Paste each block into its field. Items marked **TODO** need you before you press **Submit**.

**Deadline:** Fri 23 Oct, 12:00 PM PT (**Sat 24 Oct, 00:30 IST**). Submit early; you can keep editing until the deadline. After it, change nothing (repo, video, page) until winners are announced on 3 Dec.

---

## 1. Project overview

**Project name**

```text
Haven
```

**Elevator pitch** (one line)

```text
Most AI companions want more of your parents' time. Haven wants more of your calls.
```

**Thumbnail:** `reel-studio/out/haven-demo/youtube/thumbnail.jpg` (1280×720).

---

## 2. About the project (Markdown)

Paste everything between the two lines.

---

**Haven is an Alexa+ add-on built as a self-hosted MCP server (spec 2025-11-25, Streamable HTTP, 8 tools) on AWS Lambda.** An older parent says "Alexa, talk to Arjun", and Alexa+ reaches Haven's MCP tools: a clearly labelled AI version of their child keeps them company, while the real family gets what to ask when they call. Our simulated Alexa+ client is a real MCP client: it sends `initialize`, `tools/list` and `tools/call` over Streamable HTTP, and you can watch every message live in the demo.

## Inspiration

Our parents live in other cities. Days go by without a call, and when we do call, it's "Hi, how are you?" "Fine." Then the call ends, and neither side has really said anything.

That is a small sadness for us. For them it can be a health problem:
- Nearly 1 in 5 Indians over 45 report feeling lonely (Longitudinal Ageing Study in India, Wave 1).
- In the US, about 1 in 3 adults aged 50 to 80 feel lonely (University of Michigan National Poll on Healthy Aging, 2024).
- Loneliness is linked to a higher risk of dementia, heart disease, stroke and depression (US Surgeon General's advisory, 2023; WHO Commission on Social Connection, 2025).
- Many older people can't use smartphone apps. Voice works for them.

AI companions are the obvious answer, and a worrying one. A companion that is always available and always agreeable can quietly replace the people it should lead back to.

So we built the opposite: **a companion whose job is to make itself less necessary.** Haven's success metric isn't time spent talking to the AI. It is **real calls per week from family**.

## What it does

A son or daughter sets Haven up for a parent. In our video that's Arjun in London, for his Ma in Kolkata. Ma talks to **Digital Arjun**: a clearly labelled AI version of her son, with his face and voice, made with his consent. It keeps her company, remembers what she shares and plays the messages the real Arjun leaves. It never pretends to be him.

- **She just talks.** "Alexa, talk to Arjun" opens Haven through Alexa+, a tablet or the TV. After that it is hands-free: it listens again after each reply and stops when she goes quiet. There's no app to learn and no buttons.
- **Promises wait for the real person.** "Will you come home for Diwali?" isn't for an AI to answer. Digital Arjun says so, and a deterministic detector files the question for the real Arjun.
- **The family answers in their own voice.** Arjun replies with a voice note from WhatsApp. On Ma's tablet the AI face steps aside, and she hears her real son.
- **Nothing is sent without her yes.** "Tell Arjun the jasmine is blooming" becomes "Shall I send this?", and nothing leaves until she agrees.
- **Safety comes first, with no AI in the loop.** "Help, I feel dizzy" trips fixed safety rules. Arjun gets an urgent **Call now** alert in about a second, and Ma's screen tells her to call 112 if she is in danger.
- **The evening nudge.** Every evening Arjun gets a short update on WhatsApp: how Ma's day went, the stories she told, and **what to ask when you call**. One tap on **Call Ma**, and the call is counted.
- **The metric that matters.** The family chat pins **real calls this week** against a goal, and how many Haven prompted.
- **Honest by design.**
  - An always-on "Digital Arjun · AI" badge.
  - "Are you real?" always gets a fixed answer, never a generated one.
  - Setup records consent for the face, the voice and the daily summary.
- **Voice ID enrolment.** Setup collects a consented voice note of the person Haven is for. That prepares Haven to share personal things only with her (see What's next).

## How we built it

- **MCP at the core.** Haven is a stateless Streamable HTTP MCP server: spec **2025-11-25**, `@modelcontextprotocol/sdk` 1.32.1. It exposes 8 tools: `recall_memory`, `remember`, `play_family_message`, `record_reply`, `create_deferral`, `log_wellbeing`, `get_reminders` and `start_escalation`. Three clients use the same server and the same consent checks:
  - the simulated Alexa+ client in the browser;
  - our conversation engine, through an in-process MCP client;
  - any external client, such as MCP Inspector (shown in the video against the live server).
- **The model proposes; the server decides.** Every turn runs in a fixed order:
  1. deterministic safety rules;
  2. a fixed honesty answer;
  3. a yes/no matcher for a pending send;
  4. the commitment detector;
  5. the LLM;
  6. a deterministic output guard;
  7. MCP tool calls;
  8. speech.
- **AWS, all in ap-south-1 (Mumbai), all in CDK:**
  - **Hosting:** one **Lambda** (Node 22, arm64; Express on the Lambda Web Adapter) behind a **Function URL**. It serves the app, the API and `/mcp` from one origin.
  - **Amazon Bedrock** (Converse API with tool use):
    - The brain is `openai.gpt-oss-120b-1:0`, then `apac.amazon.nova-lite-v1:0`, then a rules-only fallback, so she always gets an answer.
    - Bedrock also writes the evening digest.
    - We chose the models with a 15-case bake-off.
  - **Amazon Polly** provides speech, lip-sync visemes for the illustrated avatar, and voice notes.
  - **DynamoDB** holds state and **S3** holds recordings.
  - **EventBridge Scheduler** runs the 9 pm digest, warm-ups and the nightly demo reset.
  - **SSM** holds secrets, and **CloudWatch** alarms and an **AWS Budget** watch it all.
- **Face and voice.**
  - **Anam** renders the live photo-real face, and **ElevenLabs** provides the voice.
  - Haven decides every word and streams its own audio into the avatar, so the safety pipeline is never bypassed.
  - The face connects only around a reply, to save cost, and falls back to an illustrated avatar if anything fails.
- **WhatsApp Cloud API** carries the real alerts and digests. Its quick-reply buttons ("Calling now", "I will call tonight") come back through a webhook.
- **Web app:** React and Vite, designed with Google Stitch and built by hand, with **Claude Code** as our pair programmer.
- **Tests:** 761 automated tests, all passing.

## Challenges we ran into

- **No Alexa+ toolkit access for entrants.** We built a real, spec-compliant MCP server plus a clearly labelled simulated Alexa+ client, so the integration is real end to end except the last hop.
- **India-specific AWS limits.**
  - Claude on Bedrock goes through Marketplace, whose payment rules block many Indian accounts.
  - Nova 2 Lite was only available through a Global profile.
  - We designed around both with in-region gpt-oss-120b and Nova Lite.
- **Models disagree on forced tool use.** Some Bedrock models reject `toolChoice` and others ignore it. The brain detects which and adapts.
- **An affordable, reliable live face.**
  - Photo avatars take over 30 s to build.
  - Video won't start in a hidden element.
  - Sessions cost by the minute.
  - Our fixes: longer timeouts, a transparent-but-rendered player, and connecting the face only while it speaks.
- **Keeping an LLM honest.** Early runs showed models offering to send messages unprompted, inventing facts about the son, and announcing sends before consent. We moved each of those decisions into deterministic code.
- **Alexa+ can't tell add-ons who is speaking.** Classic skills get a person ID; Alexa+ add-ons don't (friction log #17). So we built Voice ID enrolment now and designed the check for when that signal exists.

Every one of these is in our friction log with steps, expected versus actual, and a suggested fix.

## Accomplishments that we're proud of

- A companion that **measures success by real human contact**, not by time on the app.
- A **real MCP server** that works with a simulated Alexa+ client, our own agent and MCP Inspector alike.
- **Safety that doesn't depend on the model.** Alerts, honesty answers and consent are deterministic. In testing, an urgent alert reached a real phone in 1.6 s.
- A judge-ready demo: one click, a private household per browser tab, no sign-up. You can also create your own family with your own face and voice, with consent.

## What we learned

- The most important moments in an AI companion are the ones where the AI steps aside: making a promise, sending a message, raising an alarm.
- MCP is a clean seam for this: one set of tools and consent rules serves every client.
- Plan limits and regional availability shape the architecture as much as the code does.

## What's next for Haven

- Ship the MCP server as a real **Alexa+ add-on** as soon as access opens.
- **Voice ID: answer only the person it's for.** Check each speaker against the enrolled voice note before sharing anything personal. Alexa's own speaker recognition comes first if Alexa+ passes it to add-ons; an on-device check is the fallback. Safety never depends on it: "help" from anyone still reaches the family.
- A consented pilot with real families, measuring the change in calls per week.
- More languages for the elder; Hindi and Indian English already work in "Create your own".
- Photo sharing from family into the conversation, and clinician-reviewed safety rules.

## About the video

The family is fictional. Arjun's face is a generated photo, turned into a live avatar through the app's own consent flow. Every voice in the demo is synthetic (ElevenLabs), except the two of us in the closing pitch. The demo is a live recording of the hosted app, with one scripted input: Ma's speech-to-text was typed in rather than spoken, because the recording machine's speakers and microphone were the same headset. Everything after the transcript is the real app and the real server. The WhatsApp screens are the app's simulated family view; nothing is sent to a real phone in the demo.

---

## 3. Built with (tags)

```text
alexa-plus, model-context-protocol, amazon-bedrock, gpt-oss, amazon-nova, amazon-polly, aws-lambda, amazon-dynamodb, amazon-s3, amazon-eventbridge, aws-cdk, aws-systems-manager, amazon-cloudwatch, anam, elevenlabs, whatsapp-cloud-api, typescript, node.js, express, react, vite, zod, google-stitch, claude-code
```

24 tags (the limit is 25).

---

## 4. Links

| Field | Value |
|---|---|
| **Demo video** | **TODO** the public YouTube link (2:43). Upload steps: `reel-studio/out/haven-demo/youtube/UPLOAD.md`. |
| **Try it out** | https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/ |
| **Code repository** | https://github.com/Admin-Mobil80/HAVEN-Website (MIT licence) |

**TODO, repo access.** The repo is private today (its public URL returns 404). Choose one, and do it yourself:
- **Public (simplest):** Settings, then Change visibility. Then check that the MIT licence shows in the repo's About box.
- **Private:** Settings, then Collaborators. Invite `chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar` and `testing@devpost.com`. Each must accept.

---

## 5. Track and mini challenge

- **Track:** Alexa+
- **Mini challenge:** AWS Builder

---

## 6. Testing instructions

```text
No sign-up and no keys. Use desktop Chrome or Edge with sound on.

1. Open https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/ and click "Start demo". Each browser tab gets its own private, fictional household: Daniel and his mother Mary in Seattle.

2. Three panels appear:
   - "Simulated Alexa+ add-on": our own MCP client, with a live log of every MCP message.
   - "Mom's tablet": where she talks to "Digital Daniel · AI".
   - "Daniel's WhatsApp": the family's view. Simulated in the demo; nothing goes to a real phone.

3. Click the walkthrough buttons 1 to 7 in order:
   1. Alexa, talk to Daniel (MCP initialize, tools/list, tools/call)
   2. A memory
   3. Will you come home? (waits for the real Daniel: create_deferral)
   4. Tell Daniel... (Haven asks "Shall I send this?")
   5. Yes, send it (sent only after her yes: record_reply)
   6. Evening update (Bedrock digest, with what to ask when you call)
   7. Help, I feel dizzy (fixed safety rules, no AI; urgent alert, 911 on screen)
   Also try asking the tablet "Are you real?".

4. Or just talk: after "Alexa, talk to Daniel" the tablet is hands-free. It needs microphone permission.

5. "Create your own" on the start screen builds a household from your own names, with an optional photo, voice and Voice ID note, each with a consent tick. The video's family (Arjun and his Ma in Kolkata) was made this way.

6. Test the MCP server directly: point MCP Inspector (v2) or any MCP client at
   https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/mcp
   Streamable HTTP, spec 2025-11-25, no auth. It serves a shared public demo household with 8 tools.
   CLI check: npx @modelcontextprotocol/inspector --cli <that URL> --transport http --method tools/list

7. Run it locally with no keys (Node 22+): npm install, npm run web:build, npm start, then open http://localhost:3000. The README has details. 761 automated tests: npm test.

"Reset demo" (top right) starts over.
```

---

## 7. Product feedback (required: every tool, API and SDK)

This field also carries the AWS Builder answer ("which AWS services you used and how"), which comes first. The block below is generated from [PRODUCT_FEEDBACK.md](../PRODUCT_FEEDBACK.md); edit that file, not this block.

<!-- PRODUCT_FEEDBACK:START -->
```text
For each tool, API and SDK: what we used it for, what worked well, what needs work, onboarding (zero to hello world), and whether we'd build with it again. The AWS section opens with the AWS Builder answer: which AWS services we used, and how.

=== AWS (AWS Builder mini challenge) ===

Which AWS services Haven uses, and how. Haven runs entirely in ap-south-1 (Mumbai), and the whole stack is defined in AWS CDK (TypeScript, infra/lib/haven-stack.ts).

- Hosting: one AWS Lambda function (Node 22, arm64) runs Express on the Lambda Web Adapter behind a Lambda Function URL. It serves the web app, the REST API and the MCP server (/mcp, spec 2025-11-25) from one origin.
- Amazon Bedrock, called through the Converse API with tool use, is the agent's brain:
  - openai.gpt-oss-120b-1:0 (runs in-region) is the primary model;
  - apac.amazon.nova-lite-v1:0 is the fallback;
  - a deterministic rules brain is the last resort.

  The same Converse API writes the evening family digest with one forced write_digest tool call. The engine turns the model's proposals into calls on Haven's own MCP tools through an in-process MCP client.
- Amazon Polly (neural):
  - speaks replies;
  - returns viseme speech marks that drive the illustrated avatar's lips;
  - produces ogg_opus voice notes small enough for WhatsApp.
- Amazon DynamoDB (one table) stores households, memories, messages, incidents and rate-limit counters.
- Amazon S3 stores voice notes, recordings and photos. Demo media expires after 7 days.
- Amazon EventBridge Scheduler runs three jobs:
  - the evening digest at 21:00 IST;
  - a 5-minute warm-up;
  - a nightly reset of the public demo.
- AWS Systems Manager Parameter Store (SecureString) holds every secret.
- Amazon CloudWatch alarms and AWS Budgets watch errors and spend.

Safety alerts never depend on Bedrock: deterministic rules open the incident, and Bedrock only shapes the conversation around it. Claude Code (Anthropic) was the development tool for the whole build.

Worked well: Bedrock: in-region open-weight and Amazon models need no Marketplace subscription, so gpt-oss-120b and Nova Lite worked on the first invoke. The Converse API let one code path and one tool schema serve both model families. In our bake-off (15 cases, from Mumbai) the median reply took 0.76 to 1.10 s. Polly: viseme marks were dense enough (about 8 to 10 per second) for convincing lip-sync. SSML prosody, and ogg_opus output for WhatsApp, worked without extra tooling. Lambda: with the Function URL and the Web Adapter, an ordinary Express app became a public HTTPS endpoint with no API Gateway, and the first deploy took about a minute. CDK: Scheduler, alarms, a budget and IAM fit in one readable stack.
Needs work: Bedrock: some models reject toolChoice while others quietly ignore it, so we had to detect this per model and retry without it. Nova 2 Lite is only reachable through a Global inference profile, which can route data out of the region, so we could not use it for an in-India data story. Claude on Bedrock goes through Marketplace, which has a documented card restriction for India (AISPL) accounts, so we designed around it rather than risk it. Lambda: zip deploys pin every file's modified time to 1980. Static files served with Last-Modified/ETag then looked unchanged after a deploy, and browsers kept the old app page (see the friction log). The default 30 s timeout is easy to miss for slow third-party calls. Polly: audio and speech marks need two separate SynthesizeSpeech calls, one per output format, which doubles requests per reply. IAM: our first identity got AccessDenied on Polly, Bedrock and IAM reads, and the error did not say which policy was missing.
Onboarding: An India (AISPL) account needs card, phone and identity verification before services open. After that, cdk bootstrap plus cdk deploy reached a working Function URL on day one. Our first Bedrock and Polly calls ran from a separate scripted check (npm run bakeoff, npm run polly-check) once the right IAM policy was attached (docs/iam-haven-dev-policy.json).
Build again?: Yes. One Lambda plus DynamoDB, S3 and Scheduler is cheap and simple for a judge-facing demo, and Bedrock let us keep inference in-region with automatic fallbacks.

=== Model Context Protocol (spec 2025-11-25, @modelcontextprotocol/sdk 1.32.1) ===

Used for: Haven's core: a stateless Streamable HTTP MCP server with 8 tools and 1 prompt. Three clients use it: the browser's simulated Alexa+ client, the conversation engine (in process, over an in-memory transport) and external tools such as MCP Inspector.
Worked well: registerTool with zod schemas gave input validation and structuredContent almost for free. Stateless JSON-response mode suits Lambda well, because no session store or SSE is needed. The in-memory transport let the engine use the exact same tools and consent checks as external clients, with no HTTP loopback.
Needs work: When the SDK rejects bad arguments itself, it returns an error shape we couldn't customise without overriding createToolError on the instance. We wanted every failure to carry {code, message, retryable}. Version negotiation across eras (2025-03-26, 2025-11-25 and the newer 2026-07-28 spec without initialize) is confusing to plan for. A clear "which version should a server target today" note would help.
Onboarding: Straightforward. The SDK examples plus MCP Inspector got initialize and tools/list working over HTTP on the first day of the build.
Build again?: Yes. One protocol served an assistant, our own agent and developer tools without any adapters.

=== MCP Inspector (v2.12.0, web UI and CLI) ===

Used for: Checking the live /mcp during development (the CLI's tools/list), and showing the real server in the demo video: the web UI connects, lists the 8 tools and calls recall_memory.
Worked well: v2 started pre-pointed at our server with --web --transport http --server-url …/mcp, so connecting was one click. Structured output is shown next to the text result, and the message log with timings makes the JSON-RPC exchange easy to explain.
Needs work: The v1 line (0.17.x) showed an empty tool list for our 2025-11-25 server, and its proxy crashed whenever a browser disconnected on Node 26 (friction log #18). In v2's "auto" protocol mode the server/discover probe shows as a red error against a legacy-era server, which looks like a fault in the server.
Onboarding: One npx command for v2. With v1 we lost about an hour before switching.
Build again?: Yes, v2. It is the quickest way to show that an MCP server is real.

=== Alexa+ add-on docs and MCP toolkit (simulated path) ===

Used for: Design guidance: tool design rules (one intent per tool, confirmation before high-consequence actions, no tool names spoken), the latency budget and the client lifecycle. We built the hackathon's allowed simulated path, a real MCP server plus our own browser MCP client labelled "Simulated Alexa+ add-on".
Worked well: The functional requirements and certification pages are a strong checklist for any voice-first MCP server. They shaped Haven's two-step consent and its no-jargon replies.
Needs work: The toolkit is limited to selected partners, but several setup pages read as self-serve, and @alexa-ai/cli returns npm 404. The auth pages disagree on 401 behaviour. Details are in the friction log (entries 1 and 2).
Onboarding: We could not reach hello world on a real add-on, because the toolkit is not open to entrants.
Build again?: Yes, once access opens. The server is spec-compliant MCP, so it is ready to register as an add-on.

=== Anam (@anam-ai/js-sdk 4.29.0 and REST API) ===

Used for: The photo-real face of the companion (cara-4): a stock avatar in the demo, or one built from a family member's photo with consent. Haven decides every word. The tablet streams 16 kHz PCM from our own /api/tts into the avatar's audio input, and Anam's microphone and LLM are not used. The API key stays on the server, which mints short-lived session tokens.
Worked well: Lip-sync on streamed audio looks natural, and audio passthrough let us keep our own safety pipeline, voice and words. Session tokens kept the key off the browser. stopStreaming() and connection events made it easy to connect only around a reply and close 4 s later, to control per-minute cost.
Needs work: Building a custom avatar from a photo took over 30 s in one synchronous call, which exceeded our Lambda's 30 s default. Video does not start in a hidden (display: none) element, which isn't documented. The pricing page and plan cards disagree on minutes, caps and concurrency. The JS quickstart shows the API key in browser code.
Onboarding: A stock avatar speaking in the browser through a server-minted token came quickly once we ignored the key-in-browser quickstart. Photo avatars and audio passthrough took longer, mainly because of the timeout and hidden-video issues.
Build again?: Yes. The real-time face is convincing, and audio passthrough fits products that must control every word.

=== ElevenLabs (REST API, eleven_flash_v2_5) ===

Used for: The companion's voice: a premade voice ("Chris") in the demo, a library voice, or, with a spoken consent line, the family member's own instant voice clone labelled "(AI)". We use TTS with character timings so the illustrated avatar's lips can follow ElevenLabs audio too.
Worked well: Flash v2.5 is fast enough for live replies. Character-level timings made lip-sync possible without a separate viseme service. Premade voices need no voice slot.
Needs work: On the Free plan, the API refused library voices and instant cloning (HTTP 402), even though a library voice could be added to the account. The restriction appears only at the first TTS call. Voice slots (10 on Starter) fill up quickly in a demo where every visitor may clone, so we had to recycle old demo clones ourselves.
Onboarding: The first TTS call with a premade voice is quick with a plain fetch and no SDK. Getting library voices and cloning to work meant moving off the Free plan.
Build again?: Yes. Voice quality and latency are excellent. We would check plan limits before designing a feature around them.

=== WhatsApp Cloud API (Meta, test number) ===

Used for: Real notifications to the family of a real household: urgent alerts, the evening digest with a voice note, and questions from the elder. Quick-reply buttons ("Calling now", "I will call tonight", "Play voice note") come back through a signed webhook. Demo households are simulated and mirrored on the family phone panel.
Worked well: Utility templates were approved on the day we submitted them. Quick-reply buttons made the "call now" loop a single tap. Verified end to end on a real phone, an urgent alert arrived in 1.6 s.
Needs work: The app must be subscribed to the test WABA with a separate POST /{waba}/subscribed_apps call, which is easy to miss. A user access token was invalidated by a password change (error 190/460), so production needs a system-user token. The test number only reaches pre-registered recipients, so judges cannot receive messages. Outside the 24-hour window every business-initiated message must be a template.
Onboarding: Templates, webhook verification, the WABA subscription step and a permanent system-user token were all done on 16 Oct, ending with a verified urgent alert on a real phone.
Build again?: Yes. It is where many families already talk, and buttons beat SMS for one-tap acknowledgement.

=== Google Stitch (UI design) ===

Used for: Generating the visual design (the "Warm Neighbor Sanctuary" theme and six screens) from the prompts in docs/UI_STITCH_PROMPT.md. The export is in design/stitch. We rebuilt the screens by hand in React.
Worked well: A cohesive palette, type scale and layout in minutes. It is good at warm, accessible large-type layouts.
Needs work: It invents features that don't exist (extra buttons, stats), so every screen had to be checked against the real product. The exported HTML is a reference, not production code.
Onboarding: Minutes.
Build again?: Yes, for a first design pass.

=== Claude Code (Anthropic) ===

Used for: The development partner for the whole build: server, MCP tools, safety rules, tests, CDK, web app and documentation.
Worked well: Working in small, tested steps with a written decisions log kept a one-week build by a small team coherent.
Needs work: Long sessions need explicit hand-over notes and a decisions log to stay consistent.
Onboarding: Install, then start in the repo.
Build again?: Yes.
```
<!-- PRODUCT_FEEDBACK:END -->

---

## 8. Friction log (optional, up to a 10% bonus)

```text
Our friction log has 18 entries, each with the six requested fields (task, steps, expected vs actual, severity, workaround, suggestion):
https://github.com/Admin-Mobil80/HAVEN-Website/blob/main/FRICTION_LOG.md

1. Alexa+ MCP toolkit not available to entrants (blocker for the real path)
2. Alexa+ auth docs disagree on 401 behaviour
3. Anam pricing page is internally inconsistent
4. Anam webhook tool timeout contradiction
5. Anam quickstart puts the API key in browser code
6. No Hindi/Tamil TTS voice listing
7. Bedrock models disagree on toolChoice
8. Claude on Bedrock blocked by Marketplace payment rules for India accounts
9. Nova 2 Lite only through a Global inference profile
10. First AWS identity got AccessDenied with no hint of the missing policy
11. ElevenLabs Free plan blocks library voices and cloning through the API
12. ElevenLabs voice slots fill up in a public demo
13. Anam avatar creation takes more than 30 s in one synchronous call
14. Anam video does not start in a hidden element
15. Lambda zip pins file dates to 1980, so browsers kept the old app page
16. WhatsApp: tokens and webhook subscription
17. Alexa+ add-ons can't tell who is speaking (Voice ID)
18. MCP Inspector v1 couldn't show our 2025-11-25 server's tools
```

---

## 9. Feature requests (optional)

```text
1. Speaker identity for Alexa+ add-ons
   What: pass Alexa's existing speaker recognition to add-ons as an opaque per-household person id with a confidence level, behind the same customer opt-in that classic skills use (context.System.person.personId).
   Why it matters: any add-on that holds personal data (family messages, reminders, health notes) must answer only the right person. Today each add-on would have to build its own speaker verification and store voiceprints, which is worse for privacy than reusing Alexa's own.
   Priority: Critical

2. A sandbox for Alexa+ add-on developers
   What: open the MCP toolkit, CLI and web simulator to hackathon entrants and new developers, even rate-limited or time-boxed.
   Why it matters: we could build and test a spec-compliant MCP server, but never see it run inside Alexa+. Developers can't check latency, voice rendering or the confirmation flow against the real client.
   Priority: Important

3. Proactive moments for add-ons
   What: let an add-on ask Alexa+ to surface something when the user isn't talking to it, for example "Arjun sent you a voice note", through a consented, rate-limited announcement or notification.
   Why it matters: companion and caregiving add-ons are most useful when family news arrives. Today the user has to start a conversation to hear it.
   Priority: Important

4. One-tap calling from an add-on
   What: let an add-on hand off to Alexa calling or Drop In for a contact the user has already approved ("Call Arjun now?").
   Why it matters: Haven's whole goal is more real calls. Ending the AI conversation with a real call, in one step, is the natural finish.
   Priority: Nice-to-have
```

---

## 10. Pre-existing work

```text
None. Haven was created for this hackathon. The first commit is 16 Oct 2026, and the full commit history is in the repo. It reuses only open-source packages under their own licences, and third-party services (AWS, Anam, ElevenLabs, Meta WhatsApp) under their terms.
```

---

## 11. Team

**TODO:** add your teammate on the submission (Manage team), and make sure they accept the invite before the deadline.

---

## 12. Final checks before pressing Submit

- [ ] Video is public on YouTube, under 3:00 (2:43), and plays signed out.
- [ ] Repo is public with the licence showing, or all seven reviewers are invited and have accepted.
- [ ] Teammate added and accepted.
- [ ] Every field above is pasted, including product feedback and testing instructions.
- [ ] Track: Alexa+. Mini challenge: AWS Builder.
- [ ] Clicked **Submit**, and My projects shows **Submitted**, not Draft.
- [ ] After the deadline: no pushes, deploys or video edits until 3 Dec.
