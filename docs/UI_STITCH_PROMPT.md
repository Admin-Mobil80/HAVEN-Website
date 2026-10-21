# Haven: prompts for Google Stitch

Paste the brief first, then one screen prompt at a time. Stitch gives better results one screen at a time.

---

## 1. Project brief (paste first)

Design a web app called **Haven**, built for the Amazon Alexa+ hackathon.

**What it does:** Haven keeps a lonely older person company when their family can't be there. The older person talks to "Digital Daniel", a clearly labelled AI version of the family member who set it up. Each evening the family member gets a short update, plus ideas for what to talk about on their next call. They also get an urgent "call now" alert if something is wrong. The pitch: "Most AI companions want more of your loved one's time. Haven wants more of your calls." Haven makes families call more, not less.

**Who uses it:**
- **The older person (70+)**, on a tablet. They may have weak eyesight, shaky hands and little tech experience. They need very large text, one obvious button at a time, high contrast and no clutter.
- **The family member (30–55)**, on their phone. They are busy and want to glance at the screen and act.
- **Hackathon judges**, on a laptop. They see all three devices side by side on one page and click through a scripted demo.

**Feel:** warm, calm and human, like a kind neighbour, not a hospital and not a tech startup. It should feel trustworthy and gentle, with a little joy. Avoid cold blues and clinical whites, neon, and dark "AI" looks. Use soft, rounded shapes and a generous amount of space.

**Must-haves on every screen:**
- **AI label:** wherever the companion's face appears, show a clear badge reading "Digital Daniel · AI". Honesty is a core value.
- **Separate visual languages** for:
  - the AI companion (warm brand colour);
  - the real family member's own voice and messages (a distinct, trustworthy colour such as deep blue);
  - safety alerts (red, used only for emergencies);
  - success and confirmations (green).
- **Accessibility:** WCAG AA contrast or better, tap targets of at least 48 px (64 px or more on the tablet), and minimum text sizes of 20 px on the tablet and 16 px elsewhere. Never rely on colour alone.
- **Themes:** design both light and dark themes.
- **Device widths:** laptop at 1440 px, tablet at 1024 px, phone at 390 px.

**Design system to produce:**
- a colour palette with named tokens (background, surface, ink, muted, brand, real-family, success, warning, danger, focus);
- a type scale using a friendly, highly legible sans-serif;
- corner radius, shadows and spacing.

**Components to design:**
- primary, secondary, ghost, danger, "yes" and huge buttons;
- chips;
- cards, including an alert card;
- a status pill: Asleep / Ready / Listening… / Thinking… / Speaking;
- a metric tile;
- text inputs, selects and checkboxes;
- a pronoun picker (she/her, he/him, they/them chips);
- a collapsible log row.

**Demo data to use:** son Daniel; his mother Mary, whom he calls "Mom"; Seattle. She loves her rose garden, big band music, baking for the grandkids and old Hollywood movies.

---

## 2. Start screen (laptop)

**Header bar:**
- Haven logo mark and name, with the tagline "Most AI companions want more of your loved one's time. Haven wants more of your calls."
- Tabs on the right: "Demo" and "Setup", plus a ghost "Reset demo" button.
- A thin notice below the header: "A private demo household for this browser tab. Haven's companion is an AI and always says so."

**Centre:**
- Card titled "Welcome to Haven", with one short paragraph about what Haven does.
- Two large side-by-side choice cards:
  - **"Start demo":** a landscape photo of a friendly man in his 30s (Digital Daniel) and the text "Meet Digital Daniel, keeping his mother Mary company in Seattle. A fictional family with a stock AI face and voice. Ready in one click."
  - **"Create your own":** a big "+" illustration and the text "Enter your name and who Haven is for, then add your own photo and voice. About two minutes."
- Hover and focus states on both cards.

---

## 3. Create your own: setup form (laptop, single column, max width 720 px)

**Title:** "Create your own", with "takes a minute" beside it.

**Section "You":**
- Your name.
- "You are their…" select: son, daughter, grandson, granddaughter, nephew, niece, friend, neighbour, other.
- Pronoun chips.

**Section "Who Haven is for":**
- Their name.
- "They are your…" select: mother, father, grandmother, grandfather, aunt, uncle, friend, neighbour, other.
- "What do you call them?" (placeholder "e.g. Mom, Grandma, Nana, or their name").
- Pronoun chips.
- City (optional).
- Language select: English (US), English (India), Hindi.
- "Things they love to talk about" (textarea).

**Bottom:**
- Huge primary button "Create Digital <name>".
- Helper text: "Next you can add your photo and voice."
- "← Back" link.

---

## 4. Demo page (laptop, the main judging screen)

Keep the same header as the start screen.

**Step bar:** a horizontal row of pill buttons (dashed outline, brand colour) that walk through the story:
1. Alexa, talk to Daniel
2. A memory
3. Will you come home?
4. Tell Daniel…
5. Yes, send it
6. Evening update
7. Help, I feel dizzy

**Three columns below:**

**Left column, two stacked panels:**
- **"Simulated Alexa+ add-on"** (subtitle "real MCP client"):
  - an Alexa-style glowing light ring that pulses while busy;
  - last-heard text, e.g. "Try: 'Alexa, talk to Daniel'";
  - a primary button "'Alexa, talk to Daniel'" and a "🎤 Speak" button;
  - a text input "Any messages for me?" with Send.
