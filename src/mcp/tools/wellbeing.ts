import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CAPS, MOODS, type Mood, type Wellbeing } from "../../domain/types.js";
import { capPush, nextId } from "../../domain/util.js";
import type { ToolContext } from "../context.js";
import { declaredOutput, guard, trace } from "../result.js";

export const WellbeingOutput = z.object({
  wellbeing_id: z.string(),
  tier: z.enum(["important", "worth_knowing"]),
  reasons: z.array(z.string()),
});

const isLow = (m: Mood) => m === "low" || m === "anxious";

// Server-side tiering so the model cannot under- or over-state it. Never "urgent": urgent needs
// start_escalation or the deterministic rules. Reasons are plain observations, not diagnoses.
export function wellbeingTier(entry: Pick<Wellbeing, "mood" | "sleep" | "appetite">, previous: Pick<Wellbeing, "mood">[]) {
  const reasons: string[] = [];
  if (isLow(entry.mood) && (entry.appetite === "poor" || entry.sleep === "poor")) reasons.push("low mood with poor sleep or appetite");
  const lastThree = [...previous.slice(-2), entry];
  if (lastThree.filter((w) => isLow(w.mood)).length >= 2) reasons.push("low mood in 2 of the last 3 check-ins");
  return { tier: reasons.length > 0 ? ("important" as const) : ("worth_knowing" as const), reasons };
}

export function registerWellbeingTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "log_wellbeing",
    {
      title: "Log how she is",
      description:
        "Record a short, neutral note of how the elder seems today, based only on what she said: mood, energy, sleep, appetite and topics. " +
        "The server decides whether her family should see it soon; it is never an emergency (use start_escalation for that). " +
        "Do not diagnose, name conditions, or comment on medicines. Set private if she asked to keep it from her family.",
      inputSchema: {
        mood: z.enum(MOODS),
        energy: z.enum(["low", "normal", "high"]).optional(),
        sleep: z.enum(["poor", "ok", "good"]).optional(),
        appetite: z.enum(["poor", "ok", "good"]).optional(),
        mentions: z.array(z.string().trim().min(1).max(40)).max(4).default([]).describe("Up to 4 topics she talked about, e.g. 'garden'."),
        note: z.string().max(200).optional().describe("One short neutral sentence."),
        private: z.boolean().default(false),
      },
      outputSchema: declaredOutput(WellbeingOutput),
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) =>
      guard(ctx, "log_wellbeing", async () => {
        const now = ctx.now();
        const out = await ctx.repo.update(ctx.householdId, (doc) => {
          const { tier, reasons } = wellbeingTier(args, doc.wellbeing);
          const entry: Wellbeing = {
            id: nextId(doc, "w"),
            at: now.toISOString(),
            mood: args.mood,
            energy: args.energy,
            sleep: args.sleep,
            appetite: args.appetite,
            mentions: args.mentions,
            note: args.note || undefined,
            private: args.private,
            tier,
          };
          capPush(doc.wellbeing, entry, CAPS.wellbeing);
          return { wellbeing_id: entry.id, tier, reasons };
        });
        trace(ctx, "log_wellbeing", `log_wellbeing: ${out.tier}${args.private ? " (private)" : ""}`);
        return out;
      }),
  );
}
