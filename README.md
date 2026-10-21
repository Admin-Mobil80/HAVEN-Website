# Haven

**Most AI companions want more of your loved one's time. Haven wants more of your calls.**

Haven keeps a lonely older person company when their family can't be there. They talk to a clearly labelled AI version of the family member who set it up, for example "Digital Daniel · AI". Each evening the family gets a short update with ideas for the next real call. If something is wrong, they get an urgent "call now" alert. Haven's success metric is **real calls per week**, shown on the family's phone.

Built for **Build, Ship, Shape: Amazon Developer Hackathon 2026**. Track: **Alexa+** (a real MCP server plus a simulated Alexa+ web client). Mini challenge: **AWS Builder**.

Haven is an AI. It never claims to be a person, never gives medical advice, and is **not an emergency service**. In danger, it tells people to call 911 (US households) or 112.

---

## Try it (judges: no sign-up, no tokens)

**Hosted demo:** https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/

Use desktop Chrome or Edge with sound on. Each browser tab gets its own private demo household, so judges never see each other's data.

1. Open the link and click **Start demo**. This creates a fictional family: Daniel (the son) and his mother Mary ("Mom") in Seattle. The face is a stock Anam avatar and the voice a premade ElevenLabs voice, so no real person's likeness is used.
2. The page shows three panels side by side:
   - the **Simulated Alexa+ add-on** with its live **MCP log**;
   - **Mom's tablet**, where she talks to Digital Daniel;
   - **Daniel's phone**, the family view.
3. Click the walkthrough buttons in order:

| Step | What you'll see |
|---|---|
| **1. Alexa, talk to Daniel** | The simulator runs `initialize`, `tools/list` and three `tools/call`s (`recall_memory`, `get_reminders`, `play_family_message`) against Haven's MCP server, then hands the conversation to the tablet. Every JSON-RPC message appears in the MCP log. |
| **2. A memory** | Mom mentions an old friend from the market. Digital Daniel replies, and the brain stores the memory with the `remember` tool. |
| **3. Will you come home?** | Only the real Daniel can make that promise, so Digital Daniel doesn't. A deterministic detector files the question for Daniel with `create_deferral`, and it appears on his phone. |
| **4. Tell Daniel…** | Mom asks for a message to be passed on. Haven asks "Shall I send this?" and nothing is sent yet (`record_reply`, step one). |
| **5. Yes, send it** | Mom's spoken yes completes the send (`record_reply`, step two). The message appears on Daniel's phone. |
| **6. Evening update** | Runs the evening digest now: a Bedrock-written summary, a voice note and ideas for the next call. In the demo, WhatsApp delivery is simulated and mirrored on Daniel's phone. |
| **7. Help, I feel dizzy** | Deterministic safety rules open an incident with no LLM involved. The tablet shows 911 and Daniel's phone shows an urgent **Call now** card. Tap **Calling now** to acknowledge it and log a real call. |

You can also ask the tablet **"Are you real?"**. The answer is fixed text, never improvised by a model: *"I'm Digital Daniel, an AI version of Daniel, made with his permission. I'm not the real Daniel…"*

**Reset demo** (top right) starts over. **Create your own** (on the start screen) builds a household from your own names, then optionally your photo and voice, with consent ticks. Speaking needs microphone permission; the walkthrough buttons work without it.

### What "Simulated Alexa+ add-on" means

The real Alexa+ add-on toolkit is open only to selected partners, and hackathon entrants cannot apply. Haven follows the hackathon's allowed simulated path:

- The panel labelled **Simulated Alexa+ add-on** is **our own code, not an Amazon product**. It has no Alexa branding and uses a neutral voice.
- It is a **real MCP client** ([web/src/lib/mcp.ts](web/src/lib/mcp.ts)). Over Streamable HTTP it sends `initialize`, `notifications/initialized`, `tools/list` and `tools/call` to the same `/mcp` endpoint any other MCP client would use. It routes a few fixed intents itself, as Alexa+ would, and hands the conversation to the tablet ([web/src/screens/AlexaSim.tsx](web/src/screens/AlexaSim.tsx)).
- The server is spec-compliant MCP, so it could be registered as a real add-on if access opens.

---

## The MCP server

- **Endpoint:** `POST https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/mcp`
- **Protocol:** MCP **2025-11-25** over Streamable HTTP. It is stateless and answers in JSON (no SSE stream). GET returns 405, and a browser `Origin` not on the allowlist gets 403. Built with `@modelcontextprotocol/sdk` 1.32.1 (pinned).
- **Household scope:** with no token, `/mcp` serves a shared public demo household. The web app uses `/mcp/h/<token>`, which is scoped to that tab's own demo household. Tools never take a household or person id, so a client cannot reach another household.
- **8 tools:**

