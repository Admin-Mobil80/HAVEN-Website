# Devpost submission draft

Paste each section into the matching field of the Devpost form. Items marked **TODO** need you before you submit.

---

## Form fields

**Project name:** Haven

**Tagline (elevator pitch):** Most AI companions want more of your parents' time. Haven wants more of your calls.

**Primary track:** Alexa+ (a real MCP server, spec 2025-11-25, plus a clearly labelled simulated Alexa+ client)

**Mini challenge:** AWS Builder. The "which AWS services and how" answer is the first section of [PRODUCT_FEEDBACK.md](../PRODUCT_FEEDBACK.md).

**Video:** **TODO** the public YouTube link to the final cut (2:39.5).

**Try it:** https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/

**Code:** https://github.com/Admin-Mobil80/HAVEN-Website (MIT)
- **TODO** The repo is private today (the public URL returns 404). Make it public before submitting, or invite all seven reviewers (see docs/REQUIREMENTS.md §1.3). Do this yourself; it isn't something to hand to an agent.

**Friction log:** [FRICTION_LOG.md](../FRICTION_LOG.md), 17 entries in the six-field format.

**Product feedback:** [PRODUCT_FEEDBACK.md](../PRODUCT_FEEDBACK.md), covering every tool, API and SDK we used.

**Pre-existing work:** None. Haven was started for this hackathon. The first commit is 16 Oct 2026, and the full history is in the repo.

**Built with (tags):** alexa-plus, model-context-protocol, amazon-bedrock, gpt-oss, amazon-nova, amazon-polly, aws-lambda, amazon-dynamodb, amazon-s3, amazon-eventbridge, aws-cdk, aws-systems-manager, amazon-cloudwatch, anam, elevenlabs, whatsapp-cloud-api, typescript, node.js, express, react, vite, zod, google-stitch, claude-code

---

## Testing instructions (for judges)

No sign-up, no keys. Use desktop Chrome or Edge with sound on.

1. Open the link and click **Start demo**. Each browser tab gets its own private, fictional household: Daniel and his mother Mary in Seattle.
2. Three panels appear:
   - the **Simulated Alexa+ add-on**, with a live log of every MCP message;
   - **Mom's tablet**, where she talks to "Digital Daniel · AI";
   - **Daniel's WhatsApp**, the family's view (simulated in the demo; nothing goes to a real phone).
3. Click the walkthrough buttons 1 to 7 in order:
   1. Alexa, talk to Daniel (MCP `initialize`, `tools/list`, `tools/call`);
   2. a memory;
   3. a promise that waits for the real Daniel;
   4. and 5. a message sent only after Mom says yes;
   6. the evening update;
   7. "Help, I feel dizzy".
4. Or just talk. After "Alexa, talk to Daniel" the tablet is hands-free: it listens again after each reply and stops when she goes quiet. This needs microphone permission.
5. **Create your own** on the start screen builds a household from your own names, with an optional photo, voice and a Voice ID note, each with a consent tick. The video's family (Arjun and his Ma in Kolkata) was made this way.
6. To test the MCP server directly, point MCP Inspector or any client at `…/mcp`. Streamable HTTP, no auth; it serves a shared public demo household. You'll see 8 tools.

**Reset demo** (top right) starts over.

---

## Story (the "About the project" field, Markdown)

### Inspiration

Our parents live in other cities. Days go by without a call, and when we do call, it's "Hi, how are you?" "Fine." Then the call ends, and neither side has really said anything.

That is a small sadness for us. For them it can be a health problem:
- Nearly 1 in 5 Indians over 45 report feeling lonely (Longitudinal Ageing Study in India, Wave 1).
- In the US, about 1 in 3 adults aged 50 to 80 feel lonely (University of Michigan National Poll on Healthy Aging, 2024).
- Loneliness is linked to a higher risk of dementia, heart disease, stroke and depression (US Surgeon General's advisory, 2023; WHO Commission on Social Connection, 2025).
- Many older people can't use smartphone apps. Voice works for them.

AI companions are the obvious answer, and a worrying one. A companion that is always available and always agreeable can quietly replace the people it should lead back to.

So we built the opposite: **a companion whose job is to make itself less necessary.** Haven's success metric isn't time spent talking to the AI. It is **real calls per week from family**.

### What it does

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

### How we built it

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

### Challenges we ran into

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

### Accomplishments that we're proud of

- A companion that **measures success by real human contact**, not by time on the app.
- A **real MCP server** that works with a simulated Alexa+ client, our own agent and MCP Inspector alike.
- **Safety that doesn't depend on the model.** Alerts, honesty answers and consent are deterministic. In testing, an urgent alert reached a real phone in 1.6 s.
- A judge-ready demo: one click, a private household per browser tab, no sign-up. You can also create your own family with your own face and voice, with consent.

### What we learned

- The most important moments in an AI companion are the ones where the AI steps aside: making a promise, sending a message, raising an alarm.
- MCP is a clean seam for this: one set of tools and consent rules serves every client.
- Plan limits and regional availability shape the architecture as much as the code does.

### What's next for Haven

- Ship the MCP server as a real **Alexa+ add-on** as soon as access opens.
- **Voice ID: answer only the person it's for.** Check each speaker against the enrolled voice note before sharing anything personal. Alexa's own speaker recognition comes first if Alexa+ passes it to add-ons; an on-device check is the fallback. Safety never depends on it: "help" from anyone still reaches the family.
- A consented pilot with real families, measuring the change in calls per week.
- More languages for the elder; Hindi and Indian English already work in "Create your own".
- Photo sharing from family into the conversation, and clinician-reviewed safety rules.

---

## About the video (optional notes for the description)

The family in the video is fictional. Arjun's face is a generated photo, turned into a live Anam avatar with the app's own consent flow. Every voice in the demo is synthetic (ElevenLabs), except the two of us in the closing pitch. The demo is a live recording of the hosted app, with one scripted input: Ma's speech-to-text was typed in rather than spoken, because the recording machine's speakers and microphone were the same headset. Everything after the transcript is the real app and the real server. The WhatsApp screens are the app's simulated family view; nothing is sent to a real phone in the demo.
