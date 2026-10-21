# Demo video script, v2 (target 2:53, hard limit 2:55)

The video opens on the problem in real numbers, then follows a fictional family:
- Mary, in Seattle, talks hands-free to "Digital Daniel", a clearly labelled AI version of her son;
- Daniel follows along in WhatsApp;
- it ends on the real call that Haven started.

Each product beat carries an on-screen **"Under the hood"** chip; a 30-second architecture walkthrough comes before the close. The builder narrates, warm and unhurried, at about **140 words a minute**. Mary's lines are a **synthetic voice** (ElevenLabs), played into the tablet microphone (see `design/video/mary.html`).

## Rules for this recording

From the Devpost rules and docs/REQUIREMENTS.md §1.4:

- **No music.** Use only narration and app sound.
- **No third-party logos.** No Alexa, Amazon, Echo, WhatsApp, ElevenLabs or Anam marks. Write "Alexa+" and "WhatsApp" only as plain words. The family phone is styled like a chat app (layout only, no logo). Keep the bookmarks bar, other tabs, extensions, the OS menu bar and the dock out of frame. Crop any logo in the MCP Inspector or terminal shots.
- **Label every simulation.** Burn in a lower-third whenever a call, alert or WhatsApp message appears: **"Simulated in the demo: no real message sent"**, **"…no real alert sent"** or **"…no real call made"**. Lower-thirds must show with captions off.
- **Say what is fictional.** In beat 4, burn in **"Mary and Daniel are fictional. Mary's voice is synthetic."** for its whole length.
- **The AI labels stay visible.** Never crop, cover or blur the live face's own AI disclosure, or Haven's "Digital Daniel · AI" badge.
- **Fictional family only:** Mary ("Mom") and her son Daniel, in Seattle. The only real person is you, in take B (your own photo and voice) and as Daniel's voice note in take D. Show no real phone numbers, keys or AWS account IDs.
- **Record at 1920×1080 in desktop Chrome on the hosted URL,** at 100% zoom with a clean profile: https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/
- **Reset only where a take says to.** Each tab is its own demo household. Takes C, D and E must run in **one tab with no reset**, because the evening update needs the earlier conversation.
- Keep it in English. Upload it as public on YouTube by **Thu 22 Oct, 20:00 IST**, and check it in a logged-out window.

**How the counts work:** a word is a spoken word ("Alexa+" counts as 2; "MCP", "AWS" and "S3" as 1 each). At 140 wpm, one word takes 0.43 s. The **window** is the part of a beat where only the narrator speaks; app audio (Daniel's replies, Mary's lines) fills the rest, and captions cover it.

---

## Beat sheet

