# Haven: a bridge to your real family

Haven is an AI companion for people who are lonely or confined (a grandparent far from grandchildren, someone on bed-rest). A real-time **Anam** avatar keeps them company, and an **Alexa+-style MCP server** connects every conversation back to the people who matter: read family voice notes aloud, send messages, request a call, log a wellbeing check-in, and tell family when help is needed.

Haven is an AI. It never pretends to be a person, never diagnoses, and is **not an emergency service** (it tells users to call 112).

Built for the **Amazon Developer Hackathon 2026 (Build, Ship, Shape)**. Track: **Alexa+**. Mini challenges: **AWS Builder**, **Open Source**.

## How it works

```
 Elder ── voice ──▶ Anam avatar (browser, WebRTC)
   │                    ▲  system prompt built server-side from the family digest
   │                    │
   └─ "Alexa+" box ─▶ simulated Alexa+ web client ──MCP 2025-11-25 / Streamable HTTP──▶ /mcp (this repo)
                                                                                          │
                          family dashboard ◀── /api/state ◀── store (synthetic data) ◀────┘
                                                              notify() ──▶ Telegram / outbox
```

- `src/mcp.ts`: the MCP server, five tools: `get_family_updates`, `log_checkin`, `send_message_to_family`, `request_call`, `escalate_need`. Anything that contacts a human needs `confirmed=true`, and the first call returns a preview.
- `src/server.ts`: stateless Streamable HTTP at `POST /mcp` (JSON responses, Origin validation, optional bearer token), the Anam session-token endpoint (the API key stays on the server), and static hosting.
- `public/app.js`: a real MCP client (`initialize`, `tools/list`, `tools/call`) with a live request log, the Anam avatar, and the family dashboard.
- Alexa+ path: the real Alexa+ add-on toolkit is not open to hackathon entrants, so we use the allowed **simulated Alexa+** path. The server is spec-compliant MCP, so it can be registered as an add-on if access is ever granted.

## Run it

```bash
npm install
cp .env.example .env     # add ANAM_API_KEY to enable the avatar (optional)
npm run dev              # http://localhost:3000
npm test                 # MCP tool tests
```

Without `ANAM_API_KEY` the app runs in text-only fallback mode (the Alexa+ box and dashboard still work). Check the server with MCP Inspector: `npx @modelcontextprotocol/inspector` and point it at `http://localhost:3000/mcp` (Streamable HTTP).

## Safety and privacy

- Synthetic data only in this repo. No real media, keys or logs.
- AI disclosure is on (`showAIAvatarDisclosure`), session replay is off, and summaries are stored instead of raw audio.
- The elder confirms before any message, call request or escalation. No diagnosis, no voice cloning, no children's data.

## Hackathon deliverables checklist

See `docs/REQUIREMENTS.md` (read the "READ FIRST" section), `FRICTION_LOG.md` and `PRODUCT_FEEDBACK.md`.

## License

MIT
