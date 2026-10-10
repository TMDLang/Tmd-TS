import { buildTmdWebMcpTools, TmdWebMcpContext, WebMcpTool } from "../mcp/webmcpIntegration.js";

export interface AiToolDeclarations {
  geminiTools: Array<{
    function_declarations: Array<{
      name: string;
      description: string;
      parameters?: Record<string, any>;
    }>;
  }>;
  openAiTools: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters?: Record<string, any>;
    };
  }>;
}

/**
 * Filter tools that are safe and appropriate for AI co-composition.
 * Tools like checkTmd, parseTmd, and getCurrentScore are exposed.
 */
export function getAgentAvailableTools(ctx: TmdWebMcpContext): WebMcpTool[] {
  const allTools = buildTmdWebMcpTools(ctx, { autoLoadSkill: false });
  const allowed = ["checkTmd", "getCurrentScore", "parseTmd"];
  return allTools.filter((t) => allowed.includes(t.name));
}

/**
 * Convert Web MCP tools into provider-specific function calling schemas.
 */
export function buildAiToolDeclarations(ctx: TmdWebMcpContext): AiToolDeclarations {
  const tools = getAgentAvailableTools(ctx);

  const functionDeclarations = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));

  const openAiTools = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  return {
    geminiTools: [
      {
        function_declarations: functionDeclarations,
      },
    ],
    openAiTools,
  };
}

/**
 * Execute a tool by name with arguments and return raw text string response.
 */
export async function executeAiTool(
  toolName: string,
  args: Record<string, any>,
  ctx: TmdWebMcpContext
): Promise<string> {
  const tools = buildTmdWebMcpTools(ctx, { autoLoadSkill: false });
  const targetTool = tools.find((t) => t.name === toolName);
  if (!targetTool) {
    return JSON.stringify({ error: `Tool ${toolName} not found` });
  }

  try {
    const res = await targetTool.handler(args);
    return res.content.map((c) => c.text).join("\n");
  } catch (err: any) {
    return JSON.stringify({ error: err.message || String(err) });
  }
}
