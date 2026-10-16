import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { activeIncident, addEvent, openOrUpgrade } from "../../domain/incidents.js";
import { CAPS, ESCALATION_REASONS, type Household, type Incident, type Member } from "../../domain/types.js";
import { capPush } from "../../domain/util.js";
import type { ToolContext } from "../context.js";
import { declaredOutput, guard, primaryMember, backupMember, safeSend, trace } from "../result.js";

export const EscalationOutput = z.object({
  incident_id: z.string(),
  state: z.enum(["open", "acknowledged", "cancelled", "closed"]),
  tier: z.enum(["urgent", "important"]),
  emergency: z.boolean(),
  action: z.enum(["opened", "upgraded", "appended"]),
  notified: z.array(z.string()).describe("Family members alerted by this call."),
  say: z.string().describe("What to tell her now."),
});

const sourceFor = (client: string): Incident["source"] => (client === "rule" ? "rule" : client === "agent" ? "agent" : "alexa");

// Short and non-clinical: the family needs who, her own words, and how to reach her.
export function alertBody(doc: Pick<Household, "elder">, incident: Pick<Incident, "emergency" | "elderWords">) {
  const { elder } = doc;
  const words = incident.elderWords.trim();
  const said = words ? `${elder.name} (${elder.calledBy}) said: "${words}".` : `${elder.name} (${elder.calledBy}) may need help.`;
  return `${incident.emergency ? "EMERGENCY" : "Urgent"} from Haven. ${said} Please call her now on +${elder.phone}. Haven has told her to call 112 if she is in danger.`;
}

export function registerEscalationTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "start_escalation",
    {
      title: "Alert family",
      description:
        "Use when the elder may need her family soon. urgent: she may be hurt, unwell, scared, confused, or asks for her family right now; set emergency for a fall, chest pain, trouble breathing, or a cry for help. " +
        "important: something the family should see today, such as not eating, skipped tablets, or feeling very lonely. " +
        "Urgent alerts reach her family at once; important ones go to their dashboard. Repeated calls attach to the same incident and never send duplicate alerts. " +
        "Then tell her the returned 'say' line. You cannot call emergency services and must never say that you did. Only the family can close an incident.",
      inputSchema: {
        tier: z.enum(["urgent", "important"]),
        reason: z.enum(ESCALATION_REASONS),
        elder_words: z.string().max(200).describe("Her own words that caused this, quoted briefly."),
        emergency: z.boolean().default(false),
      },
      outputSchema: declaredOutput(EscalationOutput),
      annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ tier, reason, elder_words, emergency }) =>
      guard(ctx, "start_escalation", async () => {
        const now = ctx.now();
        const opened = await ctx.repo.update(ctx.householdId, (doc) => {
          const previousAlertAt = activeIncident(doc)?.lastAlertAt;
          const r = openOrUpgrade(doc, { tier, emergency, source: sourceFor(ctx.client), reason, elderWords: elder_words }, now);
          const urgent = r.incident.tier === "urgent";
          const recipients: Member[] = [];
          if (r.shouldAlert && urgent) {
            const primary = primaryMember(doc);
            const backup = backupMember(doc);
            if (primary) recipients.push({ ...primary });
            if (r.incident.emergency && backup) recipients.push({ ...backup });
          }
          return {
            incident: structuredClone(r.incident),
            action: r.action,
            shouldAlert: r.shouldAlert,
            // A same-tier re-alert can fall back to the earlier alert; a new or upgraded one cannot.
            previousAlertAt: r.action === "appended" ? previousAlertAt : undefined,
            recipients,
            elder: { ...doc.elder },
            primary: primaryMember(doc)?.name,
            demo: doc.demo,
          };
        });

        const { incident, recipients } = opened;
        // Important never sends WhatsApp (dashboard and digest only). Urgent sends are awaited:
        // Lambda freezes once the response goes out.
        const body = alertBody({ elder: opened.elder }, incident);
        const template = { name: "haven_urgent_alert", params: [opened.elder.name, `+${opened.elder.phone}`] };
        const entries = await Promise.all(
          recipients.map((member) => safeSend(ctx, { householdId: ctx.householdId, member, kind: "urgent_alert", body, template, refId: incident.id }, now)),
        );
        // A real household counts only real deliveries; in a demo household (no real phones) a
        // simulated send stands in for one, so the demo reads the same as the real thing.
        const delivered = entries.filter((e) => e.status === "sent" || (opened.demo && e.status === "simulated"));
        if (entries.length > 0) {
          await ctx.repo.update(ctx.householdId, (doc) => {
            const stored = doc.incidents.find((i) => i.id === incident.id);
            for (const e of entries) {
              capPush(doc.outbox, e, CAPS.outbox);
              if (stored) addEvent(stored, e.at, `alert_sent:${e.to}:${e.status}`);
            }
            if (!stored) return;
            if (delivered.length > 0) {
              stored.alertDeliveredAt = delivered[delivered.length - 1].at;
            } else if (stored.lastAlertAt === incident.lastAlertAt) {
              // Nobody was reached: roll the attempt back so the next trigger retries at once.
              if (opened.previousAlertAt) stored.lastAlertAt = opened.previousAlertAt;
              else delete stored.lastAlertAt;
            }
          });
          if (delivered.length > 0) incident.alertDeliveredAt = delivered[delivered.length - 1].at;
        }

        const notified = delivered.map((e) => recipients.find((m) => m.id === e.to)!.name);
        trace(ctx, "start_escalation", `start_escalation: ${incident.tier}${incident.emergency ? "+emergency" : ""} ${reason} ${opened.action}, alerted ${notified.length}`);
        return {
          incident_id: incident.id,
          state: incident.state,
          tier: incident.tier,
          emergency: incident.emergency,
          action: opened.action,
          notified,
          say: sayFor(incident, notified, opened.shouldAlert, opened.primary),
        };
      }),
  );
}

// Never claims the family knows unless an alert for this situation actually reached someone.
function sayFor(incident: Incident, notified: string[], alerted: boolean, primary = "your family") {
  if (incident.tier === "important") return `I'll make sure ${primary} knows about this today.`;
  const danger = "If you are in danger, call 112 now.";
  if (notified.length > 0) return `${notified.join(" and ")} ${notified.length > 1 ? "have" : "has"} been told. ${danger}`;
  if (!alerted && incident.alertDeliveredAt) return `${primary} has already been told. ${danger}`;
  return `I'm trying to reach ${primary}. ${danger}`;
}
