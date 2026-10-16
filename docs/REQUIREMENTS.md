# READ FIRST: review corrections that override the body below

The body of this document was produced by a research pass and then reviewed by an independent critic. Where the two disagree, **this section wins**.

1. **Private-repo invites (section 1.3).** The body says to send GitHub invites "at submit time". Invites expire after 7 days, but judging starts 9 Nov (Rules) or possibly 26 Oct (Schedule tab). Invites sent on 22-23 Oct would lapse before judges look. **Use a public repo with a license.** If you must go private, re-send invites around 9 Nov and confirm acceptance in the repo's Collaborators list.
2. **MCP protocol version.** Devpost names 2025-11-25 ("or later, once confirmed"). Target exactly 2025-11-25 and pin SDK versions on server and client. Supporting 2025-03-26 does not satisfy Devpost's wording. The current MCP spec (2026-07-28) has no initialize handshake. Test with the newest MCP Inspector and ask staff at Office Hours which version judging clients speak.
3. **AWS India (AISPL) and Claude on Bedrock.** The body says invoice payment is "the fix". That is only partly documented. Community reports show Indian accounts failing with INVALID_PAYMENT_INSTRUMENT with no confirmed fix. Run a real Claude invoke in hour 1, and design the AWS Builder evidence around a non-Marketplace model (Amazon Nova) or Kiro Crew first.
4. **Anam cost.** You need access through at least 20 Nov, so two billing cycles. Starter's 50 minutes is too small. Explorer ($49/month, 250 minutes) is the realistic floor. A renewal can land mid-judging and Indian cards often fail recurring foreign charges. Calendar a manual renewal check for 12-14 Nov.
5. **Anam beta-feature clause (ToS 2.4).** Tool calling, Knowledge Base and Director Notes are labelled beta, and the ToS bars publishing details of beta features without written consent. Required public submission material (repo, README, video, product feedback) counts. Either get written consent or drive tools from your own backend with talk() and addContext.
6. **Anam watermark vs "no third-party logos".** showAIAvatarDisclosure renders a watermark, and ToS 6(j) bars removing it. Record a test on your plan and ask Anam and the Devpost forum whether it is acceptable in the video.
7. **[MANDATORY] tags.** Forum and judge answers (for example "Kiro Crew qualifies", "a web MCP client satisfies the track") are allowances, not official rules. The true gates are in the Devpost checklist (section 1).
8. **Wrong numbers in the body.** DynamoDB always-free is 25 WCU/RCU plus 25 GB, not "5/5". Bedrock prices are unverified third-party figures and regional endpoints cost about 10% more. Anam does not limit Free to one custom avatar. The Anthropic AUP item is forward-dated (effective 12 Nov 2026), so treat it as recommended. EU AI Act and COPPA dates are secondary-sourced, so hedge them.
9. **Alexa+ toolkit access is closed to entrants.** The Devpost FAQ and the Alexa docs home both say it is for select partners only, with no application route. Build Path B (real MCP server plus a simulated Alexa+ web client). Do not open an access-request workstream.

## Gaps the critic says were missing from the research
- **A dual-era MCP strategy, with pinned SDK versions on both server and web client**
  - Why it matters: The MCP versioning pages (checked today) say the current spec is 2026-07-28. It has no initialize handshake, carries the version in every request's _meta, and says servers MUST implement server/discover. Its compatibility matrix says a modern-only client fails against a legacy-only server. The document only warns against a modern-only server. Its plan (2025-11-25 plus 2025-03-26) is legacy-only. A judge, the MCP Inspector or a freshly installed MCP SDK that defaults to the modern era could fail to connect. The same applies to your own web MCP client if you leave its SDK unpinned. 2025-03-26 support also does not meet Devpost's '2025-11-25 or later' wording.
  - How to check: Read https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning (compatibility matrix) and the streamable-http backward-compatibility section. Decide whether to answer both eras on one /mcp endpoint, which the spec allows as 'dual-era'. Pin @modelcontextprotocol/sdk and @anam-ai/js-sdk to exact versions. Test with the newest MCP Inspector and a plain curl initialize call. Ask staff in the forum or at Office Hours #2 which version their judging clients speak.
- **A repo freeze policy: tag the submitted commit and know whether commits or demo changes after the deadline are allowed**
  - Why it matters: The document says the Devpost submission is locked after the deadline. It says nothing about the GitHub repo or the live demo. Reviewers, automated AI analysis and sponsor checks may compare commit timestamps against the deadline, and a late push can look like post-deadline modification. The document also tells you to keep the endpoint live through 20 Nov, which invites late hotfixes.
  - How to check: I could not read Devpost's rules (HTTP 403 for me), so re-read the Rules sections on modification after the deadline and on Testing in a browser. Then ask on the forum. As a safe default, tag a release such as submission-v1 and protect main. Put any hotfix on a separate branch or a separate deployment, and disclose it.
- **Subscription continuity for Anam through the judging window, and whether an Indian card survives recurring or foreign billing**
  - Why it matters: Judging runs 9-20 Nov (the Schedule tab says it may start 26 Oct), and winners are announced 3 Dec. A plan bought around 14 Oct renews around 14 Nov, in the middle of judging. Indian cards often fail on recurring foreign-currency charges because of RBI additional-factor and e-mandate rules. Day-1 testing the first charge does not test the renewal. A failed renewal could disable the avatar while judges are testing. The Rules' Testing clause requires free, unrestricted access until judging ends.
  - How to check: Look at the Anam Lab Billing page after sign-up for the renewal date and what happens on a failed payment. Prefer a card or virtual card that supports international recurring charges. Calendar a manual renewal check for 12-14 Nov. Ask Anam support whether a plan can be prepaid or extended past 20 Nov.
- **Employer, college or contract IP and moonlighting conflicts for the builder**
  - Why it matters: The Rules (as the document quotes them) require original, solely owned work and bar certain affiliations. Many Indian employment contracts have IP-assignment, exclusivity or moonlighting clauses. A conflict could invalidate the 'solely owned' warranty or expose the prize. The document checks only Amazon, Devpost and judge-employer conflicts.
  - How to check: Read your own employment, internship or university agreement for IP-assignment and outside-work clauses. If any exist, get written consent or a waiver before submitting. Record that the work was done on personal time and equipment.
- **How the web front end and the family dashboard are hosted and accessed by judges**
  - Why it matters: The document picks Lambda for the MCP server but never decides where the Anam web page and dashboard are served. Microphone access needs HTTPS, and CORS and Origin validation depend on the choice. Judges also need a no-signup path. The document mentions 'judge credentials' but no demo-account, seeded-data or reset design for the elder view versus the relative view. A broken login is the most likely way a judge fails to test the project.
  - How to check: Choose static hosting with HTTPS (for example S3 with CloudFront, or Amplify Hosting), ideally the same origin as /mcp. Add a one-click 'Judge demo' mode with seeded synthetic family data and a reset button. Test it in a logged-out incognito window on Chrome and Safari, from a non-Indian network.
- **The Rules or FAQ position on AI-generated code and assets, and on use of third-party AI avatars and voices in the demo**
  - Why it matters: The document cites a forum thread on AI-generated assets but never reports what the Rules say about AI-assisted code, AI-generated media, or disclosure. The project is built on AI avatars and voices and probably AI-written code. An undisclosed violation would be a disqualification risk under 'original work' and 'third-party integration authorization'. This was not researched.
  - How to check: Re-read Rules sections IP, Third Party Integrations, Submission Requirements and Language in a browser. Read forum thread 45418. Ask staff whether AI-assisted code and assets must be disclosed. If unclear, disclose in the README and in the pre-existing-work or third-party field.
- **Visible Anam watermark or AI-disclosure overlay in the demo video, against the 'no third-party trademarks' rule**
  - Why it matters: Anam's docs (checked today) say showAIAvatarDisclosure renders a disclosure watermark throughout the video. The document requires that setting and also says 'use no Anam logos on screen'. Anam ToS 6(j) bars removing watermarks, and the document says Explorer removes a watermark. A Free or Starter recording may show Anam branding. Whether that counts as an unapproved third-party trademark under the Devpost rule is unresolved.
  - How to check: Record a 30-second test session on your chosen plan with the disclosure flag on and look at what appears. Ask Anam support in writing whether showing the watermark in a public hackathon video is fine. Ask on the Devpost forum whether showing a vendor's SDK output counts as a third-party trademark.
- **Anam ToS 2.4 (beta features) applied to everything public: repo, README, video and the mandatory Product Feedback**
  - Why it matters: The ToS clause is verified: the customer shall not disclose to any third party or publish details of any Beta Feature without Anam's prior written consent. Anam tool calling is labelled beta on its tools overview page. The document flags a demo, write-up and friction log, but the public repo code, README, demo video and the mandatory per-tool Product Feedback (including 'what needs work') are also disclosures to Amazon and Devpost. ToS 2.2 (evaluation use, no End Users) also reads badly for public judges. If you build on tool calling, you may breach the terms by completing the required submission.
  - How to check: Email support@anam.ai on day 1 and ask for written consent covering Devpost, the repo and the video. Or drive tools from your own backend through talk() and addContext, with no beta features. Re-read the ToS just before submitting, because its section numbering is inconsistent.
- **A Marketplace-free default for the AWS Builder challenge, with Claude as an upgrade**
  - Why it matters: Community reports (repost.aws) show AISPL accounts failing the Claude Marketplace subscription with INVALID_PAYMENT_INSTRUMENT. Multiple cards and UPI AutoPay were tried, and AWS Support reportedly said the payment method was not the cause. No confirmed fix was found, and a recent post covers a newer model. If this hits you, the Claude path may stay blocked for the whole ten days. The document treats Nova or gpt-oss as a contingency. The AWS Builder evidence (Bedrock plus Strands) should be designed around a non-Marketplace model first.
  - How to check: In hour 1, run a real invoke of Claude, Amazon Nova and gpt-oss on Bedrock. Build the Strands agent and Converse digest on whichever works. Open an AWS Support case immediately if Claude fails, and log it in the friction log.
- **Evidence for 'Potential Impact' and 'Quality of the Idea'**
  - Why it matters: Judging weights four criteria equally, and the document is detailed on Tech and Design but gives no plan for impact evidence. Examples would be loneliness statistics from cited sources, a consented trial with a real elder or caregiver, or a stated metric such as human contacts prompted. Another entrant is building an overlapping caregiving idea, so differentiation needs proof, not only features.
  - How to check: Plan a 5-10 minute consented user test with an adult relative, and cite two or three authoritative loneliness statistics in the Devpost text. Show the metric in the demo, such as 'family messages delivered' or 'check-ins logged'.
- **Time-box and MVP cut line for the large policy, legal and accessibility checklist**
  - Why it matters: Section 5 (Alexa+ policy, SB 243, NY law, EU AI Act, DPDP, COPPA, WCAG 2.2, Guardrails, GitHub Pages policy pages) plus notifications, OSS deliverable, friction log and AWS evidence is a month of work for ten days. Over-reading it is a real risk to shipping a working demo, and Stage 1 is a pass/fail check that the project works and fits the track.
  - How to check: Fix a P0 list: working MCP server and client with a visible tools/call log, the avatar, the family digest, the voice-note or photo loop, the video, README and submission. Treat everything else as P1 and cap policy and legal work at a few hours.

