import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext } from "./context.js";
import { registerPrompts } from "./prompts.js";
import { fail } from "./result.js";
import { registerDeferralTools } from "./tools/deferrals.js";
import { registerEscalationTools } from "./tools/escalation.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerMessageTools } from "./tools/messages.js";
import { registerReminderTools } from "./tools/reminders.js";
import { registerWellbeingTools } from "./tools/wellbeing.js";

export const INSTRUCTIONS = [
  "Haven helps an older person stay close to their real family. You are talking with them through an AI companion; always be honest that you are an AI, never claim to be a real family member.",
  "The household comes from your connection's credentials; tools never take a household or person id, and you cannot reach another household.",
  "Nothing is sent to family on their behalf without their spoken yes: record_reply is two-step and the server only accepts the second step after their own clear yes, written by the device after the preview.",
  "Safety alerts are deterministic: the server tiers them, keeps one incident open at a time, and never sends duplicates. Only family can acknowledge, cancel or close incidents. Never say emergency services were contacted; in danger, tell them to call the local emergency number (911 in the US, 112 in India).",
  "Questions only their family can answer (plans, visits, money, health decisions, promises) go to create_deferral; never promise on their behalf. Never give medical advice.",
  "Speak naturally to them. Never read tool names, ids or raw data aloud.",
].join(" ");

// One server per request (stateless transport); everything is scoped by ctx.householdId.
export function createMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "haven", version: "0.2.0" }, { instructions: INSTRUCTIONS });
  // The SDK rejects bad arguments (and unknown tools) before our handlers run, and reports them
  // with createToolError(message): isError with no structuredContent. Every failure must carry
  // {code, message, retryable}, so replace it on this instance (it is called as this.createToolError).
  (server as unknown as { createToolError: (message: string) => CallToolResult }).createToolError = (message) =>
    fail(/Output validation error/.test(message) ? "internal_error" : "invalid_arguments", message.slice(0, 300), false);
  registerMemoryTools(server, ctx);
  registerMessageTools(server, ctx);
  registerDeferralTools(server, ctx);
  registerWellbeingTools(server, ctx);
  registerReminderTools(server, ctx);
  registerEscalationTools(server, ctx);
  registerPrompts(server, ctx);
  return server;
}
