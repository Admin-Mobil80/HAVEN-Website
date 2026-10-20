import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CAPS, DEFER_TOPICS, type Deferral, type Household } from "../../domain/types.js";
import { DAY, capPush, nextId } from "../../domain/util.js";
import type { ToolContext } from "../context.js";
import { declaredOutput, guard, normalize, primaryMember, trace } from "../result.js";

export const DeferralOutput = z.object({
  deferral_id: z.string(),
  status: z.enum(["open", "answered", "relayed"]),
  deduped: z.boolean(),
  say: z.string().describe("What to tell them instead of promising anything."),
});

export function deferralSay(doc: Household) {
  const calledBy = doc.elder.calledBy || doc.elder.name;
  const child = doc.members.find((m) => m.id === doc.persona.childMemberId);
  if (doc.persona.mode === "child" && child) {
    return `That one's for the real ${child.name}, ${calledBy}. I can't promise that, but I'll ask ${child.name} tonight.`;
  }
  const name = primaryMember(doc)?.name ?? "your family";
  return `That one's for ${name} to answer, ${calledBy}. I won't promise anything; I'll ask tonight.`;
}

export function registerDeferralTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "create_deferral",
    {
      title: "Ask the real family later",
      description:
        "Use when the elder asks for something only their real family member can decide or promise: plans, visits or dates, money, health decisions, family matters, or any promise. " +
        "Records the question for that person to answer later; nothing is sent now. Then tell them the returned 'say' line (or close to it) instead of promising anything. " +
        "The same question within 24 hours is not recorded twice. Only the family can answer or close a question; there is no tool for that.",
      inputSchema: {
        topic: z.enum(DEFER_TOPICS),
        question: z.string().trim().min(1).max(200).describe("Their question in their own words, e.g. 'Will you come home next month?'"),
        context: z.string().max(300).default("").describe("One neutral line of context for the family, if useful."),
      },
      outputSchema: declaredOutput(DeferralOutput),
      annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false },
    },
    ({ topic, question, context }) =>
      guard(ctx, "create_deferral", async () => {
        const now = ctx.now();
        const out = await ctx.repo.update(ctx.householdId, (doc) => {
          const key = normalize(question);
          const existing = doc.deferrals.find(
            (d) => d.status !== "relayed" && normalize(d.question) === key && now.getTime() - Date.parse(d.createdAt) < DAY,
          );
          if (existing) return { deferral_id: existing.id, status: existing.status, deduped: true, say: deferralSay(doc) };
          const deferral: Deferral = { id: nextId(doc, "d"), topic, question, context, status: "open", createdAt: now.toISOString() };
          capPush(doc.deferrals, deferral, CAPS.deferrals);
          return { deferral_id: deferral.id, status: deferral.status, deduped: false, say: deferralSay(doc) };
        });
        trace(ctx, "create_deferral", `create_deferral: ${topic}${out.deduped ? " (deduped)" : ""}`);
        return out;
      }),
  );
}
