import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { compilePersona } from "../domain/persona.js";
import type { ToolContext } from "./context.js";
import { loadDoc } from "./result.js";

export function registerPrompts(server: McpServer, ctx: ToolContext) {
  server.registerPrompt(
    "digital_priya_persona",
    {
      title: "Companion persona",
      description:
        "System instructions for talking with the elder as this household's labelled AI companion ('Digital <name>', or plain Haven when the family has switched it off).",
    },
    async () => {
      const doc = await loadDoc(ctx);
      return { messages: [{ role: "user", content: { type: "text", text: compilePersona(doc) } }] };
    },
  );
}