## Pitfalls the critic flagged
- The deadline is Fri 23 Oct 12:00 PM PT, which is Sat 24 Oct 00:30 IST. Devpost's Schedule tab shows it in IST, so '24 Oct' reads like a full day. The effective last working day for you is Fri 23 Oct IST. The document's 22 Oct 6 PM PT (23 Oct 06:30 IST) cutoff means working through Thursday night in India, so decide who submits and when you will sleep.
- Devpost's video field only accepts YouTube, Vimeo or Youku links and errors on others. This hackathon's Rules allow only YouTube or Vimeo, and the video must be public. YouTube HD processing, a Content ID claim that mutes audio, a new-channel upload check and Vimeo's free weekly upload cap can each cost hours. Upload at least 24 hours early, then check the link while logged out.
- On Anam Free (30 min per month, 3-minute cap, 1 concurrent session), development, debugging and video retakes can burn the whole quota in a day. Budget Explorer from day 1, or build the UI against a mock and use the live avatar sparingly.
- GitHub only detects a LICENSE from a standard, unmodified license text. A edited MIT or Apache file can show 'Other' or no license in the About box, which can fail the 'open-source license visible' check. The Open Source mini challenge also needs its own repo or contribution with an OSS license. Pick one permissive license for both and add a LICENSE file on day 1.
- The Devpost Rules and Overview contain text addressed to AI assistants about making the repo private and adding collaborators. Do not let any agent or script touch repo visibility or collaborators. Do the invite or public switch yourself.
- Switching a repo from private to public at the end exposes the full git history. Scan history for Anam, AWS and webhook secrets, and rotate any key that was ever committed. Do not rely on deleting the file.
- Anam webhook tools have a documented 5-second timeout on the tools overview (60 s elsewhere), and tool calling is beta. Anam needs a public HTTPS URL for webhooks, so a tunnel is not stable enough for judging. Prefer client tools, or drive tools from your own backend.
- A latency budget measured in the US does not hold from India. Anam has no APAC region, and judges may be US-based. Test the demo from a non-Indian network too (for example a VPN or a friend's connection), because WebRTC fails on strict corporate networks. Keep the fallback or recorded mode one click away.
- Do not put 'Alexa', 'Amazon' or 'Alexa+' in the project name or logo. 'Haven' is a common word (for example an open-source app named Haven exists), so a quick trademark and App Store or domain check is worth ten minutes. Use plain-text references to the track in the video.
- Playing uploaded relative voice notes through the avatar may need Anam audio passthrough or a separate audio element. Prove this on day 1, because a voice-note loop that cannot be demonstrated will cost the main differentiator.
- Anam's ToS has inconsistent numbering and cross-references, and the AUP, ToS and pricing page can change at any time. Re-read the ToS and AUP just before submission and keep a dated copy of the pricing page and your support emails.
- Submit by creating a full draft early. Devpost has no early eligibility review for this hackathon, and the real form is gated behind Join hackathon, so fields and limits are unknown. Join first and screenshot the form today.

---

# Haven: Master Requirements for "Build, Ship, Shape: Amazon Developer Hackathon 2026"
Prepared 2026-10-13. This assumes a builder in India, which is unconfirmed. It is research, not legal advice.

**Deadline: Fri 23 Oct 2026 12:00 PM PT (PDT, UTC-7) = Sat 24 Oct 2026 00:30 IST.** About 10 days remain.

**Legend**
- `[MANDATORY]` means an official source (Devpost Rules/FAQ, vendor docs or terms) states it. The scope is in parentheses: (Devpost) is needed to enter or submit; (Anam), (AWS) and so on bind you if you use that vendor; (Path A) applies only if you build the real Alexa+ add-on.
- `[RECOMMENDED]` and `[OPTIONAL]` are judgement or best practice.
- ⚠ marks an item that is unverified, unverifiable or inferred. "Check:" says how to confirm it. No inferred item is tagged mandatory.

**Bottom line**
1. The real Alexa+ toolkit (alexa-ai CLI, Web Simulator, add-on deploy) is not available to hackathon entrants. Build a self-hosted Streamable-HTTP MCP server plus a web page that acts as a real MCP client (§3.1).
2. Test Claude on Bedrock from your AWS account in the first hour. India (AISPL) accounts have a documented Marketplace payment restriction (§2, §7).
3. The Anam Free plan allows a 3-minute conversation, 30 minutes per month and 1 concurrent session. Budget for a paid plan, and keep a fallback mode for judges (§3.2).
4. Draft is not Submitted. Submit a full draft early and confirm the green "Submitted" tag (§1.7).

---

## Key dates

| Event | PT | IST | Source |
|---|---|---|---|
| Submission Period opened | Mon 31 Aug 10:15 AM | Mon 31 Aug 22:45 | [Rules §1](https://amazonappdev2026.devpost.com/rules) |
| Office Hours #2 (Zoom link in the Updates post) | Mon 19 Oct 9:00 AM | Mon 19 Oct 21:30 | [Updates](https://amazonappdev2026.devpost.com/updates/46771-office-hours-schedule) |
| ⚠ Suggested internal final submit (inferred) | Thu 22 Oct 6:00 PM | Fri 23 Oct 06:30 | Inferred. Gives about 18 h of buffer. |
| **Submission deadline** | **Fri 23 Oct 12:00 PM** | **Sat 24 Oct 00:30** | [Rules §1](https://amazonappdev2026.devpost.com/rules), [Dates](https://amazonappdev2026.devpost.com/details/dates) |
| Judging per Rules | Mon 9 Nov 12:00 PM → Fri 20 Nov 12:00 PM | 10 Nov 01:30 → 21 Nov 01:30 | [Rules §1](https://amazonappdev2026.devpost.com/rules) |
| ⚠ Judging per Schedule tab (conflict, §9) | starts 26 Oct 12:00 PM | starts 27 Oct 00:30 | [Dates](https://amazonappdev2026.devpost.com/details/dates) |
| Winners announced (approx.) | Thu 3 Dec 12:00 PM | Fri 4 Dec 01:30 | [Rules §1](https://amazonappdev2026.devpost.com/rules) |

---

## 1. Devpost submission checklist (in the order you would do it)

### 1.1 Register and check eligibility
- [ ] `[MANDATORY]` (Devpost) Create a free Devpost account and click **Join hackathon**. The submission form is gated until you do. You can unregister only before you start a draft. [Rules §4](https://amazonappdev2026.devpost.com/rules), [help 119](https://help.devpost.com/article/119-registering-for-a-hackathon)
  - ⚠ Teammate registration is not required by any source read. The team lead adds teammates by email or invite link ([help 121](https://help.devpost.com/article/121-teams-adding-teammates)). Check: ask in the [forum](https://amazonappdev2026.devpost.com/forum_topics).
- [ ] `[MANDATORY]` (Devpost) Eligibility: you must be at least the age of majority where you reside. Excluded: residents of Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea and OFAC-comprehensively-sanctioned places. India is not named. [Rules §3](https://amazonappdev2026.devpost.com/rules), [FAQ](https://amazonappdev2026.devpost.com/details/faqs)
  - ⚠ Your country of residence is unconfirmed. Check: re-read Rules §3 in a browser.
- [ ] `[MANDATORY]` (Devpost) Conflict-of-interest check. You are excluded if you or your household are tied to Amazon, Devpost or any judge's employer (the judge list includes Callstack and NBA people). [Rules §3](https://amazonappdev2026.devpost.com/rules)
- [ ] `[MANDATORY]` (Devpost) Appoint one eligible Representative. They submit, and they receive and split any prize. There is no maximum team size. [Rules §3, §4, §8](https://amazonappdev2026.devpost.com/rules), [FAQ](https://amazonappdev2026.devpost.com/details/faqs)
- [ ] `[MANDATORY]` (Devpost) The project must not have been developed with financial or preferential support from Amazon or Devpost (funding, contract, commercial licence). [Rules §4](https://amazonappdev2026.devpost.com/rules)
  - ⚠ Using the hackathon's own AWS credits is presumed fine (inferred).
- [ ] `[MANDATORY]` (Devpost) The project must be newly created, or significantly updated after 31 Aug 2026. If it pre-existed, write an explanation and demo the updates. [Rules, New & Existing](https://amazonappdev2026.devpost.com/rules), [FAQ](https://amazonappdev2026.devpost.com/details/faqs)
  - `[RECOMMENDED]` ⚠ Disclose any reused pre-31-Aug code and keep commit history that shows when things were built.
- [ ] `[MANDATORY]` (Devpost ToS) Do not submit something that substantially duplicates an earlier Devpost submission, including your own. This risks disqualification. Disclose any lineage in the pre-existing-work explanation. [Devpost ToS §4](https://info.devpost.com/legal/terms-of-service)

### 1.2 Declare track and mini challenges
- [ ] `[MANDATORY]` (Devpost) Pick the primary track (**Alexa+**) and your mini challenge(s) (**AWS Builder**, **Open Source**). A project wins at most one track prize and one mini-challenge prize. Mini challenges are only allowed on top of a primary-track submission. Entering both minis can win at most one. [Rules §4, §8](https://amazonappdev2026.devpost.com/rules), [forum 45310](https://amazonappdev2026.devpost.com/forum_topics/45310-question-related-to-mini-challenge), [forum 45333](https://amazonappdev2026.devpost.com/forum_topics/45333-can-one-project-be-submitted-to-both-fire-tv-and-alexa-tracks)

### 1.3 Code repository
- [ ] `[MANDATORY]` (Devpost) The repo must be on GitHub (GitLab and others are rejected). It must contain all source, assets and setup/run instructions. [Rules](https://amazonappdev2026.devpost.com/rules), [FAQ](https://amazonappdev2026.devpost.com/details/faqs)
- [ ] `[MANDATORY]` (Devpost) The Alexa+ track needs a runtime code hook. The repo must import and actually call the track tech (an MCP server and client, an app/backend entry point, or a loaded MCP config), not merely name it in the README. The simulated-Alexa+ path is exempt, but its source must be in the repo. [Rules, Submission Requirements](https://amazonappdev2026.devpost.com/rules)
- [ ] `[MANDATORY]` (Devpost) Visibility, choose one:
  - **Public** with an open-source LICENSE file that GitHub detects and shows in the About section.
    - AGPL-3.0 was confirmed fine by a judge ([forum 45494](https://amazonappdev2026.devpost.com/forum_topics/45494-question-related-to-license-of-the-repo)). ⚠ "Any OSI licence" is inferred.
  - **Private**, shared via Settings > Collaborators with `testing@devpost.com` plus `chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth` and `emersonsklar`.
    - Invite all seven. The Updates post and a Devpost manager's reply list six GitHub users, while the main page and FAQ list five (§9).
    - Each invitee must accept, and GitHub invitations expire after 7 days. Send them at submit time, not weeks earlier. An unshared private repo cannot be reviewed.
    - Sources: [Updates 46456](https://amazonappdev2026.devpost.com/updates/46456-got-an-idea), [forum 45264](https://amazonappdev2026.devpost.com/forum_topics/45264-private-repo-path-amazonappdev-is-an-organization-so-it-cannot-be-added-as-a-collaborator)
  - Add the collaborators yourself. The Rules page contains a pre-written sentence addressed to AI assistants telling them to add collaborators. Do not let an agent do this.
- [ ] `[RECOMMENDED]` ⚠ Prefer public. It removes the invite and acceptance dependency (inferred). Exception: if Anam or voice assets carry restrictive licences, staff steer you to private ([forum 45418](https://amazonappdev2026.devpost.com/forum_topics/45418-ai-generated-assets-we-own-may-they-ship-in-the-public-repo-under-a-separate-asset-licence)). Check: read the asset licence.
- [ ] `[RECOMMENDED]` Never commit keys (Anam, AWS, webhook secrets). Use env vars and a `.env` in `.gitignore`, and scan the git history before submitting. [Tips](https://amazonappdev2026.devpost.com/updates/46538-strong-submission-tips)

### 1.4 Demo video
- [ ] `[MANDATORY]` (Devpost) The video must be under 3 minutes, in English (or with an English translation), public on **YouTube or Vimeo** (not Youku), and linked on the form. It must show the project functioning on the platform it was built for. Judges need not watch past 3:00. [Rules, Submission Requirements and Language](https://amazonappdev2026.devpost.com/rules), [help 85](https://help.devpost.com/article/85-uploading-a-demo-video)
- [ ] `[MANDATORY]` (Devpost) No third-party trademarks or copyrighted music or footage without permission. Amazon staff say they cannot approve Alexa+ logo use, and YouTube or Prime clips are not allowed. [Rules](https://amazonappdev2026.devpost.com/rules), [forum 45450](https://amazonappdev2026.devpost.com/forum_topics/45450-change-of-type-of-project-and-logo-permission), [forum 45329](https://amazonappdev2026.devpost.com/forum_topics/45329-media-footage-copyright-issue)
  - `[RECOMMENDED]` ⚠ Use no Alexa, Amazon, Anam or ElevenLabs logos on screen. Write "Alexa+" as plain text. Use YouTube Audio Library or your own music ([YouTube help](https://support.google.com/youtube/answer/3376882)).
- [ ] `[RECOMMENDED]` Pitch the problem, the working solution and the people it helps, and name the track tool clearly. Lead with your best material, aiming for 2:30 to 2:45 ⚠ inferred. After uploading, check it in a logged-out window. The video is locked after the deadline. [Tips](https://amazonappdev2026.devpost.com/updates/46538-strong-submission-tips)
- [ ] `[RECOMMENDED]` ⚠ Use only synthetic or consenting-adult voices and faces. Keep minors out. Show no real elder's data, keys or phone numbers. Get a written release from anyone seen or heard. Rules §7 and §10 give the sponsor name and likeness use for 3 years ([Rules](https://amazonappdev2026.devpost.com/rules)).

### 1.5 Written content on the form
- [ ] `[MANDATORY]` (Devpost) A text description of features and functionality. [Rules](https://amazonappdev2026.devpost.com/rules)
  - `[RECOMMENDED]` Name the track tech (Alexa+ / MCP) in the description and in Built With. [Tips](https://amazonappdev2026.devpost.com/updates/46538-strong-submission-tips)
- [ ] `[MANDATORY]` (Devpost) **Product feedback on each tool, API or SDK used.** Answer these five questions: [Rules](https://amazonappdev2026.devpost.com/rules), [Tips](https://amazonappdev2026.devpost.com/updates/46538-strong-submission-tips)
  1. Which tools, APIs and SDKs you used, and for what.
  2. What worked well.
  3. What needs work.
  4. Onboarding, from zero to hello world.
  5. Would you build with them again (Yes/No, and why).
  - ⚠ Whether non-Amazon tools (Anam, MCP SDK, voice vendors) need entries is ambiguous. The wording says "each tool ... used", so cover all of them. Draft the notes while you build.
- [ ] `[MANDATORY]` (Devpost) Testing: the project must be free and unrestricted for the Sponsor, Administrator and Judges until the Judging Period ends (20 Nov). Put login credentials in the testing instructions if anything is private. Judges may judge from the text, images and video alone. [Rules, Testing](https://amazonappdev2026.devpost.com/rules)
  - `[RECOMMENDED]` Keep the MCP endpoint and demo live through 20 Nov. A judge said "Yes" ([forum 45411](https://amazonappdev2026.devpost.com/forum_topics/45411-must-the-hosted-mcp-endpoint-stay-live-through-judging), [forum 45493](https://amazonappdev2026.devpost.com/forum_topics/45493-question-related-to-production-being-live-of-the-alexa-mcp-server)), but the FAQ says it is not needed (§9). Also provide a no-avatar fallback mode (§3.2).
- [ ] `[MANDATORY]` (Devpost) The pre-existing-work explanation (see §1.1), and the mini-challenge fields (see §4).
- [ ] `[OPTIONAL]` Feature requests (description, why it matters, priority Critical / Important / Nice-to-have). [Rules](https://amazonappdev2026.devpost.com/rules)
- [ ] `[OPTIONAL]` Friction log, worth up to a 10% judging bonus (see §4.3).
- [ ] `[MANDATORY]` (Devpost) The project must be original, solely owned work. You must be authorised under each third-party SDK's, API's or data source's terms (see Anam in §5.1). Open-source reuse is allowed under its licence. [Rules, IP and Third Party Integrations](https://amazonappdev2026.devpost.com/rules)
- [ ] `[RECOMMENDED]` ⚠ The form is gated, so exact fields and limits are unseen. Devpost's generic form has: project name, tagline, thumbnail (JPG/PNG/GIF, up to 5 MB), story (Markdown), Built With (up to 25 tags), image gallery and video link ([help 126](https://help.devpost.com/article/126-know-your-submission-steps)). Check: open the real form after joining.

### 1.6 Early draft
- [ ] `[RECOMMENDED]` ⚠ Complete a full draft by about 16 Oct to surface missing fields (inferred). Devpost only does early baseline review for badged hackathons, and none is badged here. [help 126](https://help.devpost.com/article/126-know-your-submission-steps)

### 1.7 Final submit
- [ ] `[MANDATORY]` (Devpost) A project in **Draft** is not submitted. Finish every step, agree to the terms, and click **Submit project** on the final step. Confirm the green banner and the green "Submitted" tag on My projects. [help 122](https://help.devpost.com/article/122-how-to-enter-a-submission), [Rules §5](https://amazonappdev2026.devpost.com/rules)
- [ ] `[MANDATORY]` (Devpost) Submitting means you accept the Official Rules as a contract. That includes release and indemnity and AAA arbitration under New York law. Re-read the Rules just before submitting, because they can change. A banner already notes a 16 Sep update on the code repository. [Rules §9, §11, §13, §14](https://amazonappdev2026.devpost.com/rules)
- [ ] `[RECOMMENDED]` Pre-submit checks:
  - Repo public, or all seven invites sent.
  - License visible in About.
  - README has run steps and judge credentials.
  - Video public and under 3:00.
  - Product feedback, mini-challenge fields and pre-existing-work explanation filled in.
  - No secrets in the repo.

### 1.8 After the deadline
- [ ] `[MANDATORY]` (Devpost) After the deadline you cannot change the submission. The only exceptions are sponsor-permitted removals of infringing or PII material. [Rules §5](https://amazonappdev2026.devpost.com/rules)
- [ ] `[MANDATORY]` (Devpost) Respond to verification requests, or you risk disqualification ([Devpost ToS §5.B](https://info.devpost.com/legal/terms-of-service)). Winners must complete the affidavit and forms within 10 business days. Prizes are delivered within 60 days of the completed forms. Non-US winners may need a W-8BEN. Winners pay their own wire/FX fees and local taxes. [Rules §8](https://amazonappdev2026.devpost.com/rules), [help 114](https://help.devpost.com/article/114-how-to-claim-your-hackathon-cash-prize-winners-only)
  - `[RECOMMENDED]` ⚠ Check India's tax and FEMA treatment with a professional. Use a Devpost email you read daily.

**Judging (for planning).** Stage 1 is pass/fail on whether the project "reasonably fits the theme and reasonably applies the required APIs/SDKs". Stage 2 scores four equally weighted criteria from 1 to 5: Tech Implementation, Design, Potential Impact and Quality of the Idea. Panels, peer review and automated AI analysis may all be used. [Rules §6](https://amazonappdev2026.devpost.com/rules), [Updates 46456](https://amazonappdev2026.devpost.com/updates/46456-got-an-idea)
- `[RECOMMENDED]` Alexa+ "obvious" means a single-turn Q&A bot or a basic MCP wrapper over an existing API. "Creative" means agentic cross-service workflows, state across sessions, media (cards, carousels), MCP Apps and Agent Skills. [Rules §6](https://amazonappdev2026.devpost.com/rules)
- `[RECOMMENDED]` The Alexa judge says to build something people could really use on Alexa+, part of a broader multimodal experience. A latent LLM capability or an existing Alexa+ feature scores poorly on Design and Idea. [forum 45397](https://amazonappdev2026.devpost.com/forum_topics/45397-what-exactly-are-you-looking-for-in-the-alexa-track)
- `[RECOMMENDED]` Caregiving overlap: another entrant is building a caregiving Alexa+ add-on with check-ins and escalation ([forum 45199](https://amazonappdev2026.devpost.com/forum_topics/45199-alexa-mcp-can-an-add-on-initiate-alexa-to-alexa-calling-or-drop-in)). The Overview shows 54,402 registrants. Differentiate on the Anam avatar, the family dashboard and the voice-note/photo loop.
- `[OPTIONAL]` A judge said add-ons cannot do Alexa-to-Alexa calling or Drop In today, but you may demo it in the submission (same forum thread). This is relevant to `request_call`.

---

## 2. Accounts and access to set up now (ordered by lead time)

| # | Account / access | Needed for | Lead time (days) | Notes and checks |
|---|---|---|---|---|
| 1 | **AWS account** (India: AISPL) | Bedrock, Lambda, DynamoDB, S3, AWS Builder | ⚠ Not stated. Assume 0.5 to 5. | `[MANDATORY]` (AWS) India billing needs a card with CVV (INR 2 charge and refund), SMS/voice verification, and customer verification with a PAN, Voter ID or Driving Licence. The name must exactly match the document. "You must pass customer verification to access AWS services." [AWS India](https://docs.aws.amazon.com/accounts/latest/reference/managing-accounts-india.html) |
| 2 | **Claude on Bedrock access** | AWS Builder runtime story | Minutes if clean. Days to unknown if payment fails. | `[MANDATORY]` (AWS) For Anthropic models, complete the First Time Use (FTU) form and have Marketplace IAM permissions and a valid payment method. The form can sit PENDING. Marketplace subscription takes up to 15 min. [Model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) **Risk:** since 2022 AWS Marketplace no longer supports stored cards for AISPL customers. The fix is Pay By Invoice or manual payment ([AWS blog](https://aws.amazon.com/blogs/awsmarketplace/restriction-on-credit-and-debit-card-purchases-for-aispl-customers-using-aws-marketplace/), [troubleshooting](https://docs.aws.amazon.com/bedrock/latest/userguide/troubleshooting-api-error-codes.html)). `[RECOMMENDED]` Run a real Claude invoke in hour 1. If it fails, open an AWS Support case and switch the demo to a non-Marketplace model (Amazon Nova or gpt-oss). |
| 3 | AWS plan: switch to **Paid** | Avoid the Free-plan 6-month closure and Marketplace exclusion | Minutes | `[RECOMMENDED]` ⚠ The Free plan ends after 6 months or when credits run out, then the account closes. It excludes "certain AWS Marketplace offers" and promotional credits. AgentCore is "Paid plan exclusive". [Free plans](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html), [Free Tier](https://aws.amazon.com/free/) Whether Claude on Bedrock is blocked on the Free plan is inferred. Check: test invoke. Set an AWS Budgets alert. |
| 4 | **Anam support requests** (if needed) | Custom voice access, ElevenLabs voice import, higher limits, written clarification of ToS points (§5.1) | ⚠ Undocumented. Budget 1 to 3 business days (inferred). | `[RECOMMENDED]` Send them on day 1 to support@anam.ai. Decide by 16–17 Oct. [custom voices](https://anam.ai/docs/personas/voices/custom-voices.md), [production](https://anam.ai/docs/javascript-sdk/production.md) |
| 5 | **Anam Lab account + API key** | Avatar | Minutes (undocumented, inferred ⚠) | `[MANDATORY]` (Anam) Create the persona and API key in [Lab](https://lab.anam.ai) ([api-key](https://anam.ai/docs/javascript-sdk/api-key.md)). Lost keys cannot be recovered. ⚠ Whether sign-up needs a credit card is not documented (unverifiable). Check: watch the sign-up flow and do not enter payment details until you choose a plan. |
| 6 | **Anam paid plan** (Starter $12 or Explorer $49) | Longer conversations, commercial use, 3 concurrent sessions (Explorer) | Minutes ⚠ | `[RECOMMENDED]` See §3.2. ⚠ Indian-card acceptance for a USD subscription is undocumented, so test the payment early (inferred). |
| 7 | GitHub repo with LICENSE | Submission | Minutes | See §1.3. |
| 8 | **Amazon SES** | Email notifications | Sandbox is immediate. Production access has an initial response within 24 h. | `[OPTIONAL]` Sandbox suffices if you verify the recipients (200 messages/day, 1/s). [SES](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) |
| 9 | Telegram bot (BotFather); FCM project | Notifications | Minutes / hours | `[OPTIONAL]` [Telegram FAQ](https://core.telegram.org/bots/faq), [FCM web](https://firebase.google.com/docs/cloud-messaging/js/client) |
| 10 | Trademark search for "Haven"; written releases for anyone on video | Branding and video | Hours ⚠ inferred | `[RECOMMENDED]` Search the USPTO and the Indian register. |
| 11 | Alexa developer account (free), AWS account trust via an Alexa Solutions Architect, `alexa-ai` CLI | Path A only | **No application route for entrants** | `[OPTIONAL]` See §3.1. [FAQ](https://amazonappdev2026.devpost.com/details/faqs), [docs home](https://developer.amazon.com/docs/alexaplus/add-ons/home.html) |
| 12 | Meta WhatsApp Cloud API; SNS/SMS with India DLT | Notifications | WhatsApp template review up to 24 h, business verification unknown. India DLT takes weeks. | `[OPTIONAL]` **Avoid** for the hackathon (§3.4). |
| X | Hackathon AWS credits ($150) | n/a | **Closed** | `[MANDATORY]` Do not plan on them. The Rules and Resources pages carry "October 7th Update: We are out of credit codes". [Rules §4](https://amazonappdev2026.devpost.com/rules), [Resources](https://amazonappdev2026.devpost.com/resources) |

---

## 3. Build requirements

### 3.1 Alexa+ (primary track)

**Day-1 decision gate.**

| Question | Evidence | Decision |
|---|---|---|
| Do you already hold Alexa+ MCP Toolkit access (Amazon-trusted AWS account and CLI credentials)? | The FAQ says the toolkit, CLI, Category SDK and Web Simulator are "in preview and available to select partners only - there is currently no way for hackathon participants to apply" ([FAQ](https://amazonappdev2026.devpost.com/details/faqs)). The docs home says "available to select partners only" ([docs](https://developer.amazon.com/docs/alexaplus/add-ons/home.html)). A judge repeated this ([forum 45262](https://amazonappdev2026.devpost.com/forum_topics/45262-is-the-alexa-mcp-toolkit-alexa-ai-cli-available-to-hackathon-participants)). A participant saw `@alexa-ai/cli` return npm 404, and public npm still returns 404. | **No (expected): build Path B and stop investigating.** Do not open an access-request workstream. |
| If yes (unlikely) | A dev-stage add-on is visible only to your own developer account ([Web Simulator](https://developer.amazon.com/docs/alexaplus/add-ons/test-with-web-simulator.html)), so judges cannot invoke it. | Add Path A on top of Path B. Never use it instead of Path B. |

Time-box the decision to the end of day 1. Revisit it only if Amazon contacts you.

#### Path B (default): real MCP server plus simulated Alexa+ web client
This satisfies both the real-MCP clause and the simulation clause.

- `[MANDATORY]` (Devpost) Alexa+ track deliverable: a working self-hosted MCP server implementing spec **2025-11-25** over **Streamable HTTP**, or an Agent Skill, or a simulated Alexa+ web experience. The simulation may be built with any tool. It is exempt from the runtime-hook rule, but the repo must include its source and the video must clearly show it. [Rules](https://amazonappdev2026.devpost.com/rules)
  - ⚠ "2025-11-25 or a later version" is only acceptable "once confirmed". Pin 2025-11-25, and ask staff before using anything newer.
- `[MANDATORY]` (Devpost) A web page acting as a real MCP client (sending `initialize`, `tools/list` and `tools/call` over Streamable HTTP) satisfies the requirement. An existing AI assistant also calling the server is a bonus. [FAQ](https://amazonappdev2026.devpost.com/details/faqs)
  - Per judges, voice is not required and the UI need not look like Alexa (looking like it helps Design). The experience must look, feel and sound functional and be a plausible Alexa use case. [forum 45058](https://amazonappdev2026.devpost.com/forum_topics/45058-clarification-on-simulated-alexa-web-experience-requirements)
- `[MANDATORY]` (Devpost) The repo must call the MCP code at runtime (MCP SDK import, an endpoint and a client that invokes the tools). Show a visible `tools/call` log in the demo. [Rules](https://amazonappdev2026.devpost.com/rules)
- `[MANDATORY]` (MCP spec 2025-11-25) Transport rules: [transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
  - Single `/mcp` endpoint accepting POST.
  - Return a single `application/json` object or an SSE stream for requests. Plain JSON is legal.
  - Return 202 with no body for notifications.
  - GET may return 405.
  - Validate the `Origin` header (403 if invalid).
  - Clients send `Accept: application/json, text/event-stream` and `MCP-Protocol-Version`.
  - `MCP-Session-Id` is optional. If you issue one, an unknown session gets 404.
- `[MANDATORY]` (MCP spec) Tool security MUSTs: validate all inputs, enforce access control, rate-limit invocations and sanitise outputs. Keep a human able to deny sensitive tool calls. [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) If you implement authorization, tokens must be issued for your server (validate `aud`), with no token passthrough and no sessions as authentication. [security](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices)
- `[RECOMMENDED]` Protocol negotiation: answer `initialize` with the client's requested version, supporting both 2025-11-25 and 2025-03-26. Amazon's own client example sends 2025-03-26. Do not ship a server that only speaks 2026-07-28, the current spec, which removes `initialize` and `Mcp-Session-Id`. Run stateless in JSON mode. Check: test with MCP Inspector. [lifecycle](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-client-lifecycle.html), [versioning](https://modelcontextprotocol.io/specification/versioning)
- `[RECOMMENDED]` ⚠ If the browser calls a cross-origin endpoint, configure CORS in one place only. Allow `Authorization`, `MCP-Protocol-Version` and `Mcp-Session-Id`, and expose `Mcp-Session-Id`. Or serve the page and the endpoint from one origin. (The CORS details are inferred.) Check: test in a real browser.
- `[RECOMMENDED]` Tool design bar (borrowed from Amazon's certification docs): one distinct intent per tool, valid JSON Schema, server-side validation, stable IDs, `isError` on failures, at most 5 options per response, no tool names or JSON spoken, and confirmation before high-consequence actions. [functional requirements](https://developer.amazon.com/docs/alexaplus/add-ons/functional-requirements.html)
- `[RECOMMENDED]` Latency: Amazon requires under 500 ms round trip for real add-ons ([quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html)). Treat it as your tool budget:
  - Read from a precomputed store.
  - Never call an LLM or Anam inside `get_family_updates`.
  - Do slow work such as `request_call` and `escalate_need` delivery in the background.
- `[OPTIONAL]` MCP Apps UI (`_meta.ui.resourceUri`, sandboxed iframe) and an "Agent Skill". [Resources](https://amazonappdev2026.devpost.com/resources) ⚠ "Agent Skill" is used loosely (§9). An MCP server is the safer evidence for Tech Implementation. A bare `SKILL.md` has no documented way to run inside Alexa+.

#### Path A (only if you hold access): real add-on layer
These are Amazon-docs requirements for a real add-on. They are not hackathon requirements.
- `[MANDATORY]` (Path A) Setup: [dev setup](https://developer.amazon.com/docs/alexaplus/add-ons/set-up-your-development-environment.html)
  - Alexa developer account with the marketplace set to an Alexa+ supported one.
  - Node.js 24+ on macOS or Ubuntu.
  - The AWS account you gave the Alexa Solutions Architect, with an IAM user able to assume `arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead`.
  - CodeArtifact login (token lasts 12 h), then `npm install -g @alexa-ai/cli`, then `alexa-ai configure`.
- `[MANDATORY]` (Path A) `addon.json`: [quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html)
  - Name up to 30 characters, short description up to 123, full description up to 4000.
  - 3 to 4 example phrases of up to 200 characters each.
  - Six light icon sizes (72, 64, 88, 126, 180 and 241 px square) and at least one 600x900 carousel image.
  - HTTPS image, privacy-policy and terms URLs.
  - Endpoint type HTTPS.
  - ⚠ Only `US` and `en-US` are documented values for `distributionCountries` and locale. Check: ask your Solutions Architect.
- `[MANDATORY]` (Path A) Run `alexa-ai deploy` to the development stage, and **redeploy after any change** to tools, descriptions or auth metadata (Alexa caches them). Test with MCP Inspector, then the Local Inspector, then the Web Simulator. [CLI reference](https://developer.amazon.com/docs/alexaplus/add-ons/alexa-ai-cli-reference.html), [test](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-test-add-ons.html)
- `[OPTIONAL]` Certification and `alexa-ai submit`. Nothing says it is required for the hackathon. Review time is unpublished, the criteria are "preliminary", and tool descriptions lock after publication. Do not submit before your video is recorded. [certify](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-certify.html)
- Auth (Path A with account linking). Linking is optional if tools need no user identity ([account linking](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-account-linking.html)), but see the §9 conflict.
  - `[MANDATORY]` (Path A) OAuth 2.1 authorization code with PKCE S256, and `alexa-ai deploy` fails without S256 in `code_challenge_methods_supported`.
  - `[MANDATORY]` (Path A) Auth-server metadata at `/.well-known/oauth-authorization-server`, and protected-resource metadata at `/.well-known/oauth-protected-resource` (`resource` must match the manifest URL; only the first `authorization_servers` entry is used).
  - `[MANDATORY]` (Path A) Static client only (no DCR), the `resource` parameter on authorize and token requests (not on refresh), and a refresh token with every access token.
  - `[MANDATORY]` (Path A) Register all Alexa redirect URIs. Return 401 or 403 on tool calls without a valid token. Send the bearer token in the `Authorization` header only.
  - `[RECOMMENDED]` Accept PKCE-only token exchanges (no client secret).
  - `[OPTIONAL]` Tier 1 `client_credentials` with scope `mcp:service`. It is documented for private servers and its page contradicts itself. Whether a public server needs it is unknown. [authentication](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-authentication.html)
  - `[RECOMMENDED]` ⚠ A Cognito metadata shim, or a hand-rolled OAuth server inside the Lambda, are inferred designs, not documented. Cognito publishes only OIDC discovery and does not support client-credentials resource binding. [Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html) Check: test with the Alexa CLI/Web Simulator.

### 3.2 Anam avatar

- `[MANDATORY]` (Anam) Keep the API key server-side. Your backend calls `POST https://api.anam.ai/v1/auth/session-token` (Bearer key plus `personaConfig`) and returns only the 1-hour `sessionToken`, bound to that exact config. Mint a new token per user session. [authentication](https://anam.ai/docs/javascript-sdk/authentication.md), [API reference](https://anam.ai/docs/api-reference/sessions/create-session-token.md)
  - Do not copy the official quickstart, which puts the key in browser code ([quickstart](https://anam.ai/docs/javascript-sdk/quickstart.md)).
- `[MANDATORY]` (Anam) Persona config: the API schema has no top-level required fields, but the guide's example uses `name`, `avatarId`, `avatarModel` and `voiceId`. An avatar-only config also needs `llmId` or audio passthrough.
  - Model: `cara-4` (recommended, and required for new avatars since 22 Sep 2026). Do not use `cara-4-latest` in production.
  - LLM: GPT OSS 120B (`a7cf662c-2ace-4de1-a21e-ef0fbf144bb7`) is the recommended LLM for tool use.
  - Optional fields: `systemPrompt`, `languageCode`, `initialMessage`, `maxSessionLengthSeconds`, `voiceDetectionOptions`.
  - Sources: [models](https://anam.ai/docs/introduction/models.md), [LLMs](https://anam.ai/docs/personas/llms/available-llms.md), [changelog](https://anam.ai/docs/changelog.md)
- `[MANDATORY]` (Anam) Front end: `npm install @anam-ai/js-sdk`. ⚠ Pin a version (4.28.0 and MIT at verification time, check `npm view @anam-ai/js-sdk version license`). The quickstart imports `@latest`.
  - Use a `<video autoplay playsinline>` element.
  - Register event and tool handlers **before** `await client.streamToVideoElement(id)`.
  - Call `stopStreaming()` on unload.
  - Serve over HTTPS (localhost is fine for dev); microphone access needs it.
  - Start from a user click (Safari/iOS audio needs a gesture).
  - Sources: [basic usage](https://anam.ai/docs/javascript-sdk/reference/basic-usage.md), [events](https://anam.ai/docs/javascript-sdk/reference/events.md), [FAQ](https://anam.ai/docs/resources/faq.md)
  - ⚠ No React SDK exists in the docs index (§9). Wrap the JS SDK in your own hook. Check: `https://anam.ai/docs/llms.txt`.
- `[MANDATORY]` (Anam) Network: allow TCP 443 to `api.anam.ai`, `lab.anam.ai`, `connect.anam.ai`, `connect-eu.anam.ai` and `connect-us.anam.ai`. For media, allow UDP 3478 with Cloudflare TURN fallback. If UDP is blocked, use `rtcConfiguration: {iceTransportPolicy: 'relay'}`. If you set a CSP, `connect-src` must include those hosts. [network](https://anam.ai/docs/security/network.md)
- `[RECOMMENDED]` Billing and limits (all from [billing and limits](https://anam.ai/docs/resources/billing-and-limits.md), [pricing](https://anam.ai/pricing), [duration](https://anam.ai/docs/personas/session/duration.md)):
  - **Free:** $0, 30 minutes per month, a 3-minute conversation cap, 1 concurrent session, no overage, and commercial use not included.
  - **Starter:** $12, 50 minutes, a 5-minute cap, $0.16 per minute overage, and commercial use included.
  - **Explorer:** $49, 250 minutes, a 10-minute cap, 3 concurrent sessions, watermark removal and $0.14 per minute overage.
  - Silence, a muted mic and an idle avatar still bill, so always stop sessions.
  - The platform caps a session at 2 hours.
  - A 429 on start can mean the concurrency, capacity or spend limit. Do not retry in a loop.
  - The public pricing page is not authoritative. Check: your Lab Billing page after sign-up.
- `[RECOMMENDED]` Judge access: Free allows a 3-minute conversation and rejects a second simultaneous user, and 30 minutes is about ten full conversations. Buy Starter or Explorer for the judging window. Add per-IP/user limits on your token endpoint and a short `maxSessionLengthSeconds`. Never give judges your API key. ToS 6(k) and 6(m) bar circumventing rate limits and excessive load ([ToS](https://anam.ai/terms-of-service)). Build a no-avatar or pre-recorded fallback mode.
- `[RECOMMENDED]` Giving the avatar family context:
  - Build the `systemPrompt` from the latest digest on your server at token time.
  - Use `client.addContext()` (SDK 4.11.0+) for live updates. No size limit is documented.
  - Use `client.talk()` or `createTalkMessageStream` to speak injected text. Send each chunk within 15 s; multi-utterance turns need Cara 4 and SDK 4.25 or 4.26 or later.
  - `sendUserMessage()` is not added to transcript events, so log it yourself.
  - Sources: [user messages](https://anam.ai/docs/javascript-sdk/reference/user-messages.md), [talk](https://anam.ai/docs/javascript-sdk/reference/talk-commands.md)
- `[MANDATORY]` (Anam) Tools: [overview](https://anam.ai/docs/personas/tools/overview.md), [webhook](https://anam.ai/docs/personas/tools/webhook-tools.md), [client](https://anam.ai/docs/personas/tools/client-tools.md)
  - Limits: 10 calls per turn, and 5 identical consecutive calls end the turn. Names match `^[a-zA-Z0-9_.-]+$` and are 1 to 64 characters; descriptions are 1 to 1024 characters.
  - Webhook tools: Anam's servers call your URL, so it must be public HTTPS (localhost needs a tunnel, and private hosts are rejected). Source IPs and retries are undocumented, so authenticate with a shared secret and make handlers idempotent.
  - Client tools run in the browser, work on localhost and need no public URL.
  - Timeouts: aim under 1 s. The docs conflict (5 s vs 60 s, see §9).
  - ⚠ Tool calling, Knowledge Base and Director Notes are labelled **beta**. See the ToS 2.4 risk in §5.1.
  - `[RECOMMENDED]` Avoid the Knowledge Base for live family updates. Documents can take about 25 minutes to become READY and there is no in-place update.
- `[RECOMMENDED]` Languages: STT supports 70+ languages, including Hindi (Anam and Deepgram) and Tamil (Anam only), plus Kannada, Marathi, Urdu and Nepali. [multilingual](https://anam.ai/docs/personas/voices/multilingual.md)
  - ASR language (`languageCode`) is separate from the spoken voice (`voiceId`). No page lists Hindi or Tamil TTS voices.
  - Check: audition voices in Lab before committing.
- `[RECOMMENDED]` Elder-friendly voice: [voice detection](https://anam.ai/docs/personas/session/voice-detection.md), [voice config](https://anam.ai/docs/personas/voices/configuration.md)
  - Defaults are `endOfSpeechSensitivity` 0.5, 5 s auto-end silence, 15 s skip-turn and 60 s session-end.
  - ⚠ Tuning these for slow speakers is inferred.
  - Slowing speech needs a Cartesia Sonic 3 voice (speed 0.6 to 1.5). ElevenLabs v3 and v4 do not expose speed.
  - Plan a wrap-up message about 20 s before the cap and an easy "start again" button.
- `[MANDATORY]` (Anam) Avatars: pick one of the 13 gallery avatars or one custom avatar. Custom avatars come from a square PNG, JPG or WebP of 1152x1152 or larger, up to 4.5 MB, with a neutral expression and closed mouth. [gallery](https://anam.ai/docs/personas/avatars/gallery.md), [custom avatars](https://anam.ai/docs/personas/avatars/custom-avatars.md)
  - ⚠ The docs do not confirm that gallery avatars are Cara-4-ready. Check: test each with `avatarModel: cara-4`.
- `[RECOMMENDED]` Transcripts: keep your own copy via `MESSAGE_HISTORY_UPDATED` and `GET /v1/sessions/{id}/transcript`. Tag sessions with `clientLabel`. Capture `sessionId` from `SESSION_READY`. [events](https://anam.ai/docs/javascript-sdk/reference/events.md)
- `[RECOMMENDED]` Handle microphone denial, the 20-second silence termination (`user_audio_never_received`) and WebRTC failure (about 1 minute) with plain-language UI. [termination reasons](https://anam.ai/docs/resources/session-termination-reasons.md)
- `[RECOMMENDED]` ⚠ Latency from India is unmeasured. Engine regions are `eu` and `us` only, and region choice is Enterprise-only. The FAQ says connection setup takes 4 to 5 s (up to 10 s), while Anam marketing claims under 1 s. Check: measure from India on day 1. [regions](https://anam.ai/docs/personas/session/regions.md)
- `[OPTIONAL]` Custom LLM routes, relevant to the AWS Builder challenge. Creating a custom LLM is documented as generally available. [custom LLMs](https://anam.ai/docs/personas/llms/custom-llms.md)
  - Formats: `openai`, `azure_openai`, `groq_openai`, `gemini`. Streaming is required.
  - ⚠ Route A (Bedrock's OpenAI-compatible endpoint registered as a custom LLM) is untested and inferred. Check: `curl` with `stream:true`, then Lab validation.
  - Route B (documented): set `llmId: CUSTOMER_CLIENT_V1`, listen to `MESSAGE_HISTORY_UPDATED`, call your own backend (Bedrock Converse, Strands), and stream tokens back with `createTalkMessageStream`. [example](https://anam.ai/docs/javascript-sdk/examples/custom-llm.md)
  - ⚠ Whether tool calling works with a server-side custom LLM is not documented.
- `[OPTIONAL]` Anam MCP server for Claude Code, system tools (`end_call`, `change_language`, ...), share links. [MCP](https://anam.ai/docs/resources/mcp.md), [system tools](https://anam.ai/docs/personas/tools/system-tools.md)

### 3.3 AWS, hosting and auth

- `[RECOMMENDED]` ⚠ Host the MCP server on an **AWS Lambda Function URL** (Node.js 24 arm64 or Python). It needs no cert or domain work, is near-free and is stateless-friendly. Ranking (inferred): Lambda URL, then API Gateway HTTP API (custom domain, $1 per million requests), then AgentCore, then ECS Express, then a VM behind a tunnel. [Lambda URLs](https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html)
- `[MANDATORY]` (AWS) Lambda Function URL with `AuthType NONE` needs **two** public resource-policy statements: `lambda:InvokeFunctionUrl` (with `--function-url-auth-type NONE`) and `lambda:InvokeFunction` (with `--invoked-via-function-url`). Console and SAM add them automatically, while CLI and CloudFormation do not. Missing either gives 403. [urls-auth](https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html) Your own code must do any auth check.
- `[RECOMMENDED]` Abuse guard: set reserved concurrency (the cap is 10x RPS, with 429 beyond it) and an AWS Budgets alert. Keep Lambda out of a VPC for latency.
- `[OPTIONAL]` Cold-start mitigation: an EventBridge warm ping (free) or provisioned concurrency (about $5.40 per month at 0.5 GB ⚠ my arithmetic). [Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- `[RECOMMENDED]` Data: DynamoDB (provisioned 5/5 is free; on-demand is pennies) for family, check-ins, messages and digests. Private S3 with presigned PUT/GET URLs for voice notes and photos. [DynamoDB](https://aws.amazon.com/dynamodb/pricing/on-demand/), [S3](https://aws.amazon.com/s3/pricing/)
- `[RECOMMENDED]` ⚠ Region: use us-east-1 for the server, data and Bedrock. The Alexa+ toolkit overview says "available in the United States", and us-east-1 has the broadest Claude profiles. Mumbai and Hyderabad are Global-profile only. (The us-east-1 choice is inferred.) [overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html), [Bedrock regions](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html)
- `[RECOMMENDED]` Bedrock auth: grant `bedrock:InvokeModel` to the Lambda execution role, including inference-profile and destination-Region ARNs for `global.` profiles. Use short-term API keys (up to 12 h) for quick tests only. [API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html)
  - ⚠ The model ID `anthropic.claude-haiku-5-5` is unverified. Check: the Bedrock console.
- `[OPTIONAL]` Strands Agents SDK (Apache-2.0): `pip install strands-agents` or `npm install @strands-agents/sdk`. It has MCP support and AgentCore deployment guides. [Strands](https://strandsagents.com/), [repo](https://github.com/strands-agents/sdk-python)
- `[OPTIONAL]` AgentCore Runtime for the Strands brain only. If used: Streamable HTTP on `0.0.0.0:8000/mcp`, ARM64, stateless, and it must accept `Mcp-Session-Id`. [contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp-protocol-contract.html)
  - It is a poor front door for Alexa+: it sends `WWW-Authenticate` on 401, uses AWS-hosted metadata paths, and is paid-plan only. [runtime-oauth](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-oauth.html)
- `[RECOMMENDED]` Do not use AWS App Runner (closed to new customers). [App Runner](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html) `cloudflared` Quick Tunnels (a new hostname on every run, no SSE, no uptime guarantee) are dev-only. [Cloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)
- `[RECOMMENDED]` Path B auth: use synthetic data and a simple bearer token or none. Never expose real family data on a public endpoint. If you implement OAuth anyway, see the Path A rules in §3.1.

### 3.4 Notifications (family-facing; keep behind one `send_notification()` abstraction)
Ranking is inferred ⚠.
1. `[RECOMMENDED]` **Telegram bot.** Free, takes minutes, and sends voice and photo files up to 50 MB. About 1 message per second per chat. Each relative must press Start first; use a `t.me/<bot>?start=<code>` invite link. ⚠ The "bots cannot initiate" rule is secondary-sourced. [Telegram FAQ](https://core.telegram.org/bots/faq)
2. `[RECOMMENDED]` **SES email.** Sandbox is fine if the 3 to 5 demo relatives are verified. $0.10 per 1,000 emails. Send presigned S3 links, not attachments. [SES](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
3. `[OPTIONAL]` **FCM web push** for the dashboard. It needs HTTPS, a service worker and a VAPID key, and permission is per browser. [FCM](https://firebase.google.com/docs/cloud-messaging/js/client)
4. `[OPTIONAL]` ⚠ WhatsApp Cloud API. The test number is quick, but business-initiated messages must be templates (review up to 24 h). Business verification time and limits are unconfirmed. [Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)
5. `[OPTIONAL]` **Avoid SMS.** India needs TRAI DLT registration (PAN, TAN, GSTIN, CIN, letter of authorisation) with no stated duration. [AWS DLT](https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-sms-senderid-india.html) The SNS sandbox allows only 10 verified numbers, and US routes carry registration fees. [SNS sandbox](https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox.html)

---

## 4. Mini challenges

### 4.1 AWS Builder
- `[MANDATORY]` (Devpost) It is a layer on a primary-track project. Incorporate AWS services with documented integrations (Bedrock, AgentCore, Strands SDK, Kiro Crew, SageMaker, etc.). [Rules §4, §6](https://amazonappdev2026.devpost.com/rules)
- `[MANDATORY]` (Devpost) Describe which AWS services you used and how, **in the Product Feedback answer**. [Rules](https://amazonappdev2026.devpost.com/rules)
- `[MANDATORY]` (Devpost) Kiro Crew qualifies on its own as a dev tool, with no runtime AWS call. A judge confirmed Claude Code running on Bedrock counts too ([forum 45321](https://amazonappdev2026.devpost.com/forum_topics/45321-aws-builder-does-claude-code-running-on-amazon-bedrock-count-as-a-dev-tool)).
  - ⚠ Claude Code on Bedrock still needs working Bedrock Claude access (the AISPL risk in §2). Kiro Crew is the lower-risk qualifier.
  - Kiro Crew is open-source, runs locally, and needs a kiro-cli sign-in. [Crew](https://kiro.dev/docs/crew/)
  - ⚠ Kiro's Free tier (50 credits) may not include Crew. [pricing](https://kiro.dev/pricing/) Check: Kiro sign-up.
- `[RECOMMENDED]` Judging notes call a single Bedrock call or S3 storage "obvious" and favour multi-service or agentic pipelines. [Rules §6](https://amazonappdev2026.devpost.com/rules)
  - Suggested minimum evidence (inferred, since no page defines proof): a Bedrock Converse call (for example the daily digest), wrapped in a Strands agent that uses the Haven MCP tools. Add a README "AWS integration" section with an architecture diagram, model ID, region, IAM role, a CloudWatch log excerpt and file/line links. Repeat it in the Devpost text.
- Prize: $5,000 cash plus $5,000 AWS credits. You can win at most one mini prize.

### 4.2 Open Source
- `[MANDATORY]` (Devpost) Four fields are required: **contribution URL, project repo URL, GitHub username, and a what/how/why description.** [Rules §4, §6](https://amazonappdev2026.devpost.com/rules)
- `[MANDATORY]` (Devpost) Create a **new, additional** open-source project (with an OSS licence file) or contribute to an existing public repo (a new repo, branch, fork or PR; unmerged is fine) during the hackathon, alongside a primary-track submission. A fresh repo made at the start of the hackathon for another hackathon is acceptable ([forum 45310](https://amazonappdev2026.devpost.com/forum_topics/45310-question-related-to-mini-challenge)).
- ⚠ Open questions (no official answer): whether the primary repo can double as the "additional" project, the exact hackathon window (assume the Submission Period) and how multi-account team contributions are credited ([forum 45524](https://amazonappdev2026.devpost.com/forum_topics/45524-open-source-mini-challenge-can-a-team-contribute-through-multiple-github-accounts)). Check: ask on the forum.
- `[RECOMMENDED]` ⚠ Ship a separate OSS deliverable to be safe. Ideas (inferred): a reusable Lambda adapter for stateless Streamable-HTTP MCP, a minimal Alexa-style OAuth/PRM helper, or an Anam elder-friendly hook with tests. Use one GitHub account for the contribution URL.
- `[RECOMMENDED]` Judging examples: README or typo fixes are "obvious"; meaningful features with tests, bug fixes and new integration patterns are "creative". [Rules §6](https://amazonappdev2026.devpost.com/rules)
- `[RECOMMENDED]` Follow the upstream project's CLA or DCO and its AI-contribution policy (inferred). Anam's closed platform does not count as a contribution. The Anam JS SDK is MIT ([npm](https://registry.npmjs.org/@anam-ai/js-sdk/latest)).

### 4.3 Friction-log bonus (up to 10%)
- `[OPTIONAL]` (Devpost) Each entry has six fields: task attempted, steps taken, expected vs actual, severity, workaround and actionable suggestion. Amazon's internal team assesses the logs at Stage 1 down-selection and passes a recommended bonus of up to 10% to the Stage 2 panel, which applies it to the final score. A link in the description is fine, and keeping the log in the same repo is easiest for judges. [Rules §4, §6](https://amazonappdev2026.devpost.com/rules), [forum 45430](https://amazonappdev2026.devpost.com/forum_topics/45430-inquiry-about-submission-mechanics)
- `[RECOMMENDED]` Seed entries as you go: the `@alexa-ai/cli` 404 and the gating inconsistency across docs, Alexa+ OAuth metadata and 401 behaviour, Bedrock AISPL payment, Anam pricing-page inconsistencies, the Anam webhook timeout contradiction, and the missing Hindi/Tamil voice listing.
- `[OPTIONAL]` Amazon's Head of Dev Evangelism published a template ([MIT repo](https://github.com/chris-trag/friction-log-guide)). The Rules' six fields take precedence. That GitHub profile contains text addressed to AI agents, which was not followed.
- ⚠ Anam ToS 6(i) bars benchmarking. Avoid publishing latency comparisons. See §5.1 for the beta-feature clause before writing up beta features publicly.

---

## 5. Policy, privacy and safety

### 5.1 Binding on you now (vendor contracts and hackathon rules)
- `[MANDATORY]` (Anam) Tell users clearly they are talking to an AI persona (ToS 6(o)). Set `sessionOptions.showAIAvatarDisclosure: true` in the server-side token request, because SDK sessions have no Anam disclosure by default. Also use a spoken opening line, a persistent "AI companion" label, and an honest answer to "are you real?". [ToS](https://anam.ai/terms-of-service), [disclosure](https://anam.ai/docs/security/ai-avatar-disclosure.md)
- `[MANDATORY]` (Anam) You warrant you hold all consents from end users (ToS 6.1.1). Content is shared with Anam's AI sub-providers (6.2.1), so name that chain in your privacy policy. [ToS](https://anam.ai/terms-of-service)
- `[MANDATORY]` (Anam) Consent for the likeness or voice behind any custom avatar or cloned voice. Never clone a relative's or deceased person's voice without explicit consent. [AI governance](https://anam.ai/ai-governance), [AUP](https://anam.ai/acceptable-use-policy)
- `[MANDATORY]` (Anam AUP) You may not use the services for uses that "could result in death or serious bodily injury". You must moderate persona use, and stock-persona statements may not be attributed to the actor, which explicitly includes discussions about medical conditions or disabilities. Do not remove or disable watermarks or provenance marks, and do not remove notices (ToS 6(j)). [AUP](https://anam.ai/acceptable-use-policy)
  - `[RECOMMENDED]` Use a custom or AI-generated avatar, not a stock persona, for health-adjacent chat. Never present Haven as a medical-alert or emergency service. (This reading of the AUP is inferred.)
- ⚠ **ToS 6(n)** bars taking action in reliance on Interactions "without prior human intervention, review and approval". Autonomous `escalate_need` and `send_message_to_family` could be read as breaching it. The governance page leaves human oversight to the customer. Mitigation: the elder confirms by voice, or a relative approves, before irreversible actions. Check: ask support@anam.ai in writing. [ToS](https://anam.ai/terms-of-service), [governance](https://anam.ai/ai-governance)
- ⚠ **ToS 2.4 (beta features):** use is for internal evaluation only, and you may not publish details of any beta feature (including evaluation or testing) without Anam's written consent. Tool calling, the Knowledge Base and Director Notes are labelled beta. A public demo, Devpost write-up or friction log that details them could breach it. Mitigation: get written consent, or avoid beta features (drive tools from your own backend via `talk()` and `addContext`). Check: ask support@anam.ai.
- ⚠ ToS 2.1 and 2.2 (trial and evaluation clauses) and AUP "business use, not consumer or household" are not reconciled with the self-serve Free plan or a consumer product. Check: written confirmation from Anam that a public hackathon demo is allowed on your plan.
- `[MANDATORY]` (Anam) Data handling: [privacy](https://anam.ai/docs/security/privacy.md), [privacy policy](https://anam.ai/privacy-policy)
  - Non-ZDR recordings are kept up to 30 days. Session reports stay until you delete them. Zero Data Retention is Enterprise-only.
  - Session replay is on by default, so set `enableSessionReplay: false`.
  - Inference runs in Spain/EU and US East, a cross-border transfer for an India-based user, so disclose it.
  - The service is not intended for under-16s.
- `[MANDATORY]` (AWS) If you use Bedrock, the AWS Responsible AI Policy applies. It bars impersonation or depicting a voice or likeness without consent, harming minors, violating privacy, and deception. Consequential health decisions need risk assessment and human oversight. [AWS RAI](https://aws.amazon.com/ai/responsible-ai/policy/)
- `[MANDATORY]` (Devpost) Rights you grant: the sponsor gets a judging licence, and promotional use of names, likeness, voice and image for 3 years. Devpost ToS adds a perpetual display licence. Use synthetic or consenting people only. [Rules §7, §10](https://amazonappdev2026.devpost.com/rules), [Devpost ToS](https://info.devpost.com/legal/terms-of-service)
- `[MANDATORY]` (Anthropic) If Claude is your LLM, consumer chatbots must disclose AI at the start of each session. ⚠ The page read is forward-dated (effective 12 Nov 2026). Check: the version in force today. [AUP](https://www.anthropic.com/legal/aup)

### 5.2 Alexa+ policy (binding only if you ship a real add-on; use as design guidance on Path B)
All from [policy requirements](https://developer.amazon.com/en-US/docs/alexaplus/add-ons/policy-requirements.html) and [functional requirements](https://developer.amazon.com/docs/alexaplus/add-ons/functional-requirements.html) unless noted. The criteria are "preliminary" and Amazon says security and data-policy detail is still to be published.
- `[MANDATORY]` (Path A) Valid HTTPS privacy-policy and terms URLs covering usage, retention (with periods) and deletion. A one-time data-sharing permission prompt before first interaction. ⚠ The docs do not say who renders the prompt.
- `[MANDATORY]` (Path A) Data minimisation:
  - No collecting data about the customer's Alexa environment.
  - No reciting private personal information by voice.
  - No tool-schema fields unrelated to the purpose, and no unbounded free text.
  - Sensitive data needs explicit consent.
  - Design `log_checkin` with bounded fields.
- `[MANDATORY]` (Path A) Never target children or collect their data (§4). Relatives' uploads of grandchildren's voice or photos are a tension with this rule. Mitigation: adult-only uploaders with an attestation, no child profiles, and no child media in the demo.
- `[MANDATORY]` (Path A) No claim of life-saving or emergency-intervention capability (§13, formally scoped to Health/Medical/Drug/Food, but the category can be reassigned). Name tools and write copy as "notify family" and tell the elder to call the local emergency number. Tool descriptions lock after publication. Redirect crisis or suicidal-intent references to emergency services or hotlines, and attribute medical information with a disclaimer.
- `[MANDATORY]` (Path A) Documented consent and Proof of Rights for any real person's name, likeness or voice. Safety controls against prompt injection and roleplay exploits for UGC add-ons (§12). Treat transcripts of relatives' uploads as untrusted data.
- `[MANDATORY]` (Path A) No "online spying, or customer tracking" (§2). Frame Haven as elder-controlled sharing, where the elder opts in, chooses what relatives see, and digests summarise rather than expose.
- `[MANDATORY]` (Path A) Brand rules: no Amazon, Alexa, Echo or Fire TV marks in keywords. The icon holds only your wordmark, with no Amazon device images and no placeholder text. No exaggerated claims. Consumer-only add-ons. Not merely relaying queries to an LLM.
- `[MANDATORY]` (Path A) Account-linking rules: QR code with OAuth 2.1 plus PKCE on screens, push on screenless devices, 401 on bad tokens, and never return a previously linked account's data. Explicit confirmation before high-consequence actions (payment, cancellation, deletion).
- `[MANDATORY]` (Path A) Accessibility: [accessibility](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-accessibility.html)
  - Support VoiceView, Captions, Screen Magnifier and Color tools.
  - Every flow completable by voice-only or touch-only.
  - Touch targets of at least 48x48 px.
  - Contrast of 4.5:1 for small text and 3:1 for large text.
  - Alt text of at most 125 characters.
  - No more than 3 flashes per second.

### 5.3 Laws (not hackathon gates; read secondary summaries, not statute text)
- `[RECOMMENDED]` ⚠ Mirror the cheap parts now. Not legal advice.
  - **California SB 243** (companion chatbots, in effect 1 Jan 2026): AI notice, a published suicide/self-harm protocol, crisis referral, and a private right of action. [Skadden](https://www.skadden.com/insights/publications/2025/10/new-california-companion-chatbot-law)
  - **New York companion-AI law** (effective 5 Nov 2025): AI notice at session start and every 3 hours, and crisis referral. [NY Governor](https://www.governor.ny.gov/news/governor-hochul-pens-letter-ai-companion-companies-notifying-them-safeguard-requirements-are)
  - **EU AI Act Art. 50** (in application since 2 Aug 2026): tell users they are dealing with an AI. Art. 5 bans manipulation or exploitation of age or disability vulnerabilities. [Art. 50](https://artificialintelligenceact.eu/article/50/), [Art. 5](https://artificialintelligenceact.eu/article/5/)
  - **India DPDP Rules 2025:** most duties (notice, security, breach, erasure, guardian consent) start about May 2027, so they are not yet in force for the demo but apply to a real launch. [SCC Online](https://www.scconline.com/blog/post/2025/12/26/digital-personal-data-protection-rules-2025-key-highlights/)
  - **India IT Rules 2026** on synthetic-content labelling. [HLC](https://www.hlc.com/en/publications/india-introduces-mandatory-labelling-for-ai-and-3hour-takedown-for-illegal-content)
  - **COPPA** (amended, effective 22 Apr 2026): audio and voiceprints are personal information. [Bass Berry](https://bassberry.com/news/amendments-to-the-coppa-rule-now-in-effect/)
- `[RECOMMENDED]` ⚠ Crisis helplines (secondary sources; the Tele-MANAS official site failed certificate validation): US 988 and 911 ([988lifeline.org](https://988lifeline.org/)); India Tele-MANAS 14416 (24/7), Elderline 14567 and 112 (unverified). [Vikaspedia](https://en.vikaspedia.in/viewcontent/health/mental-health/national-tele-mental-health-programme?lgn=en)

### 5.4 Safety design (all `[RECOMMENDED]`)
- Confirm by voice or relative approval before `send_message_to_family` and `escalate_need`. Make escalations idempotent, rate-limited and audit-logged. If a notification fails, tell the elder plainly. This also helps with Anam 6(n) and the MCP spec.
- Elder opt-in in plain language, per-relative visibility, a one-tap "delete my data" (with confirmation) and one-tap revoke. A guardian path for elders lacking capacity.
- Store summaries rather than raw audio or transcripts. ⚠ A 30-day purge to match the vendor is inferred. Name the retention in the privacy policy.
- Do not diagnose, dose or triage. Offer reminders, check-ins and relaying family's instructions. Attribute any health information.
- Guard against dependency and sycophancy: suggest calling family, measure human contacts rather than minutes, include a gentle break and an "I am an AI" reminder about every 3 hours, and add no upsell.
- Optional: Amazon Bedrock Guardrails (denied topics for diagnosis/dosage, PII masking, prompt-attack filters), off the critical latency path. [Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html)
- Host privacy and terms pages free on GitHub Pages (HTTPS automatically). Cover every data type, the processor chain, retention, deletion and the "not emergency or medical" statement. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- Web-app accessibility: WCAG 2.2 AA, always-on captions, a speech-rate control, large-type and high-contrast modes, 48 px targets, a fully voice-operable flow and no timed steps for the elder. [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/), [older users](https://www.w3.org/WAI/older-users/developing/)
- Use only synthetic fixtures in the public repo. No real media, tokens or logs.
- YouTube: answer "not made for kids", and disclose realistic synthetic content in the upload settings. [YouTube](https://support.google.com/youtube/answer/14328491)
- Add a short "Safety, privacy and limits" section to the Devpost text, listing what you deliberately did not build (no diagnosis, no voice cloning, no children).

---

## 6. Costs

| Item | Cost | Confidence |
|---|---|---|
| Devpost entry | $0 (no purchase necessary) | [Rules](https://amazonappdev2026.devpost.com/rules) |
| Anam Free / Starter / Explorer | $0 / $12 / $49 per month. Overage $0.16 / $0.14 per minute. | [pricing](https://anam.ai/pricing). Card vs table inconsistent, confirm in Lab. |
| AWS Free plan credits | $100 sign-up plus up to $100 more, for 6 months. The hackathon's $150 credits are gone. | [AWS](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html) |
| Lambda | $0 within the free tier (1M requests, 400k GB-s). Provisioned concurrency about $5.40 per month ⚠ my arithmetic. | [Lambda](https://aws.amazon.com/lambda/pricing/) |
| DynamoDB, S3 | Under about $1 per month at demo scale. The first 100 GB/month of internet egress is free. | [DynamoDB](https://aws.amazon.com/dynamodb/pricing/on-demand/), [S3](https://aws.amazon.com/s3/pricing/) |
| Cognito (if used) | $0 under 10k MAU. M2M token requests have no free tier. | [Cognito](https://aws.amazon.com/cognito/pricing/) |
| API Gateway HTTP API (if used) | $1.00 per million requests | [API Gateway](https://aws.amazon.com/api-gateway/pricing/) |
| SES | $0.10 per 1,000 emails | [SES](https://aws.amazon.com/ses/pricing/) |
| Telegram, FCM, GitHub Pages | $0 | Primary docs |
| Bedrock | ⚠ Haiku 5.5 about $1 per 5M input plus 1M output tokens ($0.10 / $0.50 per million). Sonnet 5.5 about $20 for the same ($2 / $10). Unverified, because the official rate tables did not render. | Secondary ([Classmethod](https://dev.classmethod.jp/en/articles/bedrock-claude-haiku-5-5/)). Check: Bedrock console or Price List API. |
| AgentCore Runtime (if used) | $0.0895 per vCPU-hour plus $0.00945 per GB-hour. Paid plan only. | [AgentCore](https://aws.amazon.com/bedrock/agentcore/pricing/) |
| Kiro | Free (50 credits) or Pro $20 | [Kiro](https://kiro.dev/pricing/) |
| Realistic total | ⚠ About $12 to $70 per month for Anam, plus under about $20 for AWS (inferred). Nothing found would exceed a few hundred dollars. | Inferred |
| Post-win costs | Winner pays wire/FX fees and local taxes. A W-8BEN may be needed. | [Rules §8](https://amazonappdev2026.devpost.com/rules) |

---

## 7. Biggest risks, ranked

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Depending on real Alexa+ tooling that entrants cannot get** | Decide at the day-1 gate. Build Path B (real MCP server plus a web MCP client). Keep Alexa+ add-on work out of the critical path. |
| 2 | **Submission mechanics:** Draft is not Submitted; a private repo invite expires or is never accepted; the video is not public or is over 3:00; the deadline is misread (23 Oct 12:00 PM PT = 24 Oct 00:30 IST); no edits after the deadline | Submit a full draft by about 16 Oct. Use a public repo. Set an internal cutoff of 22 Oct 6 PM PT (23 Oct 06:30 IST). Verify the green "Submitted" tag and the logged-out video link. |
| 3 | **AWS India (AISPL) account:** slow customer verification, or Claude on Bedrock failing at Marketplace payment | Create the account first. Test a Claude invoke in hour 1. Ask for Pay By Invoice, or fall back to Nova/gpt-oss (non-Marketplace) and Kiro Crew for the AWS Builder claim. |
| 4 | **Anam limits and terms:** a 3-minute and 30-minute Free plan, 1 concurrent session, beta-feature clause (ToS 2.4), human-review clause (6(n)), Free/consumer-use ambiguity | Buy Starter or Explorer for judging. Add a fallback mode. Add human confirmation for actions. Email support@anam.ai on day 1 and record the answers. Avoid details of beta features in public text until cleared. |
| 5 | **Demo or endpoint down during judging** (rules: free access until judging ends; judging may start 26 Oct per the Schedule tab) | Keep Lambda and the web demo live from submission to 20 Nov. Use reserved concurrency and budget alerts. Provide a mock/fallback mode. |
| 6 | **Scope in 10 days** | Freeze tool schemas early. Use fake or seed family data. Cut the Knowledge Base, SMS, WhatsApp, OAuth and certification. |
| 7 | **Differentiation:** 54,402 registrants and an overlapping caregiving idea | Make the avatar, family digest and voice-note/photo loop visible, with persistent state and media. Avoid a thin MCP wrapper. |
| 8 | **Video violations:** third-party logos or music, real people, minors | Use plain-text references, royalty-free or own audio, synthetic data and consenting adults, and releases. |
| 9 | **Policy design traps:** child data from relatives' uploads, emergency claims, autonomous escalation, tool copy locked after publication | Adult-only uploaders, "notify family" wording, confirmations, and no medical claims. |
| 10 | **MCP interop:** protocol-version drift, CORS and Origin, the 401/WWW-Authenticate contradiction | Support 2025-11-25 and 2025-03-26, stateless JSON, and same-origin or single-place CORS. Test with MCP Inspector and a real browser. |
| 11 | **Open Source challenge ambiguity** (does the primary repo count?) | Ship a separate small OSS repo or PR. Ask on the forum. |
| 12 | **Indian latency (Anam, no APAC region) and payments (card, tax)** | Measure latency early. Test the card on day 1. Handle post-win tax later with a professional. |

---

## 8. Day-1 action list (13 Oct)

- [ ] **(30 min)** Log in to Devpost. Click **Join hackathon**. Read `/rules`, `/details/faqs` and the forum threads in a browser, and note the actual form fields. Confirm eligibility and residence. Pick the Representative and any teammates.
- [ ] **(15 min)** Declare the decision: **Path B** (MCP server plus web MCP client), unless you already hold Alexa+ toolkit access. Do not open an access-request workstream.
- [ ] **(2 to 4 h, start first)** AWS: create or verify the account (AISPL verification), switch to the Paid plan, set a Budgets alert, complete the Bedrock FTU form, and run a real Claude invoke. If it fails, open a Support case (Pay By Invoice) and test Nova.
- [ ] **(1 h)** Anam: sign up, create an API key (server-only), create a persona with `cara-4`, audition Hindi/Tamil/English voices, measure latency from India, and decide the paid plan. Email support@anam.ai with these questions:
  - Is a public hackathon demo allowed on your plan?
  - May you publish details of beta features such as tool calling?
  - Is human confirmation sufficient for ToS 6(n)?
  - Do you need custom-voice access?
- [ ] **(1 h)** GitHub: create the repo with an OSI LICENSE, `.gitignore`, `.env.example` and a secrets scanner. Start `README.md`, `FRICTION_LOG.md` and `PRODUCT_FEEDBACK.md`. Decide public vs private. Keep commits dated after 31 Aug.
- [ ] **(2 to 3 h)** MCP server on Lambda: stateless JSON, `/mcp` POST, `initialize` negotiation (2025-11-25 and 2025-03-26), Origin validation, and the Function URL's two permissions. Stub the five tools (`get_family_updates`, `send_message_to_family`, `log_checkin`, `request_call`, `escalate_need`) against DynamoDB. Verify with MCP Inspector.
- [ ] **(2 h)** Anam token endpoint plus web page: a pinned SDK, AI disclosure on (`showAIAvatarDisclosure`), a caption area, an MCP-client panel showing live `tools/call` logs, and a fallback mode.
- [ ] **(30 min)** Pick the Open Source deliverable (a separate repo or PR) and the AWS Builder evidence plan (Bedrock plus Strands, or Kiro Crew).
- [ ] **(30 min)** Calendar: Office Hours #2 on 19 Oct 9:00 AM PT (21:30 IST); a full draft by 16 Oct; video recorded 20 to 21 Oct; final submit by 22 Oct 6 PM PT (23 Oct 06:30 IST); a checklist re-read before submitting.
- [ ] `[RECOMMENDED]` ⚠ Suggested schedule (inferred): 13 to 14 Oct setup plus skeleton; 15 to 17 core tools, avatar and dashboard; 16 Oct early draft; 18 to 19 Oct polish, safety items and friction log; 20 to 21 Oct video and README; 22 Oct final checks and submit.

---

## 9. Conflicts and open questions

1. **Alexa+ tooling access.** Alexa dev-setup and quickstart pages read as self-serve (free account, Node 24+, `alexa-ai` CLI, Web Simulator) and your established facts assume this. The Alexa docs home ("select partners only"), the Devpost FAQ, staff forum answers and public npm 404s say it is unavailable to entrants. The FAQ itself admits the gating note is "sometimes missing from individual setup-guide pages". **Resolution:** the hackathon sources prevail, so use Path B. The development-stage docs also say you "request access to the Private Preview" with no process or timeline, which was not usable as a plan.
2. **"US only".** Your established facts say the toolkit is "available only in the United States". The overview reads "The MCP Toolkit is available in the United States" (no "only"). Alexa+ India Early Access (16 Sep 2026) is a consumer launch, and no developer page ties it to add-on availability. Moot for Path B.
3. **401 and `WWW-Authenticate`.** Amazon's quickstart says no header and lists it as unsupported. The MCP 2025-11-25 spec requires the protected-resource metadata via the header or the well-known URI, and AgentCore always sends the header. Unresolved whether Alexa+ tolerates the header. Check: Path A testing only. Also, the Alexa pages disagree on well-known paths, and the account-linking page says linking is optional while the quickstart checklist reads as unconditional.
4. **MCP protocol versions.** Devpost wants 2025-11-25 ("or later, once confirmed"). Alexa's lifecycle example sends 2025-03-26. The current MCP spec, 2026-07-28, removes `initialize` and `Mcp-Session-Id`. **Resolution:** support the first two, and ask staff before shipping anything newer.
5. **Judging start date.** Rules say 9 Nov to 20 Nov (PT). The Schedule tab says judging begins 26 Oct 12:00 PM PT (27 Oct 00:30 IST). The end and winner dates agree. The Rules prevail, but keep everything live from submission day.
6. **Must the endpoint stay live?** The FAQ says the server need not keep running and a locally runnable repo plus video suffices. A judge answered "Yes, live until judging ends" in two threads, and the Rules' Testing clause requires availability until judging ends. **Resolution:** stay live through 20 Nov.
7. **Private-repo reviewer list.** The Rules/main page links five GitHub users, the FAQ lists five, and the Updates post and a Devpost manager's reply list six plus `testing@devpost.com`. An older forum quote said `@AmazonAppDev` (an organisation, which cannot be a collaborator). **Resolution:** invite all seven.
8. **AWS credits.** The Rules text still describes a $150 request process until 21 Oct, but a 7 Oct banner says all codes are gone. **Resolution:** treat credits as unavailable.
9. **AWS Builder qualifier naming.** You established "Kiro Crew". Resources text via secondary sources says "Kiro". The Rules say Kiro Crew qualifies on its own.
10. **Video host.** Devpost's generic help allows YouTube, Vimeo or Youku, but this hackathon's Rules allow only YouTube or Vimeo.
11. **Anam Free tier.** The pricing-page inconsistency in your facts (30 vs 50 minutes, 3 vs 5-minute cap) is resolved: Free is 30 minutes, a 3-minute cap and 1 concurrent session, and 50 minutes with a 5-minute cap belongs to Starter. Residual conflicts:
    - Starter concurrency is 3 on the card but 1 in the table.
    - Growth early access is shown in the card but "not included" in the table.
    - The `interactive-avatars` page says "1 custom avatar" on Free, while pricing and billing docs say unlimited saved avatars.
    - Max session length: duration docs say unlimited on Growth and above; pricing and the termination-reasons page say 2 hours.
12. **Anam SDKs.** Your facts mention a React SDK. None was found in the docs index. Wrap `@anam-ai/js-sdk` yourself. The multi-utterance SDK minimum is stated as 4.25.0 and 4.26.0 in different places, so use the latest.
13. **Anam webhook timeout.** 5 s (tools overview) vs 60 s hard limit (webhook-tools and example). Test empirically and design for under 1 s.
14. **Anam custom LLM.** No "coming soon" wording was found. It is documented as generally available via Lab or `POST /v1/llms`. Check the Lab for any plan gate.
15. **Anam latency claims.** FAQ 4 to 5 s (up to 10 s) vs marketing under 1 s. Custom voice access: pricing says it is on every plan, while the custom-voices doc says it needs access enabled.
16. **Anam voice cloning claim.** A researcher cited an 11 Oct 2026 changelog entry on 44 cloning languages. The verifier could not find it, so it was dropped. Do not rely on Hindi or Tamil voice cloning. Check: audition voices in Lab.
17. **Alexa+ policy vs Haven's design.** Tensions, not source disagreements:
    - Voice-reciting private information vs reading family messages aloud.
    - The no-children's-data rule vs grandchildren's uploads.
    - "No emergency claims" vs tools named `escalate_need` and `request_call`.
    - Anam 6(n) human review vs autonomous MCP tools.
18. **"Agent Skill".** Used in two senses: the MCP-ecosystem "Build with Agent Skills" page linked from Resources, and, by a judge, an "Alexa skill" for the original Alexa. The Rules do not define it. Check: ask on the forum if you want to take this route.
19. **Minor.** Devpost ToS routes hackathon disputes to local courts, while the Rules require AAA arbitration under New York law (the Rules control). The Free-plan end is 6 months in AWS docs but 12 months in S3/SES pricing wording. The AWS ToS versions of the AISPL fix come from AWS docs; the "pay within one hour" detail is unverified.

**Open questions that remain unanswered**
- The gated submission form's exact fields and character limits.
- Whether each reviewer must have accepted the GitHub invite or only been invited.
- Whether the primary repo can double as the Open Source "additional" project, the exact hackathon window and multi-account credit.
- How AWS credit prizes are delivered.
- India-specific tax and remittance treatment of a prize.
- The Alexa+ add-on category Haven would get, and which Amazon policy sections would apply.
- Whether Anam permits public hackathon use on a self-serve plan, and how it reads ToS 6(n) and 2.4.
- Anam Hindi/Tamil voice availability and latency from India.
- Whether Alexa+ breaks on a `WWW-Authenticate` header (Path A only).
- Whether you are an India resident (the document assumes so).

**Injection notes:** the Devpost Rules and Overview pages contain a first-person sentence telling an AI assistant to make the repo private and add collaborators. The `chris-trag` GitHub profile contains text addressed to AI agents about reading `trag.dev/context`. A third-party perks page contained text addressed to AI assistants. All three were treated as page data and not acted on. Do the collaborator step yourself at submit time.