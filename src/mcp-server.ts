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
  getFundamental,
  getOptionsChain,
  getFredSeries,
  getFredSearch,
  getTreasuryRates,
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

server.tool("arti_fundamental", "获取公司基本面数据：利润表、资产负债表、估值指标、分红记录",
  {
    symbol: z.string().describe("股票代码，如 AAPL"),
    fields: z.array(z.enum(["income", "balance", "metrics", "dividends"])).optional().default(["income", "balance", "metrics"]).describe("数据类别，默认 income+balance+metrics"),
  },
  ({ symbol, fields }) => mcpTool("获取基本面失败", () => getFundamental(symbol.toUpperCase(), fields)),
);

server.tool("arti_options", "获取股票期权链数据（看涨/看跌、行权价、到期日、隐含波动率等）",
  {
    symbol: z.string().describe("股票代码，如 AAPL"),
    limit: z.number().optional().default(20).describe("返回数量，默认 20"),
  },
  ({ symbol, limit }) => mcpTool("获取期权链失败", () => getOptionsChain(symbol.toUpperCase(), limit)),
);

server.tool("arti_economy", "获取宏观经济数据（FRED 数据系列或美国国债利率）",
  {
    indicator: z.enum(["fred_series", "fred_search", "treasury_rates"]).describe("数据类型"),
    series_id: z.string().optional().describe("FRED 系列 ID（indicator=fred_series 时必填），如 GDP, UNRATE, CPIAUCSL"),
    query: z.string().optional().describe("搜索关键词（indicator=fred_search 时必填）"),
    limit: z.number().optional().default(20).describe("返回数量"),
  },
  ({ indicator, series_id, query, limit }) => {
    if (indicator === "fred_series") {
      if (!series_id) return Promise.resolve({ content: [{ type: "text" as const, text: "fred_series 需要提供 series_id 参数" }], isError: true });
      return mcpTool("获取 FRED 数据失败", () => getFredSeries(series_id, limit));
    }
    if (indicator === "fred_search") {
      if (!query) return Promise.resolve({ content: [{ type: "text" as const, text: "fred_search 需要提供 query 参数" }], isError: true });
      return mcpTool("搜索 FRED 失败", () => getFredSearch(query, limit));
    }
    return mcpTool("获取国债利率失败", () => getTreasuryRates(limit));
  },
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
