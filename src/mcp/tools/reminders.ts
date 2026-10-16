import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Reminder } from "../../domain/types.js";
import { DAY, HOUR, istDate } from "../../domain/util.js";
import type { ToolContext } from "../context.js";
import { declaredOutput, guard, loadDoc, memberName, trace } from "../result.js";

const WINDOWS = ["now", "today", "tomorrow"] as const;
type Window = (typeof WINDOWS)[number];

export const RemindersOutput = z.object({
  window: z.enum(WINDOWS),
  reminders: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      due: z.string(),
      time: z.string().describe("Due time in India, e.g. '7:30 pm'."),
      source: z.enum(["family", "call_promise"]),
      from: z.string().describe("The family member who set or confirmed it."),
    }),
  ),
});

const istTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

// India has no daylight saving, so "now + 24 h" is always tomorrow's IST date.
export function inWindow(r: Reminder, window: Window, now: Date) {
  const due = new Date(r.due);
  if (window === "now") return Math.abs(due.getTime() - now.getTime()) <= 2 * HOUR;
  return istDate(due) === istDate(window === "today" ? now : new Date(now.getTime() + DAY));
}

export function registerReminderTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "get_reminders",
    {
      title: "Get reminders",
      description:
        "List reminders her family has set or confirmed (for example a physio appointment, or a promise to call tonight), in India time. " +
        "'now' means due within two hours either way. Mention them in plain words; never add advice about medicines or doses.",
      inputSchema: { window: z.enum(WINDOWS).default("today") },
      outputSchema: declaredOutput(RemindersOutput),
      annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
    },
    ({ window }) =>
      guard(ctx, "get_reminders", async () => {
        const doc = await loadDoc(ctx);
        const now = ctx.now();
        const reminders = doc.reminders
          .filter((r) => inWindow(r, window, now))
          .sort((a, b) => a.due.localeCompare(b.due))
          .map((r) => ({
            id: r.id,
            text: r.text,
            due: r.due,
            time: istTime.format(new Date(r.due)).toLowerCase(),
            source: r.source,
            from: memberName(doc, r.confirmedBy),
          }));
        trace(ctx, "get_reminders", `get_reminders: ${window} ${reminders.length}`);
        return { window, reminders };
      }),
  );
}
