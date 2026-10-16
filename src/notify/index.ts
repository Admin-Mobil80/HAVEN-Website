import { randomUUID } from "node:crypto";
import type { Member, OutboxEntry, OutboxKind } from "../domain/types.js";

// One outbound message to a family member. `body` is the human-readable text that the
// family dashboard mirrors; `template` is used by the WhatsApp channel outside the 24 h window.
export type Outbound = {
  householdId: string;
  member: Member;
  kind: OutboxKind;
  body: string;
  template?: { name: string; params: string[] };
  refId?: string;
};

// Channels return an OutboxEntry and never mutate the household; the caller records the entry
// (so a retried repo.update can never send twice). Every send must be awaited before the HTTP
// response is returned: Lambda freezes the environment afterwards.
export interface Notifier {
  send(msg: Outbound, now: Date): Promise<OutboxEntry>;
}

export const outboxId = () => `o_${randomUUID().slice(0, 8)}`;

// Default channel: nothing leaves the process; the dashboard shows the message as "simulated".
export class SimulatedNotifier implements Notifier {
  async send(msg: Outbound, now: Date): Promise<OutboxEntry> {
    return {
      id: outboxId(),
      at: now.toISOString(),
      to: msg.member.id,
      kind: msg.kind,
      body: msg.body,
      channel: "simulated",
      status: "simulated",
      refId: msg.refId,
    };
  }
}