- **"MCP activity"** (subtitle "spec 2025-11-25 · Streamable HTTP"): a compact developer log. Each row shows a time, a source tag (Alexa+ / tablet / agent / rule / family, each a different colour), a direction arrow and a title, e.g. "tools/call get_elder_context". Rows expand to show JSON. Error rows are tinted red.

**Middle column: "Mom's tablet"**, the hero of the page:
- A status pill (Speaking).
- A large rounded square showing the companion's face (photo-real video of Daniel), with the badge "Digital Daniel · AI" overlaid at the bottom centre.
- A large caption under the face: "Hello Mom! It's Digital Daniel, the AI version of Daniel. How are you feeling today?"
- A smaller "You: …" line showing what Mom said.
- One huge full-width button "🎤 Tap and speak".
- A text input "Or type here…" with Send.
- Suggestion chips: "I met my old friend today", "Tell Daniel the flowers have bloomed", "Will you come home next month?", "Are you real?"
- When a message from the real family member is waiting: a distinct blue button "▶ A message from the real Daniel".

**Right column: "Daniel's phone"**, drawn inside a phone frame (subtitle "Haven for family"):
- A metric tile: big number "3 / 4", labelled "real calls with Mom this week", with small text "before Haven: 1/week · 2 prompted by Haven".
- **"Today's update · 9:00 PM"** card: a two-sentence summary, a small audio player, a list "When you call, ask about:" with three conversation starters, and a ghost button "Send today's update now".
- **"Mom asked you"** card: the question "Will you come home next month?", with a record-a-voice-reply button and a text-reply field.
- Two buttons side by side: "I'll call tonight" and a green "📞 Call Mom".
- A collapsible "WhatsApp messages (4)" list of sent messages, each with a small status tag (sent / delivered / simulated).

---

## 5. Tablet states (tablet, 1024 × 768, full screen, no laptop chrome)

Design these variants of "Mom's tablet":

1. **Asleep:** a calm still photo of Daniel with the AI badge, the caption "Say 'Alexa, talk to Daniel', or tap the button." and one huge button "Talk to Daniel".
2. **Listening:** the face, a pulsing "Listening…" pill, the live transcript in large text, and the button changed to "Done".
3. **Thinking:** a soft animated indicator and the pill "Thinking…".
4. **Real family message playing:** the AI face dims and steps back. A blue card shows "From the real Daniel, in his own voice", with the message text. This must clearly look like the real person, not the AI.
5. **Family is calling:** a full overlay with a phone icon, "The real Daniel is calling!", "I'll step aside. Enjoy your chat, Mom." and a "Call ended" button.
6. **Safety alert:** a red-accented but calm overlay. Kicker "Haven Safety", big text "Daniel has been alerted.", and "If you are hurt or in danger, call 112 now." It should be reassuring, not scary.
7. **Confirm before sending:** a card "Send to Daniel: 'The flowers in the garden have bloomed'?" with big "Yes, send it" (green) and "No" buttons.

---

## 6. Family phone (phone, 390 px, full screen)

The same content as the right column of the demo page, as a native-feeling mobile app screen, with these additions:
- At the top, an **urgent alert card** in red: kicker "Urgent · call now", "Mom may need you right now (dizziness)", the small text "Detected 8:42 PM by Haven's safety rules. Haven is an AI and can be wrong.", and buttons "Calling now", "Call Mom" and "She's safe, close". Below that, a short timeline of events.
- A variant of the same card once acknowledged ("Alert · you're on it"), in a calmer tone.

---

## 7. Setup: "Your face and voice" and "Teach Haven about Mom" (laptop)

**Panel 1, "Your face and voice"** (subtitle "optional · always labelled AI"), two columns:

**Face:**
- "Now: your photo-real avatar".
- Photo tips: good light, plain background, a soft natural smile.
- A file picker with a square crop preview.
- A consent checkbox: "This is a photo of me (Daniel), and I agree Haven may turn it into a labelled AI avatar."
- A primary button "Create my avatar" and a ghost button "Use the illustration".

**Voice:**
- "Now: Chris (stock voice)".
- A recorder card showing a short script to read aloud in a quoted block, a red record button with a timer ("■ Stop (34s)"), and an audio preview.
- A consent checkbox and the button "Use my voice".
- A collapsible "Or pick a voice" list of voices, each with name, accent and gender, a play preview and a "Use" button.

**Panel 2, "Teach Haven about Mom"** (subtitle "only Daniel can change this"), a grid of four cards:
- **Mom:** name, what you call her, relation, pronoun chips, city, "Things Mom loves" (one per line).
- **You:** your name, relation, pronouns, "Words you use with her", tone, "Digital Daniel must never…".
- **Always pass these to the real you:** checkboxes for plans, visit, money, health, family and promise, plus "Topics to avoid". Helper text: "Digital Daniel says 'let me check with the real Daniel' instead of answering."
- **Calls and consent:** number inputs "Calls a week today" and "Your goal", and two consent checkboxes, one for the AI likeness and one for sharing a daily summary.

A Save button at the bottom, with a status message.
