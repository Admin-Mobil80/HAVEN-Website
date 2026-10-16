import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { consumeConfirmation, issueConfirmation } from "../../domain/confirmations.js";
import { CAPS, type FamilyMessage } from "../../domain/types.js";
import { capPush } from "../../domain/util.js";
import type { ToolContext } from "../context.js";
import { ToolError, declaredOutput, guard, memberName, primaryMember, safeSend, trace } from "../result.js";

const FamilyMessageOut = z.object({
  id: z.string(),
  from: z.string().describe("Name of the real family member who sent it."),
  kind: z.enum(["voice", "text", "deferral_answer", "call_promise"]),
  text: z.string().nullable(),
  audioUrl: z.string().nullable().describe("Short-lived link to their real recording, if any."),
  inReplyTo: z.string().nullable(),
  question: z.string().nullable().describe("Her earlier question that this answers, if any."),
  attribution: z.literal("real_family_member"),
  at: z.string(),
});
export const PlayOutput = z.object({ message: FamilyMessageOut.nullable(), remaining: z.number().int() });

export const ReplyOutput = z.object({
  status: z.enum(["needs_confirmation", "sent", "simulated", "failed"]),
  to: z.string(),
  confirmation_id: z.string().optional(),
  preview: z.object({ to: z.string(), message: z.string(), kind: z.enum(["reply", "call_request"]) }).optional(),
  outbox_id: z.string().optional(),
  say: z.string(),
});

const ERROR_TEXT: Record<string, [string, boolean]> = {
  confirmation_not_found: ["That confirmation does not exist. Start again without confirmation_id.", false],
  confirmation_expired: ["The confirmation expired after 5 minutes. Start again and ask her again.", false],
  confirmation_used: ["That confirmation was already used.", false],
  confirmation_superseded: ["A newer preview replaced this one. Use the latest confirmation_id, or start again and ask her again.", false],
  args_mismatch: ["The message or kind changed since the preview. Start again with the new wording.", false],
  elder_not_confirmed: ["She has not clearly said yes since the preview. Ask her, and retry only after a clear yes.", true],
};

const oldestFirst = (a: FamilyMessage, b: FamilyMessage) => a.createdAt.localeCompare(b.createdAt);

export function registerMessageTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "play_family_message",
    {
      title: "Play a family message",
      description:
        "Get the next unplayed message that a real family member recorded or wrote for the elder: a voice note, a text, an answer to a question she asked earlier, or a promise to call. " +
        "Present it as coming from that real person, using their own words or recording, and never as something you said. Marks it played unless peek is true.",
      inputSchema: { peek: z.boolean().default(false).describe("Check what is waiting without marking it played.") },
      outputSchema: declaredOutput(PlayOutput),
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ peek }) =>
      guard(ctx, "play_family_message", async () => {
        const now = ctx.now();
        const picked = await ctx.repo.update(ctx.householdId, (doc) => {
          const unplayed = doc.messages.filter((m) => !m.playedAt).sort(oldestFirst);
          const next = unplayed[0];
          if (!next) return null;
          const deferral = next.inReplyTo ? doc.deferrals.find((d) => d.id === next.inReplyTo) : undefined;
          if (!peek) {
            const stored = doc.messages.find((m) => m.id === next.id)!;
            stored.playedAt = now.toISOString();
            if (deferral && deferral.status !== "relayed") {
              deferral.status = "relayed";
              deferral.relayedAt = now.toISOString();
            }
          }
          return { msg: { ...next }, from: memberName(doc, next.from), question: deferral?.question ?? null, remaining: unplayed.length - 1 };
        });
        if (!picked) {
          trace(ctx, "play_family_message", "play_family_message: none waiting");
          return { message: null, remaining: 0 };
        }
        const { msg } = picked;
        trace(ctx, "play_family_message", `play_family_message: ${msg.kind} from ${picked.from}${peek ? " (peek)" : ""}`);
        return {
          message: {
            id: msg.id,
            from: picked.from,
            kind: msg.kind,
            text: msg.text ?? null,
            audioUrl: msg.audioKey ? ctx.mediaUrl(msg.audioKey) : null,
            inReplyTo: msg.inReplyTo ?? null,
            question: picked.question,
            attribution: "real_family_member",
            at: msg.createdAt,
          },
          remaining: picked.remaining,
        };
      }),
  );

  server.registerTool(
    "record_reply",
    {
      title: "Send her reply to family",
      description:
        "Send the elder's own words to her primary family member, or ask that person to call her (kind call_request). Two steps, enforced by the server. " +
        "Step 1: call without confirmation_id; you get a preview and a confirmation_id, and must then ask her in your own words whether to send it. " +
        "Step 2: only after she clearly says yes in her next turn, call again with the same message and kind plus the confirmation_id. " +
        "A yes from before the preview does not count, and the confirmation expires after 5 minutes. Never say it was sent unless step 2 succeeds.",
      inputSchema: {
        message: z.string().trim().min(1).max(280).describe("Her words, lightly tidied, in the first person."),
        kind: z.enum(["reply", "call_request"]).default("reply"),
        confirmation_id: z.string().max(40).optional(),
      },
      outputSchema: declaredOutput(ReplyOutput),
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ message, kind, confirmation_id }) =>
      guard(ctx, "record_reply", async () => {
        const now = ctx.now();
        const args = { message, kind };

        if (!confirmation_id) {
          const issued = await ctx.repo.update(ctx.householdId, (doc) => {
            const to = primaryMember(doc);
            if (!to) throw new ToolError("no_primary_member", "No family member is set up to receive messages.", false);
            return { id: issueConfirmation(doc, "record_reply", args, now).id, to: to.name };
          });
          trace(ctx, "record_reply", `record_reply: confirmation issued (${kind})`);
          const say = kind === "call_request" ? `Shall I ask ${issued.to} to call you?` : `Shall I send this to ${issued.to}: "${message}"?`;
          return { status: "needs_confirmation", to: issued.to, confirmation_id: issued.id, preview: { to: issued.to, message, kind }, say };
        }

        const consumed = await ctx.repo.update(ctx.householdId, (doc) => {
          const to = primaryMember(doc);
          if (!to) throw new ToolError("no_primary_member", "No family member is set up to receive messages.", false);
          const r = consumeConfirmation(doc, confirmation_id, args, now);
          if (!r.ok) {
            const [text, retryable] = ERROR_TEXT[r.code];
            throw new ToolError(r.code, text, retryable);
          }
          return { member: { ...to }, elder: { ...doc.elder } };
        });

        const { member, elder } = consumed;
        const body =
          kind === "call_request"
            ? `${elder.name} (${elder.calledBy}) would like you to call her when you can. She said: "${message}"`
            : `${elder.name} (${elder.calledBy}) says: "${message}"`;
        // Sent outside repo.update: update may re-run its callback on a conflict.
        const entry = await safeSend(ctx, { householdId: ctx.householdId, member, kind: "elder_reply", body, refId: confirmation_id }, now);
        await ctx.repo.update(ctx.householdId, (doc) => capPush(doc.outbox, entry, CAPS.outbox));
        trace(ctx, "record_reply", `record_reply: ${kind} to ${member.name} ${entry.status}`);
        const say =
          entry.status === "failed"
            ? `I couldn't reach ${member.name} just now. Shall we try again in a little while?`
            : kind === "call_request"
              ? `Done. I've asked ${member.name} to call you.`
              : `Done. I've sent it to ${member.name}.`;
        return { status: entry.status, to: member.name, outbox_id: entry.id, say };
      }),
  );
}
