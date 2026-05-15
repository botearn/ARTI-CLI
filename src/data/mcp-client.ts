/**
 * MCP 客户端 — 连接 arti-backend MCP 服务
 * 通过 HTTP transport 调用 MCP 工具
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { HTTPClientTransport } from "@modelcontextprotocol/sdk/client/http.js";
import { loadConfig } from "../config.js";
import { ensureValidAccessToken } from "../auth.js";

let mcpClient: Client | null = null;
let mcpUrl: string = "";

async function initMcpClient(): Promise<Client> {
  if (mcpClient && mcpUrl === getMcpUrl()) {
    return mcpClient;
  }

  const url = getMcpUrl();
  if (!url) {
    throw new Error("arti-backend MCP URL 未配置，请设置 ARTI_BACKEND_MCP_URL");
  }

  const transport = new HTTPClientTransport({
    url,
    rejectUnauthorized: process.env.NODE_ENV !== "development",
  });

  mcpClient = new Client({ name: "arti-cli", version: "0.2.0" });

  try {
    const token = await ensureValidAccessToken();
    // 设置认证头
    if (token) {
      (transport as any).defaultHeaders = {
        Authorization: `Bearer ${token}`,
      };
    }
    await mcpClient.connect(transport);
  } catch (err) {
    mcpClient = null;
    throw new Error(`MCP 连接失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  mcpUrl = url;
  return mcpClient;
}

function getMcpUrl(): string {
  const config = loadConfig();
  return (
    process.env.ARTI_BACKEND_MCP_URL ||
    config.backend.mcpUrl ||
    "http://localhost:8001/mcp"
  );
}

export async function isMcpAvailable(): Promise<boolean> {
  try {
    await initMcpClient();
    return true;
  } catch {
    return false;
  }
}

export async function callMcpTool<T = Record<string, unknown>>(
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const client = await initMcpClient();

  try {
    const result = await client.callTool(toolName, args);
    if (result.isError) {
      throw new Error(`MCP 工具 ${toolName} 失败: ${result.content.map(c => c.text).join("\n")}`);
    }

    // 提取 text 类型的内容并尝试解析为 JSON
    const content = result.content.find(c => c.type === "text");
    if (!content || content.type !== "text") {
      throw new Error(`MCP 工具 ${toolName} 返回格式错误`);
    }

    try {
      return JSON.parse(content.text) as T;
    } catch {
      return { raw: content.text } as T;
    }
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`MCP 调用失败: ${String(err)}`);
  }
}

export async function getMcpRealtimeQuote(symbol: string, forceRefresh = false): Promise<Record<string, unknown>> {
  return callMcpTool("get_realtime_quote", { symbol, force_refresh: forceRefresh });
}

export async function getMcpDailyBars(
  symbol: string,
  days = 90,
  adjust = "qfq",
  forceRefresh = false,
): Promise<Record<string, unknown>> {
  return callMcpTool("get_daily_bars", {
    symbol,
    days,
    adjust,
    force_refresh: forceRefresh,
  });
}

export async function getMcpTechnicalIndicators(symbol: string, forceRefresh = false): Promise<Record<string, unknown>> {
  return callMcpTool("get_technical_indicators", { symbol, force_refresh: forceRefresh });
}
