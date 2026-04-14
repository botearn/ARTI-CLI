#!/usr/bin/env node
/**
 * ARTI MCP Server — 将 ARTI 金融数据能力暴露为 MCP 工具
 * 适配 Claude Code / Claude Desktop / 任何 MCP 客户端
 *
 * 启动方式：node dist/mcp-server.js（stdio 传输）
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getQuote,
  getHistorical,
  getCryptoHistory,
  getIndex,
  getMarketOverview,
  getGainers,
  getLosers,
  getActive,
  getTechnical,
  searchEquity,
  getCompanyNews,
  getWorldNews,
} from "./openbb.js";

const server = new McpServer({
  name: "arti",
  version: "0.2.0",
});

// ── 统一 MCP 工具包装 ──
type McpResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function mcpTool<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<McpResult> {
  return fn()
    .then((data) => ({
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }))
    .catch((err) => ({
      content: [{ type: "text" as const, text: `${label}: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    }));
}

// ── Tools ──
server.tool("arti_quote", "获取股票实时报价（价格、涨跌、成交量、52周高低、均线等）",
  { symbol: z.string().describe("股票代码，如 AAPL、NVDA、0700.HK") },
  ({ symbol }) => mcpTool("获取报价失败", () => getQuote(symbol.toUpperCase())),
);

server.tool("arti_historical", "获取股票历史价格数据（OHLCV），用于趋势分析和图表",
  { symbol: z.string().describe("股票代码"), days: z.number().optional().default(60).describe("历史天数，默认 60") },
  ({ symbol, days }) => mcpTool("获取历史数据失败", () => getHistorical(symbol.toUpperCase(), days)),
);

server.tool("arti_crypto", "获取加密货币历史价格（如 BTCUSD、ETHUSD）",
  { symbol: z.string().describe("加密货币代码，如 BTCUSD、ETHUSD"), days: z.number().optional().default(30).describe("历史天数，默认 30") },
  ({ symbol, days }) => mcpTool("获取加密货币数据失败", () => getCryptoHistory(symbol.toUpperCase(), days)),
);

server.tool("arti_market", "获取全球市场概览：美股（标普/道琼斯/纳斯达克）、亚太（恒生/上证/日经）、欧洲（富时/DAX）指数行情",
  {},
  () => mcpTool("获取市场数据失败", () => getMarketOverview()),
);

server.tool("arti_gainers", "获取今日股票涨幅榜（美股）",
  { limit: z.number().optional().default(10).describe("返回数量，默认 10") },
  ({ limit }) => mcpTool("获取涨幅榜失败", () => getGainers(limit)),
);

server.tool("arti_losers", "获取今日股票跌幅榜（美股）",
  { limit: z.number().optional().default(10).describe("返回数量，默认 10") },
  ({ limit }) => mcpTool("获取跌幅榜失败", () => getLosers(limit)),
);

server.tool("arti_active", "获取今日最活跃股票榜（美股，按成交量排序）",
  { limit: z.number().optional().default(10).describe("返回数量，默认 10") },
  ({ limit }) => mcpTool("获取活跃榜失败", () => getActive(limit)),
);

server.tool("arti_technical", "技术指标全面扫描：均线（MA5/10/20/60/120/200）、RSI、MACD、布林带、ATR、ADX、OBV、Stochastic，附综合多空研判",
  { symbol: z.string().describe("股票代码") },
  ({ symbol }) => mcpTool("技术扫描失败", () => getTechnical(symbol.toUpperCase())),
);

server.tool("arti_search", "搜索股票代码（支持公司名称、代码模糊搜索）",
  { query: z.string().describe("搜索关键词，如 Apple、Tesla、腾讯"), limit: z.number().optional().default(10).describe("返回数量，默认 10") },
  ({ query, limit }) => mcpTool("搜索失败", () => searchEquity(query, limit)),
);

server.tool("arti_news", "获取财经新闻。提供 symbol 返回该公司新闻，不提供则返回全球财经新闻",
  { symbol: z.string().optional().describe("股票代码（可选），如 AAPL"), limit: z.number().optional().default(10).describe("返回数量，默认 10") },
  ({ symbol, limit }) => mcpTool("获取新闻失败", () => symbol ? getCompanyNews(symbol.toUpperCase(), limit) : getWorldNews(limit)),
);

// ── 启动 ──
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("ARTI MCP Server 启动失败:", err);
  process.exit(1);
});