| # | Time | On screen (real UI labels) | "Under the hood" chip | Narration (window · words · length) |
|---|---|---|---|---|
| 1a | **0:00–0:07** | `open.html` card 1: **"About 1 in 3 adults in the U.S. report feeling lonely."** Source: CDC, 2024. | none | 0:00.5–0:05 · **9 w ≈ 3.9 s**<br>"About one in three adults in America feels lonely." |
| 1b | **0:07–0:14** | Card 2: **"Loneliness can raise the risk of dementia, depression, stroke and heart disease."** Source: CDC, 2024. | none | 0:07.3–0:13.3 · **13 w ≈ 5.6 s**<br>"And loneliness can raise the risk of dementia, depression, stroke and heart disease." |
| 1c | **0:14–0:22** | Card 3: **"About 1 in 5 Americans over 65 don't own a smartphone."** Then **"And their children can't be there every day."** Source: Pew Research, 2026. | none | 0:14.2–0:21.9 · **18 w ≈ 7.7 s**<br>"One in five Americans over sixty-five doesn't own a smartphone. And their children can't be there every day." |
| 2 | **0:22–0:27** | `title.html`: **Haven**, with the tagline | none | 0:22.2–0:26.9 · **11 w ≈ 4.7 s**<br>"Meet Haven. It wants more of your calls, not their time." |
| 3 | **0:27–0:37** | Create-your-own montage (take B):<br>1. **Create your own**.<br>2. The **"… is your"** dropdown cycles through *mother*, *grandfather*, *friend*, *neighbour*.<br>3. **Create Digital [name]**.<br>4. **Your face and voice**: photo, consent tick, **Create my avatar**.<br>5. **Start recording**, **Stop**, consent tick, **Use my voice**.<br>6. End on *"Your photo avatar is ready."* | ElevenLabs instant voice clone · Anam photo-real avatar · consent recorded | 0:27.5–0:34.8 · **17 w ≈ 7.3 s**<br>"Set it up for anyone you care about: your face, your voice, with consent, always labelled AI." |
| 4 | **0:37–0:42** | Fresh tab, **Start demo**. The panels: *Simulated Alexa+ add-on*, *Mom's tablet*, *Daniel's WhatsApp*. Lower-third: **"Mary and Daniel are fictional. Mary's voice is synthetic."** | Fictional demo family | 0:37.5–0:40.9 · **8 w ≈ 3.4 s**<br>"Meet Mary in Seattle, and her son, Daniel." |
| 5 | **0:42–0:51** | Walkthrough **1. Alexa, talk to Daniel**. Zoom the MCP console as `initialize`, `tools/list` and the `tools/call` lines fill it. The tablet wakes, and the live face says *"Hello Mom! It's Digital Daniel, the AI version of Daniel."* | MCP 2025-11-25 · Streamable HTTP · 8 tools | 0:42–0:45.4 · **8 w ≈ 3.4 s**<br>"No app to learn. She just asks Alexa." |
| 6 | **0:51–1:17** | **Hands-free conversation, with no taps.** After the greeting the tablet shows **Listening…** with *"Just talk. I'll answer, then listen again…"*. The status cycles Listening → Thinking → Speaking → Listening, three times. Zoom on the **Digital Daniel · AI** badge during the second answer. Cut the dead air in each "Thinking…". | (a) Hands-free: listens again after each reply, stops when she goes quiet<br>(b) Mic → Lambda → Bedrock gpt-oss-120b (fallbacks: Nova Lite, rules) → his voice → live face, only while speaking<br>(c) Honesty guard: fixed answer, never generated<br>(d) Commitment detector → create_deferral | 0:51–0:53.2 · **5 w ≈ 2.1 s**<br>"No buttons. She just talks."<br>1:13.4–1:16.8 · **8 w ≈ 3.4 s**<br>"What only Daniel can answer, waits for Daniel." |
| 7 | **1:17–1:33** | **Daniel's WhatsApp**: Haven's message **"Mom asked you: 'Will you come home next month?'"** arrives. The bar shows *Replying to: "Will you come home next month?"*. Click the green **mic**, say Daniel's line, click the green **send** arrow; a green bubble with ticks appears. On the tablet: **A message from the real Daniel**, then **Play**. The AI face dims, and the blue card **"The real Daniel, in his own voice"** plays his note. | Voice note → S3 → play_family_message | 1:17–1:22.6 · **13 w ≈ 5.6 s**<br>"Daniel sees it on WhatsApp, at work. He answers in his own voice."<br>1:29.5–1:32.5 · **7 w ≈ 3.0 s**<br>"And she hears him, not the AI." |
| 8 | **1:33–1:45** | Still hands-free: Mary asks to send a message. The tablet shows **Before I send it** with *Send to Daniel: "The roses are blooming"?*. She says yes. In Daniel's WhatsApp, a new message from Haven arrives with her words. Lower-third: **"Simulated in the demo: no real message sent"**. | record_reply: two-step consent enforced by the server | 1:42.4–1:45 · **6 w ≈ 2.6 s**<br>"Nothing is sent without her yes." |
| 9 | **1:45–1:58** | Mary: "Help… I feel dizzy." The tablet shows the calm **Haven Safety** screen: *"Daniel has been alerted."* and *"If you are hurt or in danger, call **911** now."* In Daniel's WhatsApp, a red **Urgent · call now** message arrives with quick-reply buttons; click **She's safe, close**. Lower-third: **"Simulated in the demo: no real alert sent"**. | Fixed safety rules, no LLM · one incident at a time · alert in about 1 s | 1:51.5–1:56.6 · **12 w ≈ 5.1 s**<br>"If something's wrong, no AI decides. Fixed rules reach Daniel in seconds." |
| 10 | **1:58–2:17** | **The payoff.** Walkthrough **6. Evening update**; cut the wait. **Today's update · Mom** arrives in Daniel's WhatsApp. Zoom on **When you call, ask about:**, which should list the song with her old friend and the roses. Click the **Call Mom** quick reply. The tablet shows **"The real Daniel is calling!"** (*"I'll step aside. Enjoy your chat, Mom."*), and the pinned **Real calls with Mom this week** goes up by one. Lower-third: **"Simulated in the demo: no real message sent or call made"**. | EventBridge 9 pm → Bedrock digest → WhatsApp (simulated here) | 1:58.5–2:04.1 · **13 w ≈ 5.6 s**<br>"Every evening, Daniel gets what mattered in her day, and what to ask."<br>2:05–2:12.3 · **17 w ≈ 7.3 s**<br>"So tonight he doesn't ask, 'How are you?' He asks about her old friend, and the songs." |
| 11 | **2:17–2:46** | The animated architecture diagram (`architecture.html?wpm=140`, about 2:17–2:40). Then 3 s of **MCP Inspector** listing the 8 tools (2:40–2:43). Then `npm test`: *pass 760 · fail 0* (2:43–2:46). | none | 2:17.5–2:41.9 · **57 w ≈ 24.4 s**<br>"Under the hood: one AWS Lambda serves a real MCP server. Every turn checks deterministic safety rules first, then Bedrock, with two fallbacks, so she always gets an answer. Voices come from Polly or ElevenLabs, and the live face from Anam only while speaking. State lives in DynamoDB, recordings in S3, and the evening update runs on EventBridge." |
| 12 | **2:46–2:53** | End card `end.html`: **"Haven didn't replace the call. It started it."**, the hosted URL and **Open source · MIT** | none | 2:47–2:50.4 · **8 w ≈ 3.4 s**<br>"Haven didn't replace the call. It started it." |

