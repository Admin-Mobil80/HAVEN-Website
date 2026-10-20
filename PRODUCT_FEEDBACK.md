# Product feedback

For each tool, API or SDK Haven uses, this answers the five Devpost questions:

1. What we used it for.
2. What worked well.
3. What needs work.
4. Onboarding, from zero to hello world.
5. Would we build with it again?

The AWS section begins with the paragraph the AWS Builder mini challenge asks for. The friction behind several of these answers is logged step by step in [FRICTION_LOG.md](FRICTION_LOG.md).

---

## AWS (AWS Builder mini challenge)

**Which AWS services Haven uses, and how.** Haven runs entirely in **ap-south-1 (Mumbai)**, and the whole stack is defined in **AWS CDK** (TypeScript, [infra/lib/haven-stack.ts](infra/lib/haven-stack.ts)).

- **Hosting:** one **AWS Lambda** function (Node 22, arm64) runs Express on the Lambda Web Adapter behind a **Lambda Function URL**. It serves the web app, the REST API and the MCP server (`/mcp`, spec 2025-11-25) from one origin.
- **Amazon Bedrock**, called through the Converse API with tool use, is the agent's brain:
  - `openai.gpt-oss-120b-1:0` (runs in-region) is the primary model;
  - `apac.amazon.nova-lite-v1:0` is the fallback;
  - a deterministic rules brain is the last resort.

  The same Converse API writes the evening family digest with one forced `write_digest` tool call. The engine turns the model's proposals into calls on Haven's own MCP tools through an in-process MCP client.
- **Amazon Polly** (neural):
  - speaks replies;
  - returns viseme speech marks that drive the illustrated avatar's lips;
  - produces ogg_opus voice notes small enough for WhatsApp.
- **Amazon DynamoDB** (one table) stores households, memories, messages, incidents and rate-limit counters.
- **Amazon S3** stores voice notes, recordings and photos. Demo media expires after 7 days.
- **Amazon EventBridge Scheduler** runs three jobs:
  - the evening digest at 21:00 IST;
  - a 5-minute warm-up;
  - a nightly reset of the public demo.
- **AWS Systems Manager Parameter Store** (SecureString) holds every secret.
- **Amazon CloudWatch** alarms and **AWS Budgets** watch errors and spend.

Safety alerts never depend on Bedrock: deterministic rules open the incident, and Bedrock only shapes the conversation around it. **Claude Code** (Anthropic) was the development tool for the whole build.

| Question | Answer |
|---|---|
| **Worked well** | **Bedrock:** in-region open-weight and Amazon models need no Marketplace subscription, so gpt-oss-120b and Nova Lite worked on the first invoke. The Converse API let one code path and one tool schema serve both model families. In our bake-off (15 cases, from Mumbai) the median reply took 0.76 to 1.10 s. **Polly:** viseme marks were dense enough (about 8 to 10 per second) for convincing lip-sync. SSML prosody, and ogg_opus output for WhatsApp, worked without extra tooling. **Lambda:** with the Function URL and the Web Adapter, an ordinary Express app became a public HTTPS endpoint with no API Gateway, and the first deploy took about a minute. **CDK:** Scheduler, alarms, a budget and IAM fit in one readable stack. |
| **Needs work** | **Bedrock:** some models reject `toolChoice` while others quietly ignore it, so we had to detect this per model and retry without it. Nova 2 Lite is only reachable through a Global inference profile, which can route data out of the region, so we could not use it for an in-India data story. Claude on Bedrock goes through Marketplace, which has a documented card restriction for India (AISPL) accounts, so we designed around it rather than risk it. **Lambda:** zip deploys pin every file's modified time to 1980. Static files served with `Last-Modified`/`ETag` then looked unchanged after a deploy, and browsers kept the old app page (see the friction log). The default 30 s timeout is easy to miss for slow third-party calls. **Polly:** audio and speech marks need two separate `SynthesizeSpeech` calls, one per output format, which doubles requests per reply. **IAM:** our first identity got `AccessDenied` on Polly, Bedrock and IAM reads, and the error did not say which policy was missing. |
| **Onboarding** | An India (AISPL) account needs card, phone and identity verification before services open. After that, `cdk bootstrap` plus `cdk deploy` reached a working Function URL on day one. Our first Bedrock and Polly calls ran from a separate scripted check (`npm run bakeoff`, `npm run polly-check`) once the right IAM policy was attached ([docs/iam-haven-dev-policy.json](docs/iam-haven-dev-policy.json)). |
| **Build again?** | **Yes.** One Lambda plus DynamoDB, S3 and Scheduler is cheap and simple for a judge-facing demo, and Bedrock let us keep inference in-region with automatic fallbacks. |

