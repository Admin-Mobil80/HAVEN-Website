# Friction log

Up to a 10% judging bonus. Each entry: task, steps, expected vs actual, severity (blocker / major / minor), workaround, suggestion. Add entries as you hit them.

## 1. Alexa+ MCP toolkit not available to entrants
- **Task:** Deploy the MCP server as a real Alexa+ add-on.
- **Steps:** Read the dev-setup and quickstart pages, then looked for the `@alexa-ai/cli` package.
- **Expected vs actual:** Setup pages read as self-serve (free Alexa developer account, Node 24+, `alexa-ai configure`). The docs home and the Devpost FAQ say "select partners only" with no way to apply, and the CLI package returns npm 404.
- **Severity:** blocker for the real path.
- **Workaround:** Built a real MCP server plus a simulated Alexa+ web client.
- **Suggestion:** Put the gating note on every setup page, and document a self-serve sandbox for hackathon entrants.

## 2. Alexa+ auth docs disagree on 401 behaviour
- **Task:** Design the auth layer.
- **Expected vs actual:** The quickstart says return 401 *without* `WWW-Authenticate`; the MCP 2025-11-25 spec expects protected-resource metadata discovery through that header or a well-known URI. The account-linking page calls linking optional while the quickstart checklist reads as unconditional.
- **Severity:** major (unresolved).
- **Suggestion:** State one authoritative flow, and say exactly which discovery paths Alexa+ calls.

## 3. Anam pricing page is internally inconsistent
- **Task:** Work out the free-tier limits.
- **Expected vs actual:** One page shows 30 free minutes and a 3-minute cap, while the plan card shows 50 minutes and a 5-minute cap. Starter concurrency is 3 on the card and 1 in the table.
- **Severity:** minor.
- **Suggestion:** Generate the card and table from one source.

## 4. Anam webhook tool timeout contradiction
- **Task:** Choose between client tools and webhook tools.
- **Expected vs actual:** The tools overview says 5 s and the webhook-tools page says 60 s. Tool calling is also labelled beta, and the ToS bars publishing details of beta features without consent.
- **Severity:** major.
- **Workaround:** Drive tools from our own backend and avoid beta features in public text.
- **Suggestion:** Document one timeout, and clarify the beta-disclosure clause for hackathon write-ups.

## 5. Anam quickstart puts the API key in browser code
- **Task:** Follow the JS SDK quickstart.
- **Expected vs actual:** The quickstart shows a key-in-browser pattern and imports `@latest`; the authentication page says to keep the key server-side.
- **Severity:** minor (security footgun).
- **Workaround:** Backend session-token endpoint and a pinned SDK version.

## 6. No Hindi/Tamil TTS voice listing
- **Task:** Pick a voice for Tamil- and Hindi-speaking elders.
- **Expected vs actual:** The docs list Hindi and Tamil speech recognition but no page lists Hindi or Tamil TTS voices.
- **Severity:** minor.

<!-- Add: AWS India account verification, Bedrock Claude access from an AISPL account, anything new -->