**Totals:** 2:53 runtime and 220 narrated words. Every line fits its window at 140 wpm. The tightest lines are 1c (7.7 s in 7.7 s) and 2 (4.7 s in 4.7 s): start them without a pause.

### App audio (captioned)

| Time | Who | Line | Fixed or live |
|---|---|---|---|
| 0:45.5–0:51 | Digital Daniel | "Hello Mom! It's Digital Daniel, the AI version of Daniel." | Fixed greeting |
| 0:53.5–0:57.5 | Mary (synthetic voice, clip 1) | "I met my old friend at the market today. We used to sing together." | Clip |
| 0:58–1:02 | Digital Daniel | Warm reply, e.g. "That sounds lovely, Mom. Singing with a friend must have brightened your day." | **Live (Bedrock).** Transcribe it from your take. |
| 1:02.5–1:04 | Mary (clip 2) | "Are you real?" | Clip |
| 1:04–1:08.5 | Digital Daniel | "I'm Digital Daniel, an AI version of Daniel, made with his permission. I'm not the real Daniel." | Fixed. Cut before "The real Daniel reads…" |
| 1:09–1:10.5 | Mary (clip 3) | "Will you come home next month?" | Clip |
| 1:10.5–1:13.4 | Digital Daniel | "That one's for the real Daniel, Mom. I can't promise that, but I'll ask Daniel tonight." | Fixed |
| 1:23–1:25.5 | The real Daniel (your voice) | "I'll be home on the 7th, Mom." Record it in WhatsApp in take D; it plays back on the tablet at about 1:26.5–1:29. | Your read |
| 1:33.5–1:36 | Mary (clip 4a) | "Tell Daniel the roses are blooming." | Clip |
| 1:36.5–1:39 | Digital Daniel | "Shall I send this to Daniel: 'The roses are blooming'?" | Fixed (her own words) |
| 1:39.5–1:40.5 | Mary (clip 4b) | "Yes, send it." | Clip |
| 1:40.5–1:42.2 | Digital Daniel | "Done. I've sent it to Daniel." | Fixed |
| 1:45.5–1:47.5 | Mary (clip 5) | "Help… I feel dizzy." | Clip |
| 1:47.5–1:51.3 | Digital Daniel | "Daniel has been told. If you are in danger, call 911 now." | Fixed (rules, no LLM) |

