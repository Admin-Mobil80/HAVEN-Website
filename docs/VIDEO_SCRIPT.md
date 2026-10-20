# Demo video script (target 2:50, hard limit 2:55)

**Rules for this recording** (from the Devpost rules and docs/REQUIREMENTS.md §1.4):

- No Alexa, Amazon, Echo or WhatsApp logos anywhere on screen. Write "Alexa+" only as plain text. Keep browser bookmarks, tabs and the dock out of frame.
- **No music.** Use narration and app sound only.
- Use only the fictional demo family (Daniel, Margaret/"Mom", Seattle). Show no real phone numbers, keys or AWS console account IDs.
- Label everything simulated. Use a lower-third caption whenever a call or a WhatsApp message appears: **"Simulated in the demo: no real call / message sent"**.
- The Anam avatar's own AI disclosure stays on. Do not crop or cover it.
- Record at 1920×1080 in desktop Chrome on the hosted URL, with a fresh tab. Click **Reset demo** before each take.
- Keep it in English, upload it public on YouTube or Vimeo at least 24 h before the deadline, and check it in a logged-out window.

**Timing:** 13 beats. The cumulative time is the end of each beat. Narration runs at about 150 words a minute, so each line fits its slot.

---

| Time | On screen (actions) | Narration (voice-over) |
|---|---|---|
| **0:00–0:12** | Title card on a plain warm background: "Haven", with the tagline below. No logos. | "Most AI companions want more of your loved one's time. Haven wants more of your calls." |
| **0:12–0:30** | Hosted page, start screen. Hover over the **Start demo** card (the Digital Daniel still with its "Digital Daniel · AI" badge). Click **Start demo**. | "Haven keeps an older parent company when family can't be there. Margaret lives alone in Seattle. Her son Daniel set Haven up. She talks to Digital Daniel: an AI version of him, and it always says so." |
| **0:30–0:42** | The three-panel demo page. Slowly point the cursor at each panel in turn: Simulated Alexa+ add-on with the MCP log, Mom's tablet, Daniel's phone. Zoom the top notice line. | "On the left, a simulated Alexa+ add-on. It's our own code, not an Amazon product, and a real MCP client. In the middle, Mom's tablet. On the right, Daniel's phone." |
| **0:42–1:00** | Click walkthrough **1. Alexa, talk to Daniel**. Zoom into the MCP log as `initialize`, `tools/list` and three `tools/call` lines appear. Then the tablet wakes. | "Mom says, 'Alexa, talk to Daniel.' The client connects to Haven's MCP server, spec 2025-11-25: initialize, list the eight tools, then fetch her memories, reminders and family messages. Then it hands her to the tablet." |
| **1:00–1:14** | Click **2. A memory**. The live face speaks the reply. Zoom on the **"Digital Daniel · AI"** badge. | "She shares a memory. Digital Daniel answers warmly and remembers it for next time. The AI badge never leaves the screen." |
| **1:14–1:28** | Type or say **"Are you real?"** on the tablet. Show the caption of the fixed answer. | "And if she asks whether it's really him, the answer is fixed, never improvised: it's an AI version of Daniel, made with his permission, not the real Daniel." |
| **1:28–1:42** | Click **3. Will you come home?**. Show the reply, then the question appearing on Daniel's phone. | "Some questions only a person can answer. Digital Daniel won't promise a visit. It passes the question to the real Daniel." |
| **1:42–2:00** | Click **4. Tell Daniel…**, and show "Shall I send this?". Then click **5. Yes, send it**, and show the message arriving on Daniel's phone. In the MCP log, point at `record_reply` twice. | "She asks to send him a message. Haven checks first, and nothing leaves until she says yes. Two steps, enforced by the server, not the model." |
| **2:00–2:16** | Click **6. Evening update**. Daniel's phone shows the evening update and voice note. Open the **WhatsApp messages** list. Lower-third: **"Simulated in the demo: no real message sent."** | "Each evening, Daniel gets a short update written on Amazon Bedrock, with a voice note and ideas for tonight's call. Real families get it on WhatsApp. Here it's simulated and mirrored on his phone." |
| **2:16–2:36** | Click **7. Help, I feel dizzy**. The tablet's safety panel shows "call 911". Daniel's phone shows **Urgent · call now**. Tap **Calling now**. The tablet shows the real Daniel calling. Lower-third: **"Simulated call in the demo."** | "If something's wrong, no AI decides. Fixed safety rules alert Daniel straight away, and Mom is told to call 911 if she's in danger. One tap, and she knows her son is calling." |
| **2:36–2:44** | Daniel's phone: zoom on **Real calls this week** and "prompted by Haven". | "That's the number Haven is built to grow: real calls, not screen time." |
| **2:44–2:52** | Plain architecture slide in text only, with no logos: "MCP server · Lambda · Bedrock (gpt-oss-120b → Nova Lite → rules) · Polly · DynamoDB · S3 · EventBridge". | "One Lambda on AWS, a real MCP server, Bedrock with deterministic fallbacks, and safety that never depends on the model." |
| **2:52–2:55** | End card: "Haven", the hosted URL in plain text, and "Open source · MIT". | "Haven. Built to bring families closer." |

---

## Recording notes

- **Steps 2 to 5 depend on live Bedrock replies.** If a reply runs long, trim the pause after it in the edit rather than speeding up the narration.
- **"Are you real?"** is not a walkthrough button. Use the tablet's text box or the microphone. Rehearse it so the fixed answer is visible on screen.
- If the live face fails during a take, the illustrated avatar appears with the same badge. Retake rather than mixing the two in one video.
- Cut dead time between clicks. Cuts are fine as long as each step shows its real result.
- Check every frame for third-party marks: the browser chrome, the OS menu bar, any vendor watermark. The Anam AI disclosure is a required overlay. Confirm with Anam and the Devpost forum that showing it is acceptable (open question in REQUIREMENTS §1.4).

## Captions

- Upload a hand-checked English caption file (SRT) built from the narration column above, rather than relying on auto-captions. Auto-captions mishear "MCP", "Bedrock", "gpt-oss" and names.
- Burn in the on-screen lower-thirds ("Simulated in the demo…") so they also appear when captions are off.
- Keep caption lines to 2 lines of at most 42 characters, and time them to the narration.
- Caption the companion's spoken replies too, because judges may watch muted. The tablet already shows its own captions on screen, so make sure they stay in frame and readable.
