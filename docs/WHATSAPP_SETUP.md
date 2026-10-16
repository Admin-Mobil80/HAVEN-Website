# WhatsApp setup (Meta Cloud API test number)

Haven uses WhatsApp only for **notifications to family**: the daily digest, its voice note, and urgent "call now" alerts. Digital Priya never chats on WhatsApp, because Meta's terms bar AI as a primary WhatsApp function.

Template review can take up to 24 hours, so submit the templates as early as you can.

## 1. Test number and recipients (about 45 min)
1. At developers.facebook.com, create an app of type **Business** and add the **WhatsApp** product.
2. Open **WhatsApp > API Setup**. Note the **Phone number ID**, the **WhatsApp Business Account (WABA) ID**, and the Graph API version used in the sample curl.
3. Add up to 5 recipient numbers: the Priya performer's phone and the backup (Ravi) phone. Verify each one by code.
4. Send the pre-approved `hello_world` template from the API Setup page.
5. **Reply "hi" from Priya's phone.** This opens the 24-hour window for free-form messages (text, voice note, buttons). Do this again before every recording take.
6. Create a **System User** in Business Settings and give it `whatsapp_business_messaging` and `whatsapp_business_management`. Generate a non-expiring token.
7. Store the token and app secret in SSM, never in git or chat:
   ```bash
   aws ssm put-parameter --region ap-south-1 --name /haven/wa-token --type SecureString --value "$WA_TOKEN"
   ```
   ```bash
   aws ssm put-parameter --region ap-south-1 --name /haven/wa-app-secret --type SecureString --value "$WA_APP_SECRET"
   ```

## 2. Submit the three templates (category UTILITY, English)
Template rules:
- No health words.
- No variable at the very start or end.
- Every variable needs a sample value.
- Only quick-reply buttons (labels of 25 characters or fewer).
- Footer of 60 characters or fewer.

A template **cannot** carry audio. The voice note goes out as a separate message after Priya taps "Play voice note", because the tap opens the 24-hour window.

Set the variables once (use the Graph version from step 1):
```bash
export WABA_ID=... GRAPH=v23.0 WA_TOKEN=...
```

### haven_daily_digest
```bash
curl -s -X POST "https://graph.facebook.com/$GRAPH/$WABA_ID/message_templates" -H "Authorization: Bearer $WA_TOKEN" -H "Content-Type: application/json" -d '{"name":"haven_daily_digest","language":"en","category":"UTILITY","components":[{"type":"BODY","text":"Hi {{1}}, here is today'\''s Haven update about {{2}}: {{3}}. Tap below to hear it as a short voice note, or let us know when you will call.","example":{"body_text":[["Priya","Amma","a calm day, she talked about her garden and asked about Diwali"]]}},{"type":"FOOTER","text":"Haven is an AI companion."},{"type":"BUTTONS","buttons":[{"type":"QUICK_REPLY","text":"Play voice note"},{"type":"QUICK_REPLY","text":"I will call tonight"}]}]}'
```

### haven_urgent_alert
```bash
curl -s -X POST "https://graph.facebook.com/$GRAPH/$WABA_ID/message_templates" -H "Authorization: Bearer $WA_TOKEN" -H "Content-Type: application/json" -d '{"name":"haven_urgent_alert","language":"en","category":"UTILITY","components":[{"type":"BODY","text":"Haven alert: {{1}} may need you right now. Please call her on {{2}} as soon as you can. Haven is an AI companion and can be wrong.","example":{"body_text":[["Kamala","+91 90000 00001"]]}},{"type":"FOOTER","text":"Haven is an AI companion."},{"type":"BUTTONS","buttons":[{"type":"QUICK_REPLY","text":"Calling now"}]}]}'
```

### haven_family_question (spare)
```bash
curl -s -X POST "https://graph.facebook.com/$GRAPH/$WABA_ID/message_templates" -H "Authorization: Bearer $WA_TOKEN" -H "Content-Type: application/json" -d '{"name":"haven_family_question","language":"en","category":"UTILITY","components":[{"type":"BODY","text":"Hi {{1}}, {{2}} asked something only you can answer: {{3}}. Reply here with a voice note and Haven will play it to her.","example":{"body_text":[["Priya","Amma","will you come home for Diwali"]]}},{"type":"FOOTER","text":"Haven is an AI companion."}]}'
```

Check the status (it moves from PENDING to APPROVED or REJECTED):
```bash
curl -s "https://graph.facebook.com/$GRAPH/$WABA_ID/message_templates?fields=name,status,category" -H "Authorization: Bearer $WA_TOKEN"
```

If a template is rejected or moved to MARKETING, make the wording plainer and resubmit under a new name (for example `haven_daily_digest_v2`). Meanwhile, use free-form messages inside the 24-hour window for the video.

## 3. Webhook (Saturday, once the app is deployed)
- **Callback URL:** `https://<function-url>/webhooks/whatsapp`
- **Verify token:** any random string, stored as `/haven/wa-verify-token`.
- **Subscribe to:** `messages` (button taps, inbound voice replies, and delivered/read/played statuses).

## Known limits (from research, 15 Oct)
- No WhatsApp button can dial a third party such as Mum. The urgent alert puts Mum's number in the body, where WhatsApp auto-links it.
- Judges cannot receive messages from a test number. The family dashboard mirrors every message, and judge mode uses "simulate tap".
- The test number shows as "Test Number" with no logo. In the video, crop the phone to the chat bubbles and show no WhatsApp logo.
- Space test sends at least 10 seconds apart to avoid the per-recipient rate limit.