---

## Model Context Protocol (spec 2025-11-25, `@modelcontextprotocol/sdk` 1.32.1)

| Question | Answer |
|---|---|
| **Used for** | Haven's core: a stateless Streamable HTTP MCP server with 8 tools and 1 prompt. Three clients use it: the browser's simulated Alexa+ client, the conversation engine (in process, over an in-memory transport) and external tools such as MCP Inspector. |
| **Worked well** | `registerTool` with zod schemas gave input validation and `structuredContent` almost for free. Stateless JSON-response mode suits Lambda well, because no session store or SSE is needed. The in-memory transport let the engine use the exact same tools and consent checks as external clients, with no HTTP loopback. |
| **Needs work** | When the SDK rejects bad arguments itself, it returns an error shape we couldn't customise without overriding `createToolError` on the instance. We wanted every failure to carry `{code, message, retryable}`. Version negotiation across eras (2025-03-26, 2025-11-25 and the newer 2026-07-28 spec without `initialize`) is confusing to plan for. A clear "which version should a server target today" note would help. |
| **Onboarding** | Straightforward. The SDK examples plus MCP Inspector got `initialize` and `tools/list` working over HTTP on the first day of the build. |
| **Build again?** | **Yes.** One protocol served an assistant, our own agent and developer tools without any adapters. |

---

## Alexa+ add-on docs and MCP toolkit (simulated path)

| Question | Answer |
|---|---|
| **Used for** | Design guidance: tool design rules (one intent per tool, confirmation before high-consequence actions, no tool names spoken), the latency budget and the client lifecycle. We built the hackathon's allowed simulated path, a real MCP server plus our own browser MCP client labelled "Simulated Alexa+ add-on". |
| **Worked well** | The functional requirements and certification pages are a strong checklist for any voice-first MCP server. They shaped Haven's two-step consent and its no-jargon replies. |
| **Needs work** | The toolkit is limited to selected partners, but several setup pages read as self-serve, and `@alexa-ai/cli` returns npm 404. The auth pages disagree on 401 behaviour. Details are in the friction log (entries 1 and 2). |
| **Onboarding** | We could not reach hello world on a real add-on, because the toolkit is not open to entrants. |
| **Build again?** | **Yes, once access opens.** The server is spec-compliant MCP, so it is ready to register as an add-on. |

---

## Anam (`@anam-ai/js-sdk` 4.29.0 and REST API)

| Question | Answer |
|---|---|
| **Used for** | The photo-real face of the companion (cara-4): a stock avatar in the demo, or one built from a family member's photo with consent. Haven decides every word. The tablet streams 16 kHz PCM from our own `/api/tts` into the avatar's audio input, and Anam's microphone and LLM are not used. The API key stays on the server, which mints short-lived session tokens. |
| **Worked well** | Lip-sync on streamed audio looks natural, and audio passthrough let us keep our own safety pipeline, voice and words. Session tokens kept the key off the browser. `stopStreaming()` and connection events made it easy to connect only around a reply and close 4 s later, to control per-minute cost. |
| **Needs work** | Building a custom avatar from a photo took over 30 s in one synchronous call, which exceeded our Lambda's 30 s default. Video does not start in a hidden (`display: none`) element, which isn't documented. The pricing page and plan cards disagree on minutes, caps and concurrency. The JS quickstart shows the API key in browser code. |
| **Onboarding** | A stock avatar speaking in the browser through a server-minted token came quickly once we ignored the key-in-browser quickstart. Photo avatars and audio passthrough took longer, mainly because of the timeout and hidden-video issues. |
| **Build again?** | **Yes.** The real-time face is convincing, and audio passthrough fits products that must control every word. |

