# Demo video script (target 2:53, hard limit 2:55)

An emotional story first, with an on-screen **"Under the hood"** chip on each product beat, then a 26-second architecture walkthrough. The builder narrates it in their own voice: warm and unhurried, at about **140 words a minute**.

## Rules for this recording

From the Devpost rules and docs/REQUIREMENTS.md §1.4:

- **No music.** Use only narration and app sound.
- **No third-party logos.** No Alexa, Amazon, Echo, WhatsApp, ElevenLabs or Anam marks anywhere. Write "Alexa+" only as plain text. Keep the browser bookmarks bar, other tabs, extensions, the OS menu bar and the dock out of frame. In the MCP Inspector and terminal shots, crop out any app logo.
- **Label every simulation.** Burn in a lower-third whenever a call, alert or WhatsApp message appears. Use **"Simulated in the demo: no real alert sent"**, **"Simulated in the demo: no real message sent"** or **"Simulated in the demo: no real call made"**. Lower-thirds must show with captions off as well.
- **The Anam AI overlay stays visible.** Never crop, cover or blur the live face's own AI disclosure, or Haven's "Digital Daniel · AI" badge.
- **Fictional family only:** Mary ("Mom"), her son Daniel, in Seattle. The only real person on screen is you, in take B, using your own photo and voice with your own consent. Show no real phone numbers, keys or AWS console account IDs.
- **Record at 1920×1080 in desktop Chrome on the hosted URL**, at 100% zoom with a clean profile: https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/
- **Click Reset demo between takes** (top right), or open a fresh tab. Each tab is its own demo household.
- Keep it in English. Upload it as public on YouTube at least 24 h before the deadline, and check it in a logged-out window.

**How the counts work:** a word is a spoken word, so "Alexa+" counts as 2 ("Alexa plus"), and "MCP", "AWS" and "S3" count as 1 each. At 140 wpm, one word takes 0.43 s. Each line's **window** is the part of the beat where only the narrator speaks. The rest of the beat is app sound (the companion, Mary or Daniel), which captions cover.

---

## Beat sheet