| Tool | What it does |
|---|---|
| `recall_memory` | Memories the family and the elder have shared |
| `remember` | Store a new memory (can be marked private, so the family never sees it) |
| `play_family_message` | The next voice note or message the real family left |
| `record_reply` | Two-step send to the family: a preview first, then sent only after the elder's own spoken yes |
| `create_deferral` | Pass a question only the family can answer (visits, plans, money, health decisions) |
| `log_wellbeing` | Log mood and wellbeing for the evening update |
| `get_reminders` | Today's reminders |
| `start_escalation` | Open a safety incident and alert the family |

- **1 prompt:** `digital_priya_persona`, the companion's system instructions for this household. The name is left over from an earlier persona.

**Try it with MCP Inspector:**

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector UI choose **Streamable HTTP**, paste the endpoint URL above, then **Connect** and **List Tools**. Or from the command line:

```bash
npx @modelcontextprotocol/inspector --cli https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/mcp --transport http --method tools/list
```

Or with plain curl:

```bash
curl -s -X POST https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

---

## Run it locally (no keys needed)

Requires Node 22 or later.

```bash
npm install
```

```bash
npm run web:build
```

```bash
npm start
```

Then open http://localhost:3000. The MCP endpoint is http://localhost:3000/mcp.

With no `.env`, the local run uses:

- an in-memory store;
- simulated notifications;
- the deterministic **rules brain** instead of Bedrock;
- the browser's own speech instead of Polly;
- the illustrated avatar instead of the Anam face.

So the whole walkthrough works offline from AWS. To opt in to real services, copy `.env.example` to `.env` and set:

- `HAVEN_BRAIN=bedrock` and/or `HAVEN_SPEECH=polly`, which use your AWS credentials in `ap-south-1`;
- `ELEVENLABS_API_KEY` and `ANAM_API_KEY` for custom voices and the photo-real face.

Other commands:

- `npm test` runs the test suite (758 tests at the time of writing).
- `npm run typecheck` type-checks the server.
- `npm run dev` starts the server in watch mode. Pair it with `npm run web:dev` (Vite on :5173) for UI work.

Deploying to your own AWS account is covered in [docs/DEPLOY.md](docs/DEPLOY.md).

---

## Architecture

```
 Browser (one origin)                                      AWS ap-south-1 (Mumbai)
 ┌──────────────────────────────┐                        ┌────────────────────────────────────────────┐
 │ Simulated Alexa+ (MCP client)├── POST /mcp ──────────▶│ Lambda (Node 22, arm64) behind a Function   │
 │ Mom's tablet                 ├── POST /api/turn ─────▶│ URL; Express on the Lambda Web Adapter      │
 │ Daniel's phone (family view) ├── /api/* ─────────────▶│  • MCP server (8 tools)                     │
 └──────────┬───────────────────┘                        │  • conversation engine (in-process MCP)     │
            │ WebRTC (live face)                         │  • evening digest job                       │
            ▼                                            └───┬──────┬──────┬──────┬──────┬────────────┘
        Anam (cara-4)                                        │      │      │      │      │
                                                        DynamoDB   S3   Bedrock  Polly  EventBridge Scheduler
                                                        (one table)(media)        (TTS +   (digest 21:00 IST,
                                                                                   visemes) warm, demo reset)
                         ElevenLabs (voice) ◀── /api/tts      WhatsApp Cloud API ◀── alerts + digest