---

## ElevenLabs (REST API, `eleven_flash_v2_5`)

| Question | Answer |
|---|---|
| **Used for** | The companion's voice: a premade voice ("Chris") in the demo, a library voice, or, with a spoken consent line, the family member's own instant voice clone labelled "(AI)". We use TTS with character timings so the illustrated avatar's lips can follow ElevenLabs audio too. |
| **Worked well** | Flash v2.5 is fast enough for live replies. Character-level timings made lip-sync possible without a separate viseme service. Premade voices need no voice slot. |
| **Needs work** | On the Free plan, the API refused library voices and instant cloning (HTTP 402), even though a library voice could be added to the account. The restriction appears only at the first TTS call. Voice slots (10 on Starter) fill up quickly in a demo where every visitor may clone, so we had to recycle old demo clones ourselves. |
| **Onboarding** | The first TTS call with a premade voice is quick with a plain `fetch` and no SDK. Getting library voices and cloning to work meant moving off the Free plan. |
| **Build again?** | **Yes.** Voice quality and latency are excellent. We would check plan limits before designing a feature around them. |

---

## WhatsApp Cloud API (Meta, test number)

| Question | Answer |
|---|---|
| **Used for** | Real notifications to the family of a real household: urgent alerts, the evening digest with a voice note, and questions from the elder. Quick-reply buttons ("Calling now", "I will call tonight", "Play voice note") come back through a signed webhook. Demo households are simulated and mirrored on the family phone panel. |
| **Worked well** | Utility templates were approved on the day we submitted them. Quick-reply buttons made the "call now" loop a single tap. Verified end to end on a real phone, an urgent alert arrived in 1.6 s. |
| **Needs work** | The app must be subscribed to the test WABA with a separate `POST /{waba}/subscribed_apps` call, which is easy to miss. A user access token was invalidated by a password change (error 190/460), so production needs a system-user token. The test number only reaches pre-registered recipients, so judges cannot receive messages. Outside the 24-hour window every business-initiated message must be a template. |
| **Onboarding** | Templates, webhook verification, the WABA subscription step and a permanent system-user token were all done on 16 Oct, ending with a verified urgent alert on a real phone. |
| **Build again?** | **Yes.** It is where many families already talk, and buttons beat SMS for one-tap acknowledgement. |

---

## Google Stitch (UI design)

| Question | Answer |
|---|---|
| **Used for** | Generating the visual design (the "Warm Neighbor Sanctuary" theme and six screens) from the prompts in [docs/UI_STITCH_PROMPT.md](docs/UI_STITCH_PROMPT.md). The export is in `design/stitch`. We rebuilt the screens by hand in React. |
| **Worked well** | A cohesive palette, type scale and layout in minutes. It is good at warm, accessible large-type layouts. |
| **Needs work** | It invents features that don't exist (extra buttons, stats), so every screen had to be checked against the real product. The exported HTML is a reference, not production code. |
| **Onboarding** | Minutes. |
| **Build again?** | **Yes**, for a first design pass. |

---

## Claude Code (Anthropic)

| Question | Answer |
|---|---|
| **Used for** | The development partner for the whole build: server, MCP tools, safety rules, tests, CDK, web app and documentation. |
| **Worked well** | Working in small, tested steps with a written decisions log kept a solo ten-day build coherent. |
| **Needs work** | Long sessions need explicit hand-over notes and a decisions log to stay consistent. |
| **Onboarding** | Install, then start in the repo. |
| **Build again?** | **Yes.** |