---

## Recording checklist

**Before any take:**
- Do a dry run on the hosted URL and allow the microphone once, so Chrome's permission bubble never appears in a take.
- Set Chrome to 1920×1080 with the bookmarks bar hidden and one tab open. Turn on Do Not Disturb.

**Mary's voice:**
- Serve the cue board: `python3 -m http.server 8765 --directory design/video`.
- Open `http://<your-laptop-ip>:8765/mary.html` on a phone, or `localhost` on a second laptop.
- Hold the phone speaker about 30 cm from the laptop mic, in a quiet room, and press each clip when the tablet shows **Listening…**.
- If recognition mishears a clip, play it again, or type the same line into the tablet's **Or type here…** box. As a last resort, use the matching walkthrough button.

**Voice-over:** record it separately, in a quiet room, with the same mic for every line. Leave 1 s of room tone around each line. Read each line three times and keep the warmest.

### Take A: cards (0:00–0:27 and 2:46–2:53)
- **Setup:** `open.html`, `title.html` and `end.html`, served as above. Full-screen each one at 1920×1080.
- **Reset:** each page plays on load; **Space** restarts it from the first frame. Start the recorder, then press Space.
- **Record:** all 20 s of `open.html` (card 1 to 6.6 s, card 2 to 13.4 s, card 3 from 13.8 s with its second line at 16.6 s). Hold to 22 s in the edit. Then about 6 s of `title.html` and 8 s of `end.html`.
- **Voice-over:** lines 1a, 1b, 1c, 2 and 12 from the beat sheet.

### Take B: Create your own (0:27–0:37)
- **Setup:** a fresh tab on the hosted URL. One clear, front-facing photo of yourself, in an otherwise empty folder.
- **Clicks:**
  1. **Create your own**.
  2. Your name; *You are …'s*: **son**.
  3. *Their name*: **Mary**. Open the **"Mary is your"** dropdown and pause on **mother**, **grandfather**, **friend** and **neighbour**, then choose **mother**. *What do you call her?*: **Mom**.
  4. **Create Digital [name]**. You land on **Your face and voice**.
  5. Choose the photo, tick the consent, **Create my avatar**. Cut the wait.
  6. **Start recording**, read the on-screen script for 30 s or more, **Stop**, tick the consent, **Use my voice**. Cut the wait.
- **Voice-over:** line 3.
- **Check:** no other names, emails or files are visible in the file picker.

### Take C: Start demo, Alexa and the hands-free conversation (0:37–1:17)
- **Setup:** a fresh tab, mic allowed, speakers on, the recorder capturing system audio, the cue board ready.
- **Clicks and cues:**
  1. **Start demo**. Hold 2 s on the panels.
  2. Walkthrough **1. Alexa, talk to Daniel**. Wait for "Hello Mom!".
  3. When **Listening…** shows, play **clip 1**. Wait for the reply, until **Listening…** shows again.
  4. Play **clip 2** ("Are you real?"). Wait for the answer, then **Listening…**.
  5. Play **clip 3** ("Will you come home next month?"). Wait for the answer.
- **Do not reset** after this take; take D continues in the same tab.
- **Voice-over:** lines 4, 5 and 6.
- **Check:** the live face connects (not the illustrated fallback), and its AI disclosure is visible. If the face fails, redo the take. Write down the live reply to clip 1 word for word, for the captions.

### Take D: WhatsApp voice reply, consent and safety (1:17–1:58)
- **Setup:** the same tab as take C.
- **Clicks and cues:**
  1. In Daniel's WhatsApp, find **Mom asked you**. Click the green **mic** and say *"I'll be home on the 7th, Mom."* Click the green **send** arrow. Mute this live audio in the edit, so the line is heard once, on the tablet.
  2. On the tablet, wait for **A message from the real Daniel**, then click **Play**. Hold until the note ends. Hands-free listening resumes afterwards.
  3. At **Listening…**, play **clip 4a** ("Tell Daniel the roses are blooming."). Wait for *"Shall I send this to Daniel…?"* and the **Before I send it** card.
  4. Play **clip 4b** ("Yes, send it."). Wait for *"Done. I've sent it to Daniel."* and the new message in Daniel's WhatsApp.
  5. At **Listening…**, play **clip 5** ("Help… I feel dizzy."). Hold on **Haven Safety**, then on the red **Urgent · call now** message in Daniel's WhatsApp.
  6. Under that message, click **She's safe, close**. The tablet's safety screen clears.