| # | Time | On screen (exact clicks, real UI labels) | "Under the hood" chip | Narration (window · words · spoken length) |
|---|---|---|---|---|
| 1 | **0:00–0:12** | Cold-open card `design/video/open.html` (take A), one 12 s sequence: **"Your mom."**, **"Your grandad."**, **"The friend who moved away."**, **"The neighbour who taught you to ride a bike."**, then **"1 in 6 people worldwide are affected by loneliness."** with the WHO source line. | none | 0:01–0:09 · **18 w ≈ 7.7 s**<br>"There's someone you love who you don't call enough. Not because you don't care. Because life gets full." |
| 2 | **0:12–0:18** | Title card `design/video/title.html`: **Haven**, with the tagline under it. | none | 0:12–0:18 · **14 w ≈ 6.0 s**<br>"Most AI companions want more of their time. Haven wants more of your calls." |
| 3 | **0:18–0:30** | Create-your-own montage (take B): **Create your own**, then the **"… is your"** dropdown cycling through *mother*, *grandfather*, *friend*, *neighbour*, then **Create Digital [name]**. Then **Your face and voice**: choose a photo, tick *"This is a photo of me … labelled AI avatar."*, **Create my avatar**. Next **Start recording**, **Stop (…s)**, tick *"This is my own voice …"*, **Use my voice**. End on *"Your photo avatar is ready."* | ElevenLabs instant voice clone · Anam photo-real avatar · consent recorded | 0:18.5–0:27 · **19 w ≈ 8.1 s**<br>"Set it up for anyone you care about. Your face, your voice, always with consent, and always labelled AI." |
| 4 | **0:30–0:36** | Fresh tab, **Welcome to Haven**. Click **Start demo**, and the three panels appear: *Simulated Alexa+ add-on*, *Mom's tablet*, *Daniel's phone*. | Fictional demo family | 0:30.5–0:34 · **8 w ≈ 3.4 s**<br>"Meet Mary in Seattle, and her son, Daniel." |
| 5 | **0:36–0:48** | Click walkthrough **1. Alexa, talk to Daniel**. Zoom the MCP log as `initialize`, `tools/list` and the `tools/call` lines fill it. The tablet wakes, and the live face says *"Hello Mom! It's Digital Daniel, the AI version of Daniel."* Duck the simulator's own spoken line under the narration. | MCP 2025-11-25 · Streamable HTTP · 8 tools | 0:36–0:43 · **16 w ≈ 6.9 s**<br>"She just asks Alexa. Haven answers as an Alexa+ add-on, through a real MCP server." |
| 6 | **0:48–1:02** | On the tablet, click **Tap and speak** and say into the mic: *"I met my old friend at the market, we used to sing together."* Then click **I'm done speaking**. Cut the "Thinking…" wait. The warm reply plays on the live face. Slow zoom on the **Digital Daniel · AI** badge. | Mic → Lambda → Bedrock gpt-oss-120b (fallback Nova Lite, then rules) → his voice → live face, connected only while speaking | 0:48–0:51 · **7 w ≈ 3.0 s**<br>"She talks, he listens, and it remembers." |
| 7 | **1:02–1:12** | Under **Quick answers**, click **"Are you real?"**. The fixed answer plays: *"I'm Digital Daniel, an AI version of Daniel, made with his permission. I'm not the real Daniel."* Cut the take after that sentence. | Honesty guard: fixed answer, never generated | 1:02–1:05 · **6 w ≈ 2.6 s**<br>"It never pretends to be him." |
| 8 | **1:12–1:21** | Click walkthrough **3. Will you come home?**. The companion says *"That one's for the real Daniel, Mom. I can't promise that, but I'll ask Daniel tonight."* On Daniel's phone, the **Mom asked you** card appears. | Commitment detector → create_deferral | 1:12–1:15.5 · **8 w ≈ 3.4 s**<br>"Some questions only the real Daniel can answer…" |
| 9 | **1:21–1:37** | On the phone's **Mom asked you** card, click **Reply in your own voice** and say *"I'll be home on the 7th, Mom."* Click **Stop and send**. Mute this audio in the edit, so the line is heard only once. On the tablet, **A message from the real Daniel** appears: click **Play**. The card **"The real Daniel, in his own voice"** shows *You asked: "…"* while the AI face dims, and his voice note plays. | Voice note → S3 → play_family_message | 1:21–1:24 · **7 w ≈ 3.0 s**<br>"…so he does, in his own voice."<br>1:31–1:34 · **7 w ≈ 3.0 s**<br>"And she hears him, not the AI." |
| 10 | **1:37–1:47** | Click walkthrough **4. Tell Daniel…**. The **Before I send it** card shows *Send to Daniel: "…"?* and the companion asks *"Shall I send this to Daniel: …?"* Click walkthrough **5. Yes, send it**. It answers *"Done. I've sent it to Daniel."* In the MCP log, point at the two `record_reply` lines. | record_reply: two-step consent enforced by the server | 1:42–1:44.5 · **5 w ≈ 2.1 s**<br>"Nothing leaves without her yes." |
| 11 | **1:47–2:01** | Click walkthrough **7. Help, I feel dizzy**. The tablet shows the calm **Haven Safety** screen: *"Daniel has been alerted."* and *"If you are hurt or in danger, call **911** now."* The companion says *"Daniel has been told. If you are in danger, call 911 now."* On the phone, **Urgent · call now** (*"Mom may need you right now …"*) appears. Click **She's safe, close**. Lower-third: **"Simulated in the demo: no real alert sent"**. | Fixed safety rules, no LLM · one incident at a time · alert in about 1 s | 1:53–1:58 · **11 w ≈ 4.7 s**<br>"If something's wrong, no AI decides. Rules reach Daniel in seconds." |
| 12 | **2:01–2:20** | Click walkthrough **6. Evening update**, and cut the "Writing…" wait. The phone's **Today's update** card fills in. Zoom on **When you call, ask about**, which should show her old friend and the songs. On the phone, click **Call Mom**. The tablet shows **"The real Daniel is calling!"** (*"I'll step aside. Enjoy your chat, Mom."*), and **Real calls this week** goes up by one. Lower-third: **"Simulated in the demo: no real message sent or call made"**. | EventBridge 9 pm → Bedrock digest → WhatsApp (simulated here) | 2:01–2:07 · **13 w ≈ 5.6 s**<br>"Every evening, Daniel gets what mattered in her day, and what to ask."<br>2:07–2:14.5 · **17 w ≈ 7.3 s**<br>"So tonight he doesn't ask, 'How are you?' He asks about her old friend, and the songs." |
| 13 | **2:20–2:46** | The animated architecture diagram `design/video/architecture.html` (take F, about 2:20–2:38). Then 3 s of the **MCP Inspector** listing the 8 tools (2:38–2:41). Then `npm test` passing, *"pass 759 · fail 0"* (2:41–2:46). | none | 2:20.5–2:45.5 · **57 w ≈ 24.4 s**<br>"Under the hood: one AWS Lambda serves a real MCP server. Every turn checks deterministic safety rules first, then Bedrock, with two fallbacks, so she always gets an answer. Voices come from Polly or ElevenLabs, and the live face from Anam only while speaking. State lives in DynamoDB, recordings in S3, and the evening update runs on EventBridge." |
| 14 | **2:46–2:53** | End card `design/video/end.html`: **"Haven didn't replace the call. It started it."**, the hosted URL in plain text, and **Open source · MIT**. Hold it to 2:53. | none | 2:47–2:51 · **8 w ≈ 3.4 s**<br>"Haven didn't replace the call. It started it." |

