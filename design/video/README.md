# Video card pages

Screen-recordable cards for the Haven demo video. Each page is one self-contained HTML file on a fixed 1920×1080 stage. There are no logos of any kind; product names appear as plain text.

| Page | Length | What it shows |
|---|---|---|
| `open.html` | 12 s | Four lines ("Your mom." … "The neighbour who taught you to ride a bike."), then the WHO statistic |
| `title.html` | 5 s | The Haven house mark, the wordmark and the tagline |
| `architecture.html` | 26 s | The architecture diagram, lit beat by beat to the narration at 140 words a minute |
| `end.html` | 7 s | "Haven didn't replace the call. It started it.", the demo URL and "Open source · MIT" |
| `chip.html` | n/a | An "Under the hood" chip on pure #00ff00, for chroma keying in CapCut or iMovie |

## How to record

1. Serve the folder (the query strings below need a real URL, not `file://`):

   ```bash
   python3 -m http.server 8765 --directory design/video
   ```

2. Open the page in Chrome, for example http://localhost:8765/open.html, and go full screen with Ctrl+Cmd+F (or View → Enter Full Screen). The stage scales to fit the screen and is letterboxed in the page colour, so any screen size works; a 1920×1080 display gives pixel-exact frames.
3. Start QuickTime Player → File → New Screen Recording, choose to record the entire screen, and start recording.
4. Press **Space**. The animation restarts from its first frame (it also plays once on load, so Space is how you get a clean take). The cursor is hidden on the stage.
5. Stop the recording once the final frame has held for a second, and trim the head in the editor.

Each page ends on its final frame and holds it, so a slightly long recording is safe.

### Architecture options

- `architecture.html?wpm=150` retimes every beat for a faster or slower read (default 140). At 140 the narration takes 25.3 s and the page holds to 26 s.
- `architecture.html?captions=1` shows the narration along the bottom with the current word highlighted, for rehearsing. Leave it off for the take.
- `architecture.html?at=12.5` freezes the diagram at 12.5 s, for checking one beat or grabbing a still.

The diagram follows `infra/lib/haven-stack.ts`, `src/lambda/main.ts` and the README. Compared with the beat sheet, it adds three things from the real code: the turn engine and safety rules sit inside the Lambda box with the MCP server, the turn engine calls the MCP tools through an in-process MCP client, and the tablet's mic posts each turn to `/api/turn` (the arc over the top).

## Under the hood chips

`chip.html?t=<text>` sets the detail line. `&pos=bl|br|tl|tr` moves the chip to a corner (default bottom left). The chip slides in on load or on Space, with no fade and no shadow, so the green keys out cleanly. Record a few seconds of each, then key out #00ff00 in the editor (CapCut: Chroma key; iMovie: Green/Blue Screen).

The chip texts from the beat sheet, each with its ready URL:

1. ElevenLabs instant voice clone · Anam photo-real avatar · consent recorded

   ```text
   http://localhost:8765/chip.html?t=ElevenLabs%20instant%20voice%20clone%20%C2%B7%20Anam%20photo-real%20avatar%20%C2%B7%20consent%20recorded
   ```

2. Fictional demo family

   ```text
   http://localhost:8765/chip.html?t=Fictional%20demo%20family
   ```

3. MCP 2025-11-25 · Streamable HTTP · 8 tools

   ```text
   http://localhost:8765/chip.html?t=MCP%202025-11-25%20%C2%B7%20Streamable%20HTTP%20%C2%B7%208%20tools
   ```

4. Mic → Lambda → Bedrock gpt-oss-120b (fallback Nova Lite, then rules) → his voice → live face, connected only while speaking

   ```text
   http://localhost:8765/chip.html?t=Mic%20%E2%86%92%20Lambda%20%E2%86%92%20Bedrock%20gpt-oss-120b%20(fallback%20Nova%20Lite%2C%20then%20rules)%20%E2%86%92%20his%20voice%20%E2%86%92%20live%20face%2C%20connected%20only%20while%20speaking
   ```

5. Honesty guard: fixed answer, never generated

   ```text
   http://localhost:8765/chip.html?t=Honesty%20guard%3A%20fixed%20answer%2C%20never%20generated
   ```

6. Commitment detector → create_deferral

   ```text
   http://localhost:8765/chip.html?t=Commitment%20detector%20%E2%86%92%20create_deferral
   ```

7. Voice note → S3 → play_family_message

   ```text
   http://localhost:8765/chip.html?t=Voice%20note%20%E2%86%92%20S3%20%E2%86%92%20play_family_message
   ```

8. record_reply: two-step consent enforced by the server

   ```text
   http://localhost:8765/chip.html?t=record_reply%3A%20two-step%20consent%20enforced%20by%20the%20server
   ```

9. Fixed safety rules, no LLM · one incident at a time · alert in about 1 s

   ```text
   http://localhost:8765/chip.html?t=Fixed%20safety%20rules%2C%20no%20LLM%20%C2%B7%20one%20incident%20at%20a%20time%20%C2%B7%20alert%20in%20about%201%20s
   ```

10. EventBridge 9 pm → Bedrock digest → WhatsApp (simulated here)

   ```text
   http://localhost:8765/chip.html?t=EventBridge%209%20pm%20%E2%86%92%20Bedrock%20digest%20%E2%86%92%20WhatsApp%20(simulated%20here)
   ```

## Source for the statistic

WHO news release, 30 June 2025: "1 in 6 people worldwide is affected by loneliness" (WHO Commission on Social Connection).
https://www.who.int/news/item/30-06-2025-social-connection-linked-to-improved-heath-and-reduced-risk-of-early-death

The card uses WHO's wording ("are affected by loneliness") rather than "are lonely", so the on-screen line matches the cited source.