- **Voice-over:** lines 7, 8 and 9.
- **Check:** close the alert before take E, because an open alert hides the tablet's "is calling" screen.

### Take E: evening update and the call (1:58–2:17)
- **Setup:** the same tab, with the alert closed.
- **Clicks:**
  1. Walkthrough **6. Evening update**. Wait for **Today's update · Mom** in Daniel's WhatsApp.
  2. Hold 3 s on **When you call, ask about:**. It should mention the song with her old friend and the roses. If not, click **Send today's update now** in the chat for a new one.
  3. Click the **Call Mom** quick reply under it.
  4. Hold on the tablet's **"The real Daniel is calling!"**. Then show the pinned **Real calls with Mom this week**, now one higher.
- **Voice-over:** line 10.

### Take F: architecture, MCP Inspector and tests (2:17–2:46)
- **Setup:** `architecture.html?wpm=140`, full-screen. A terminal with a large font (20 pt or more), a plain theme and a clean prompt (no user or host name), opened at the repo root.
- **Record:**
  1. About 23 s of the diagram.
  2. The MCP Inspector: run `npx @modelcontextprotocol/inspector`, choose **Streamable HTTP**, paste `https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/mcp`, then **Connect** and **List Tools**. Hold 3 s on the 8 tools, and crop the Inspector's header logo. Alternatively, use the plain-terminal command:
     ```bash
     npx @modelcontextprotocol/inspector --cli https://uzm23d4tzykddxqnkq4lld5zva0ixbbl.lambda-url.ap-south-1.on.aws/mcp --transport http --method tools/list
     ```
  3. `npm test`, holding on the summary: *pass 760 · fail 0*.
- **Voice-over:** line 11.

---

## Editing notes
- Cut every wait ("Thinking…", "Writing…", "Creating…", polling delays). Each step must still show its real result.
- In beat 6, cut the listening gaps between Mary's lines down to about half a second. Keep one full **Listening…** moment, so viewers see the tablet listening by itself.
- Keep narration and app audio from overlapping. Where they would, duck the app audio.
- Render each chip with `design/video/chip.html?t=<chip text>` (see `design/video/README.md`) and key out the #00ff00. Keep each chip on for its whole beat. In beat 6, change the chip at each exchange: (a) at the first Listening, (b) at the first reply, (c) at "Are you real?", (d) at "Will you come home?".
- Check every frame for third-party marks: the browser chrome, the OS menu bar, the Inspector header, any vendor watermark. The live face's AI disclosure is required and stays.

## Captions
- The caption file is `docs/video-captions.srt`. It is timed to this beat sheet, so **re-time it after the edit**.
- Replace the one `TODO` cue with the live reply from your take (beat 6, clip 1).
- Captions have at most 2 lines of 42 characters. Speaker tags: `[Digital Daniel]`, `[Mary · synthetic voice]`, `[The real Daniel]`.
- Upload the SRT to YouTube by hand; auto-captions mishear "MCP", "Bedrock", "Anam" and names.
- The lower-thirds are burned into the picture, so they show with captions off.

## Sources for the opening cards
- CDC, *Health Effects of Social Isolation and Loneliness* (updated 15 May 2024): https://www.cdc.gov/social-connectedness/risk-factors/index.html. It says "About 1 in 3 adults in the U.S. report feeling lonely", and that isolation and loneliness can increase the risk of heart disease and stroke, depression and anxiety, and dementia.
- Pew Research Center, *Americans' Use of Mobile Devices in 2026* (19 Oct 2026): https://www.pewresearch.org/internet/fact-sheet/mobile/. It finds that 79% of adults 65+ own a smartphone, so about 1 in 5 don't.