**Totals:** 2:53 runtime and 221 narrated words. Every line fits its window at 140 wpm. The tightest are beats 2 (6.0 s in 6 s), 5 (6.9 s in 7 s) and 6 (3.0 s in 3 s), so read those three without a pause before the first word.

### Companion and family lines (app audio, captioned)

| Time | Who | Line | Fixed or live |
|---|---|---|---|
| 0:43.5–0:48 | Digital Daniel | "Hello Mom! It's Digital Daniel, the AI version of Daniel." | Fixed greeting |
| 0:51.5–0:55 | Mary (spoken into the tablet mic) | "I met my old friend at the market, we used to sing together." | Your read in take C |
| 0:55–1:02 | Digital Daniel | Warm reply | **Live (Bedrock).** Transcribe it from the take you keep. |
| 1:05–1:12 | Digital Daniel | "I'm Digital Daniel, an AI version of Daniel, made with his permission. I'm not the real Daniel." | Fixed. Cut before "The real Daniel reads…" |
| 1:15.5–1:21 | Digital Daniel | "That one's for the real Daniel, Mom. I can't promise that, but I'll ask Daniel tonight." | Fixed |
| 1:29–1:31.5 | The real Daniel (voice note) | "I'll be home on the 7th, Mom." | Your read in take D |
| 1:37.5–1:42 | Digital Daniel | "Shall I send this to Daniel: '…'?" | Fixed frame, but the message text is live. Transcribe it. |
| 1:44.5–1:47 | Digital Daniel | "Done. I've sent it to Daniel." | Fixed |
| 1:48–1:53 | Digital Daniel | "Daniel has been told. If you are in danger, call 911 now." | Fixed (rules, no LLM). Check the take. |

---

## Recording checklist

Before any take, do a dry run on the hosted URL and allow the microphone once, so Chrome's permission bubble never appears in a take. Set Chrome to 1920×1080 with the bookmarks bar hidden and one tab open. Turn on Do Not Disturb.

**Voice-over** is recorded separately, in a quiet room, with the same mic for every line. Leave 1 s of room tone before and after each line. Read each line three times and keep the warmest. The lines for each take are listed under it.

### Take A: cards (cold open, title, end card)

- **Setup:** The card pages in `design/video/`: `open.html`, `title.html` and `end.html`. Open each one full-screen in Chrome at 1920×1080 (View → Enter Full Screen). Check the comments at the top of each file for any query options.
- **Reset:** Each page plays on load, and **Space** restarts it from the first frame. Start the recorder first, then press Space.
- **Clicks:** `open.html` runs its own 12 s timeline (the four lines, then the statistic at 8 s and the source at 9 s). Record all of it. Then record 6 s of `title.html` and 8 s of `end.html`.
- **Voice-over:**
  1. "There's someone you love who you don't call enough. Not because you don't care. Because life gets full."
  2. "Most AI companions want more of their time. Haven wants more of your calls."
  3. "Haven didn't replace the call. It started it."
- **Check:** The statistic follows the WHO's own wording ("1 in 6 people worldwide is affected by loneliness", WHO news release, 30 June 2025), not the shorter "are lonely".

### Take B: Create your own (0:18–0:30)

