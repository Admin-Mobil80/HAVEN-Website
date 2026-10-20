# Devpost submission draft

**Project name:** Haven

**Tagline:** Most AI companions want more of your loved one's time. Haven wants more of your calls.

**Track:** Alexa+ (a real MCP server plus a simulated Alexa+ web client). **Mini challenge:** AWS Builder.

**Try it:** https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/ (click **Start demo**, then walkthrough steps 1 to 7; no sign-up)

---

## Inspiration

Loneliness is a public-health problem, not a niche one:

- The **WHO Commission on Social Connection** reports that **1 in 6 people worldwide** is affected by loneliness, and links it to **more than 871,000 deaths a year** ([WHO, 30 June 2025](https://www.who.int/news/item/30-06-2025-social-connection-linked-to-improved-heath-and-reduced-risk-of-early-death)).
- The **US Surgeon General's 2023 advisory**, *Our Epidemic of Loneliness and Isolation*, found that about **half of US adults** reported measurable loneliness. It linked poor social connection to a **29% higher risk of heart disease, a 32% higher risk of stroke, and a 50% higher risk of dementia in older adults** ([HHS, May 2023](https://www.hhs.gov/sites/default/files/surgeon-general-social-connection-advisory.pdf)).
- The **CDC** reports that about **1 in 3 US adults** feel lonely, and that **older adults are more at risk of social isolation** ([CDC](https://www.cdc.gov/social-connectedness/risk-factors/index.html)).

AI companions are an obvious answer, and a worrying one. A companion that is always available and always agreeable can quietly replace the people it should lead back to, especially for an older parent whose children live far away.

We wanted the opposite: a companion whose job is to make itself less necessary, and whose success metric is **real calls per week from family**.

## What it does

A family member, here Daniel in the demo, sets Haven up for his mother Margaret in Seattle. She talks to **Digital Daniel**, a clearly labelled AI version of her son with a live face and voice. It remembers what she shares, plays messages the real Daniel leaves, and keeps her company. It never pretends to be him.

- **Daniel's evening update.** Each evening Daniel gets a short summary with a voice note: how Mom's day went, the stories she told and the questions only he can answer. It ends with ideas for tonight's call. Real households get it on WhatsApp; the demo mirrors it on a phone panel.
- **Questions go to the real person.** If Mom asks "Will you come home next month?", Digital Daniel doesn't make promises. It says that one is for the real Daniel and passes it to him.
- **Messages only with her yes.** "Tell Daniel the roses have bloomed" becomes "Shall I send this?", and nothing leaves until she says yes.
- **Urgent alerts.** "Help, I feel dizzy" triggers deterministic safety rules, with no AI in the loop. Daniel gets an urgent **Call now** alert, and Mom's tablet tells her to call 911 if she is in danger. One tap on **Calling now** acknowledges the alert, logs the call, and the tablet shows Mom that the real Daniel is calling.
- **The metric that matters.** Daniel's phone shows **real calls this week** against a goal, and how many of them Haven prompted.
- **Honest by design.** An always-on "Digital Daniel · AI" badge. Ask "Are you real?" and you get a fixed answer: an AI version of Daniel, made with his permission, not the real Daniel.
- **Alexa+ fit.** "Alexa, talk to Daniel" opens Haven through a **simulated Alexa+ add-on**. This is our own browser code, labelled as such, and it acts as a real MCP client: you watch `initialize`, `tools/list` and `tools/call` happen live against Haven's MCP server.
- **Create your own.** Families can use their own names and, with consent, their own photo and voice.

## How we built it

- **MCP at the core.** A stateless Streamable HTTP MCP server (spec **2025-11-25**, `@modelcontextprotocol/sdk` 1.32.1) exposes 8 tools: `recall_memory`, `remember`, `play_family_message`, `record_reply`, `create_deferral`, `log_wellbeing`, `get_reminders` and `start_escalation`. Three clients use the same server and consent checks:
  - the simulated Alexa+ client in the browser;
  - our conversation engine, through an in-process MCP client;
  - any external client, such as MCP Inspector.
- **A safety-first conversation pipeline.** Every turn runs in a fixed order:
  1. deterministic safety rules;
  2. a fixed honesty answer;
  3. a yes/no matcher for a pending send;
  4. a detector for promises only the family can make;
  5. the LLM;
  6. a deterministic output guard;
  7. MCP tool calls;
  8. speech.

  The model proposes and the server decides.
- **AWS, all in ap-south-1, all in CDK:**
  - **Hosting:** one **Lambda** (Express on the Lambda Web Adapter) behind a **Function URL** serves the app, the API and `/mcp` from one origin.
  - **Amazon Bedrock** (Converse API with tool use): `openai.gpt-oss-120b-1:0` first, then `apac.amazon.nova-lite-v1:0`, then a rules brain. Bedrock also writes the evening digest. We chose the models with a 15-case bake-off.
  - **Amazon Polly** provides neural speech, viseme lip-sync for the illustrated avatar and WhatsApp voice notes.
  - **Storage and jobs:** DynamoDB, S3, EventBridge Scheduler (digest, warm-up, nightly demo reset), SSM for secrets, plus CloudWatch alarms and a Budget.
- **Face and voice.** **Anam** renders the live face (cara-4), and **ElevenLabs** provides the voice. Haven decides every word and streams its own audio into the avatar, so the safety pipeline is never bypassed. The face connects only around a reply, to save cost, and falls back to an illustrated avatar if anything fails.
- **WhatsApp Cloud API** carries the real alerts and digests, with quick-reply buttons ("Calling now", "I will call tonight") that come back through a webhook.
- **Web app:** React and Vite, designed with Google Stitch and rebuilt by hand. **Built with Claude Code.** There are 758 automated tests.

## Challenges we ran into

- **No Alexa+ toolkit access** for entrants, so we built a real MCP server plus a clearly labelled simulated client.
- **India-specific AWS limits.** Claude on Bedrock goes through Marketplace, which restricts cards for India accounts. Nova 2 Lite was only available through a Global profile. We designed around both with in-region gpt-oss-120b and Nova Lite.
- **Models are inconsistent with forced tool use.** Some Bedrock models reject `toolChoice` and others ignore it, so the brain detects this and falls back.
- **Making a live face affordable and reliable.** Photo avatars took over 30 s to build, so we raised the Lambda timeout to 120 s. The video would not start in a hidden element, so we keep it rendered but transparent. We connect the face only while it speaks.
- **Voice plans.** The ElevenLabs Free plan refused library voices and cloning through the API, so every voice now falls back to Polly.
- **A stale app after deploys.** The Lambda zip pins every file date to 1980, so browsers kept the old page. The app shell is now served with `no-store`.
- **Keeping an LLM honest.** Early runs showed models offering to send messages unprompted, inventing facts about the son, and announcing sends before consent. We moved every one of those decisions into deterministic code.

All of these are written up in our friction log.

## Accomplishments that we're proud of

- A companion that **measures success by real human contact**, not by time on the app.
- A **real, spec-compliant MCP server** that works with a simulated Alexa+ client, our own agent and MCP Inspector alike.
- **Safety that doesn't depend on the model.** Alerts, honesty answers and consent are deterministic, and an urgent alert reached a real phone in 1.6 s in testing.
- A judge-ready demo: one click, a private household per browser tab, no sign-up.

## What we learned

- The most important features of an AI companion are the ones where the AI steps aside: sending a message, making a promise, raising an alarm.
- MCP is a clean seam for this: the same tools and consent rules serve every client.
- Plan limits and regional availability shape the architecture as much as the code does.

## What's next for Haven

- Register the MCP server as a real **Alexa+ add-on** as soon as access opens.
- A consented pilot with real families, measuring change in calls per week.
- More languages for the elder (the app already supports Indian English and Hindi in "Create your own").
- Photo sharing from family into the conversation.
- Production WhatsApp numbers.
- Clinician-reviewed safety rules.

## Built with

alexa-plus (simulated), model-context-protocol, amazon-bedrock, gpt-oss, amazon-nova, amazon-polly, aws-lambda, amazon-dynamodb, amazon-s3, amazon-eventbridge, aws-cdk, aws-systems-manager, amazon-cloudwatch, anam, elevenlabs, whatsapp-cloud-api, typescript, node.js, express, react, vite, zod, google-stitch, claude-code
