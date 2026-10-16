import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { LogEntry } from "../domain/types.js";
import type { ToolContext } from "../mcp/context.js";
import { createMcpServer } from "../mcp/server.js";

// The turn engine reaches the household through the same MCP server and tools as every other
// client, over an in-memory transport: real JSON-RPC (initialize, tools/call), same validation and
// consent checks, no network hop and no dependency on the HTTP port.

export type ToolCall = { name: string; ok: boolean; data: Record<string, unknown> };

export type LocalMcp = {
  call(client: string, name: string, args: Record<string, unknown>): Promise<ToolCall>;
  trace: LogEntry[];
  calls: ToolCall[];
};

export function localMcp(base: Omit<ToolContext, "client" | "trace">): LocalMcp {
  const trace: LogEntry[] = [];
  const calls: ToolCall[] = [];
  return {
    trace,
    calls,
    async call(client, name, args) {
      const server = createMcpServer({ ...base, client, trace: (e) => void trace.push(e) });
      const mcp = new Client({ name: `haven-${client}`, version: "0.2.0" });
      const [a, b] = InMemoryTransport.createLinkedPair();
      try {
        await Promise.all([server.connect(a), mcp.connect(b)]);
        const r = await mcp.callTool({ name, arguments: args });
        const data = (r.structuredContent ?? {}) as Record<string, unknown>;
        const call = { name, ok: !r.isError, data };
        calls.push(call);
        return call;
      } finally {
        await mcp.close();
        await server.close();
      }
    },
  };
}