- **Setup:** A fresh Chrome tab on the hosted URL. Have one clear, front-facing photo of yourself ready in a folder with nothing else in it. You'll need a quiet room for the voice.
- **Reset:** A fresh tab is a fresh household. For a retake, click **Reset demo** or open a new tab.
- **Clicks:**
  1. **Create your own**.
  2. *Your name*: your own first name (it's your face and voice, so it's your consent). *You are …'s*: **son**.
  3. *Their name*: **Mary**. Open the **"Mary is your"** dropdown and pause on **mother**, **grandfather**, **friend** and **neighbour** for the montage, then settle on **mother**. *What do you call her?*: **Mom**.
  4. **Create Digital [your name]**. You land on **Setup** with **Your face and voice**.
  5. Under **Face**, choose the photo, tick *"This is a photo of me ([name]), and I agree Haven may turn it into a labelled AI avatar."*, then click **Create my avatar**. Cut the wait until *"Your photo avatar is ready."*
  6. Under **Voice**, click **Start recording**, read the script on screen for at least 30 s, then click **Stop (…s)**. Tick *"This is my own voice …"*, then click **Use my voice**. Cut the wait until *"Done. Digital [name] now speaks in your voice (labelled AI)."*
- **Into the app's mic:** Read the on-screen script, starting with *"I am [name], and I agree that Haven may make an AI copy of my voice, only to keep my mother, Mom, company."* Keep this audio out of the final cut, apart from the consent sentence if you want it.
- **Voice-over:** "Set it up for anyone you care about. Your face, your voice, always with consent, and always labelled AI."
- **Note:** This is the only take with a real person. Make sure no other names, emails or files are visible in the file picker.

### Take C: Start demo, steps 1–3 and the live spoken turn (0:30–1:12)

- **Setup:** A fresh Chrome tab on the hosted URL, mic allowed, speakers on, and the screen recorder capturing system audio.
- **Reset:** Use a fresh tab, so the **Welcome to Haven** screen shows. For a retake, click **Reset demo** (and **Start demo** if the welcome screen comes back). **Do not reset between takes C, D and E.** Take E's evening update needs the memory from this take.
- **Clicks:**
  1. **Start demo**. Hold 2 s on the three panels.
  2. Walkthrough **1. Alexa, talk to Daniel**. Wait until the face says "Hello Mom!".
  3. On the tablet, **Tap and speak**. Speak the line below. Then **I'm done speaking**, and wait for the full reply.
  4. **Quick answers** → **"Are you real?"**. Wait for the full answer.
- **Into the app's mic (as Mary, close to the mic, slowly):** "I met my old friend at the market, we used to sing together."
- **Voice-over:**
  1. "Meet Mary in Seattle, and her son, Daniel."
  2. "She just asks Alexa. Haven answers as an Alexa+ add-on, through a real MCP server."
  3. "She talks, he listens, and it remembers."
  4. "It never pretends to be him."
- **Check:** The live face connects (not the illustrated fallback) and its AI disclosure is visible. If the face fails mid-take, redo the take rather than mixing the two avatars in one video. Write down the reply to step 3 word for word, for the captions.

### Take D: family loop, consent and safety (1:12–2:01)

- **Setup:** Continue in the same tab as take C, with no reset.
- **Reset:** For a retake of D only, use a new tab and repeat take C's clicks off camera first.
- **Clicks:**
  1. Walkthrough **3. Will you come home?**. Wait for **Mom asked you** on the phone.
  2. On the phone, **Reply in your own voice**. Speak the line below, then **Stop and send**.
  3. On the tablet, wait for **A message from the real Daniel**, then **Play**. Hold on **"The real Daniel, in his own voice"** until the note ends.
  4. Walkthrough **4. Tell Daniel…**. Wait for **Before I send it** and the spoken question.
  5. Walkthrough **5. Yes, send it**. Wait for *"Done. I've sent it to Daniel."*
  6. Walkthrough **7. Help, I feel dizzy**. Hold on **Haven Safety**, then on the phone's **Urgent · call now**.
  7. On the phone, **She's safe, close**.
- **Into the app's mic (as Daniel, on the phone):** "I'll be home on the 7th, Mom."
- **Voice-over:**
  1. "Some questions only the real Daniel can answer…"
  2. "…so he does, in his own voice."
  3. "And she hears him, not the AI."
  4. "Nothing leaves without her yes."
  5. "If something's wrong, no AI decides. Rules reach Daniel in seconds."
