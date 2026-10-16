import type { OutboxEntry, OutboxKind } from "../domain/types.js";
import { HOUR } from "../domain/util.js";
import { outboxId, SimulatedNotifier, type Notifier, type Outbound } from "./index.js";
import { WhatsAppError, type WhatsAppClient } from "./whatsappClient.js";

// WhatsApp channel. Real sends happen only for households listed as live (the owner household with
// real, allowlisted phones) and only to members with a recorded opt-in; everything else is
// simulated so judges and demo households never message a stranger. Inside the 24 h customer
// service window messages go free-form with reply buttons; outside it only approved templates.

export const WINDOW_MS = 23 * HOUR; // a margin under Meta's 24 h

// Quick-reply buttons per kind. Titles must match the approved templates exactly, because the
// webhook routes on them whichever way the message was sent.
export const BUTTONS: Partial<Record<OutboxKind, { id: string; title: string }[]>> = {
  digest: [
    { id: "play_voice_note", title: "Play voice note" },
    { id: "call_tonight", title: "I will call tonight" },
  ],
  urgent_alert: [{ id: "calling_now", title: "Calling now" }],
};

export class WhatsAppNotifier implements Notifier {
  private readonly simulated = new SimulatedNotifier();

  constructor(
    private readonly client: WhatsAppClient,
    private readonly isLive: (householdId: string) => boolean,
  ) {}

  async send(msg: Outbound, now: Date): Promise<OutboxEntry> {
    const m = msg.member;
    if (!this.isLive(msg.householdId) || !m.phone || !m.waOptIn) return this.simulated.send(msg, now);

    const base = { id: outboxId(), at: now.toISOString(), to: m.id, kind: msg.kind, body: msg.body, channel: "whatsapp" as const, refId: msg.refId };
    const inWindow = m.lastInboundAt !== undefined && now.getTime() - Date.parse(m.lastInboundAt) < WINDOW_MS;
    try {
      let wamid: string;
      const buttons = BUTTONS[msg.kind];
      if (inWindow) wamid = buttons ? await this.client.sendButtons(m.phone, msg.body, buttons) : await this.client.sendText(m.phone, msg.body);
      else if (msg.template) wamid = await this.client.sendTemplate(m.phone, msg.template.name, msg.template.params);
      else return { ...base, status: "failed", error: "outside_24h_window_no_template" };
      return { ...base, status: "sent", wamid };
    } catch (err) {
      const e = err instanceof WhatsAppError ? `${e_code(err)}: ${err.message}` : (err as Error).message;
      console.warn(JSON.stringify({ msg: "whatsapp_send_failed", kind: msg.kind, error: e }));
      return { ...base, status: "failed", error: e.slice(0, 200) };
    }
  }
}

const e_code = (e: WhatsAppError) => (e.code !== undefined ? `wa_${e.code}` : `http_${e.status}`);