```

- **One Lambda behind a Function URL.** Express 5 runs on the Lambda Web Adapter, defined in CDK (TypeScript) in [infra/lib/haven-stack.ts](infra/lib/haven-stack.ts). It serves the web app, `/api` and `/mcp` from one origin, so there is no CORS. The timeout is 120 s, because building an Anam avatar from a photo can take over 30 s.
- **DynamoDB** (single table) holds households, memories, messages, incidents and rate-limit counters. **S3** holds voice notes, recordings and photos, and demo media expires after 7 days.
- **EventBridge Scheduler** runs three jobs: the evening digest at 21:00 IST, a warm-up ping every 5 minutes, and a nightly reset of the public demo. CloudWatch alarms and an AWS Budget watch the stack.
- **Amazon Bedrock**, in this fallback order:
  1. `openai.gpt-oss-120b-1:0`, which runs in-region;
  2. then `apac.amazon.nova-lite-v1:0`;
  3. then a deterministic **rules brain**.

  Bedrock uses the Converse API with tool use. The evening digest is one Converse call with a forced `write_digest` tool, plus a template fallback. The model order came from a 15-case bake-off (`npm run bakeoff`); results are in [docs/DECISIONS.md](docs/DECISIONS.md).
- **Amazon Polly** (neural) is the default and fallback voice. Its viseme speech marks drive the illustrated avatar's five mouth shapes. Polly also reads the digest's voice note, which is stored as ogg_opus for WhatsApp.
- **ElevenLabs** provides the companion's voice. That is a premade voice in the demo, or with consent the family member's own instant clone. If ElevenLabs fails, Haven falls back to Polly.
- **Anam** provides the photo-real face (cara-4). Haven decides every word: the tablet streams 16 kHz PCM from `/api/tts` into Anam's audio passthrough, and Anam's own LLM and microphone are not used. The face connects only around a reply and closes 4 s later. If the live face fails, the illustrated avatar takes over.
- **WhatsApp Cloud API** (Meta test number, approved templates) delivers urgent alerts, the evening digest and voice notes to a real household. Its quick replies ("Calling now", "I will call tonight", "Play voice note") come back through a webhook. Demo households never send real messages: their WhatsApp messages are simulated and mirrored on the family phone panel.
- **The conversation engine** ([src/agent/turn.ts](src/agent/turn.ts)) calls the MCP server through an **in-process MCP client**, using the same JSON-RPC, tools and consent checks as external clients.

## Safety and honesty by design

- **Deterministic safety rules first.** Every turn of the elder's speech goes through keyword and clause rules ([src/domain/safety.ts](src/domain/safety.ts)) before any model sees it. The rules handle negation, so "No, I fell" is still caught. A match opens an incident and alerts the family even if Bedrock is slow or down.
  - The alert is awaited before the reply goes out.
  - Only one incident is open at a time, and duplicates are never sent.
  - Only a human in the family can acknowledge, cancel or close an incident.
- **An always-on AI badge.** The companion is always labelled "Digital Daniel · AI". The badge is built into the avatar component, so no layout can hide it. Anam's own AI disclosure is on and session replay is off.
- **A fixed answer to "Are you real?"** The engine answers this before the LLM runs, with fixed text that says the companion is an AI and not the real person. It also discloses at the start of a session and every 3 hours.
- **An output guard.** A deterministic final check ([src/domain/guards.ts](src/domain/guards.ts)) rewrites any reply that:
  - claims to be human or the real family member;
  - promises something on the family's behalf;
  - gives medication advice;
  - claims emergency services were called.
- **Two-step consent before sending.**
  - A send only starts when the elder explicitly asks ("tell Daniel…").
  - It then becomes "Shall I send this?".
  - The server accepts the second step only after the elder's own clear yes, written by the device.
  - The model can propose a send, but it can never complete one.
- **Promises stay human.** Visits, plans, money and health decisions go to `create_deferral` for the real family to answer.
- **Privacy.**
  - Anything the elder marks private ("don't tell Daniel") never reaches the digest.
  - The activity log is redacted.
  - The demo uses only fictional people and stock likenesses.
  - A real household's photo and voice need an explicit consent tick, and the voice recording opens with a spoken consent line.

## AI-assisted development disclosure

Haven was built by one person working with **Claude Code** (Anthropic), which wrote most of the code, tests, infrastructure and documentation under the builder's direction and review. Every design decision is logged with evidence in [docs/DECISIONS.md](docs/DECISIONS.md). The Claude co-authorship is visible in the commit history.

AI is also part of the product at runtime:

- the conversation and digest models on Amazon Bedrock;
- Polly and ElevenLabs voices;
- Anam's generated face;
- the UI design, which was generated with Google Stitch from the prompts in [docs/UI_STITCH_PROMPT.md](docs/UI_STITCH_PROMPT.md) (export in `design/stitch`) and then rebuilt by hand in React.

All demo people are fictional.

## More

- [FRICTION_LOG.md](FRICTION_LOG.md): friction we hit, in the hackathon's six-field format
- [PRODUCT_FEEDBACK.md](PRODUCT_FEEDBACK.md): feedback on every tool, API and SDK used, including AWS
- [docs/DECISIONS.md](docs/DECISIONS.md): the decisions log
- [docs/DEPLOY.md](docs/DEPLOY.md): deploying the stack

## Licence

[MIT](LICENSE). Third-party services (AWS, Anam, ElevenLabs, Meta WhatsApp) are used under their own terms. Alexa, Amazon, Echo and WhatsApp are trademarks of their owners; Haven is not affiliated with or endorsed by them.