- **Check:** Close the alert in step 7 before take E. An open incident hides the tablet's "is calling" screen. Write down the message text in the **Before I send it** card, for the captions.

### Take E: evening update and the call (2:01–2:20)

- **Setup:** Continue in the same tab, with the incident closed.
- **Reset:** None. If the update doesn't mention the old friend or the songs, redo takes C to E in a fresh tab. The conversation starters come from that memory.
- **Clicks:**
  1. Walkthrough **6. Evening update**. Wait for **Today's update** to fill on the phone.
  2. Scroll the phone to **When you call, ask about**, and hold 3 s.
  3. On the phone, **Call Mom**.
  4. Hold on the tablet's **"The real Daniel is calling!"**. Then show **Real calls this week** on the phone, now one higher.
  5. Optional, for B-roll: open **WhatsApp messages (n)** at the bottom of the phone to show the simulated sends.
- **Into the app's mic:** nothing.
- **Voice-over:**
  1. "Every evening, Daniel gets what mattered in her day, and what to ask."
  2. "So tonight he doesn't ask, 'How are you?' He asks about her old friend, and the songs."

### Take F: architecture, MCP Inspector and npm test (2:20–2:46)

- **Setup:** `design/video/architecture.html` full-screen at 1920×1080. Open it as `architecture.html?wpm=140` so its timeline matches the narration pace. Add `&captions=1` only for rehearsal. A terminal with a large font (at least 20 pt), a plain theme, a clean prompt with no user or host name, and the window sized to 1920×1080. Run it from the repo root.
- **Reset:** Clear the terminal (`clear`) before each run.
- **Clicks:**
  1. Record about 18 s of the diagram animation.
  2. MCP Inspector, using the README command:
     ```bash
     npx @modelcontextprotocol/inspector
     ```
     In the Inspector UI, choose **Streamable HTTP**, paste `https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/mcp`, then **Connect** → **List Tools**. Hold 3 s on the 8 tools, and crop out the Inspector's header logo. For a plain-terminal shot instead, use:
     ```bash
     npx @modelcontextprotocol/inspector --cli https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/mcp --transport http --method tools/list
     ```
  3. Run the tests and hold on the summary (*pass 759 · fail 0*):
     ```bash
     npm test
     ```
- **Into the app's mic:** nothing.
- **Voice-over:** "Under the hood: one AWS Lambda serves a real MCP server. Every turn checks deterministic safety rules first, then Bedrock, with two fallbacks, so she always gets an answer. Voices come from Polly or ElevenLabs, and the live face from Anam only while speaking. State lives in DynamoDB, recordings in S3, and the evening update runs on EventBridge."

---

## Editing notes

- Cut every wait ("Thinking…", "Writing…", "Creating…", the polling delay before cards appear). Cuts are fine as long as each step shows its real result.
- Live Bedrock replies (beats 6 and 10) vary in length. Trim the pause after them rather than speeding up anyone's voice.
- Keep the narration and app audio from overlapping. Where they would, duck the app audio under the narration, as in beat 5.
- Render each chip with `design/video/chip.html?t=<chip text>` (default position bottom-left; `&pos=` and `&label=` are optional). The page is a pure #00ff00 chroma-key plate, so key it out in the edit, and keep it on for the whole beat. Lower-thirds sit bottom-centre, above the captions.
- Check every frame for third-party marks: the browser chrome, the OS menu bar, the Inspector header, any vendor watermark. The Anam AI disclosure is a required overlay. Confirm with Anam and the Devpost forum that showing it is acceptable (open question in REQUIREMENTS §1.4).

## Captions

- The caption file is [video-captions.srt](video-captions.srt). It is timed to the beat sheet above, so **re-time it after the edit**: every cut moves the cues after it. SRT has no comment syntax, so this note lives here rather than in the file.
- Before uploading, replace the two `TODO` cues with the exact words from the takes you keep: the live reply in beat 6, and the message in beat 10. Also check the safety line in beat 11 against take D.
- Captions have at most 2 lines of 42 characters each. Companion and family lines start with a speaker tag such as `[Digital Daniel]`.
- Upload the SRT to YouTube by hand rather than relying on auto-captions. Auto-captions mishear "MCP", "Bedrock", "Anam" and names.
- The lower-thirds are burned into the picture, so they show even with captions off.
