import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Household, Member, OutboxEntry } from "../domain/types.js";
import { SimulatedNotifier, outboxId, type Outbound } from "../notify/index.js";
import { ConflictError, NotFoundError } from "../store/repo.js";
import type { ToolContext } from "./context.js";

// Shared plumbing for tool handlers: result shapes, typed errors, household access, sends.

export const TOOL_ERROR_CODES = [
  "household_not_found",
  "no_primary_member",
  "confirmation_not_found",
  "confirmation_expired",
  "confirmation_used",
  "confirmation_superseded",
  "args_mismatch",
  "elder_not_confirmed",
  "busy",
  "invalid_arguments",
  "internal_error",
] as const;
export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

export const ErrorOutput = z.object({ code: z.enum(TOOL_ERROR_CODES), message: z.string(), retryable: z.boolean() });

// The SDK client validates structuredContent against outputSchema even on isError results, and an
// outputSchema must be one object schema. So the declared schema is the success shape with every
// field optional plus the error fields; tests check success results against the strict shape.
export function declaredOutput(success: z.ZodObject) {
  const errorShape: Record<string, z.ZodType> = ErrorOutput.shape;
  const shape: Record<string, z.ZodType> = {};
  for (const [key, schema] of Object.entries(success.shape as Record<string, z.ZodType>)) {
    shape[key] = key in errorShape ? z.union([schema, errorShape[key]]) : schema;
  }
  for (const [key, schema] of Object.entries(errorShape)) if (!(key in shape)) shape[key] = schema;
  return z.object(shape).partial();
}

// Round-trip through JSON so structuredContent matches what an HTTP client receives (no undefined).
export function ok(structured: Record<string, unknown>): CallToolResult {
  const text = JSON.stringify(structured);
  return { content: [{ type: "text", text }], structuredContent: JSON.parse(text) };
}

export function fail(code: ToolErrorCode, message: string, retryable: boolean): CallToolResult {
  const structured = { code, message, retryable };
  return { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured, isError: true };
}

export function trace(ctx: ToolContext, tool: string, summary: string, isError = false) {
  ctx.trace?.({ at: ctx.now().toISOString(), client: ctx.client, kind: "mcp", method: "tools/call", tool, summary, isError: isError || undefined });
}

// Runs a handler and turns every failure into an isError result. Summaries never include
// free text from the elder, so the activity log cannot leak private content.
export async function guard(ctx: ToolContext, tool: string, fn: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    const e = toToolError(err);
    trace(ctx, tool, `${tool}: ${e.code}`, true);
    return fail(e.code, e.message, e.retryable);
  }
}

function toToolError(err: unknown): ToolError {
  if (err instanceof ToolError) return err;
  if (err instanceof NotFoundError) return new ToolError("household_not_found", "This household no longer exists.", false);
  if (err instanceof ConflictError) return new ToolError("busy", "The household was busy; try again.", true);
  console.error("mcp tool failed:", err);
  return new ToolError("internal_error", "Something went wrong; try again.", true);
}

export async function loadDoc(ctx: ToolContext): Promise<Household> {
  const doc = await ctx.repo.get(ctx.householdId);
  if (!doc) throw new ToolError("household_not_found", "This household no longer exists.", false);
  return doc;
}

export const primaryMember = (doc: Household): Member | undefined => doc.members.find((m) => m.role === "primary");
export const backupMember = (doc: Household): Member | undefined => doc.members.find((m) => m.role === "backup");
export const memberName = (doc: Household, id: string) => doc.members.find((m) => m.id === id)?.name ?? "your family";

// Never throws: a failed channel becomes a "failed" outbox entry the dashboard can show.
export async function safeSend(ctx: ToolContext, msg: Outbound, now: Date): Promise<OutboxEntry> {
  try {
    return await ctx.notifier.send(msg, now);
  } catch (err) {
    return {
      id: outboxId(),
      at: now.toISOString(),
      to: msg.member.id,
      kind: msg.kind,
      body: msg.body,
      channel: ctx.notifier instanceof SimulatedNotifier ? "simulated" : "whatsapp",
      status: "failed",
      refId: msg.refId,
      error: (err as Error).message?.slice(0, 200) ?? "send_failed",
    };
  }
}

const STOPWORDS = new Set(
  "the and for with that this from have has had was were are you your her his she him they them their what when where which who about into just very really also will would could should there then than been being some any our out not but all can did does its it's".split(" "),
);

export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Content words for overlap ranking and near-duplicate checks.
export function tokens(text: string) {
  return normalize(text)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

// "physio" ~ "physiotherapy", "sweet" ~ "sweets"; short words must match exactly.
export function sameWord(a: string, b: string) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}
