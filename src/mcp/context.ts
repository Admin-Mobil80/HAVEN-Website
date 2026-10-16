import type { LogEntry } from "../domain/types.js";
import type { Notifier } from "../notify/index.js";
import type { Repo } from "../store/repo.js";

// Everything an MCP tool handler needs. One context per /mcp request (stateless server):
// the household comes from the bearer token or the /mcp/h/<signed-id> path, never from tool args.
export type ToolContext = {
  repo: Repo;
  householdId: string;
  client: string; // value of x-haven-client, e.g. "alexa-sim" | "agent" | "inspector"
  now: () => Date;
  notifier: Notifier;
  mediaUrl: (key: string) => string; // signed, short-lived URL for a stored recording
  trace?: (entry: LogEntry) => void; // optional inline trace sink (returned to the simulator as mcpTrace)
};
