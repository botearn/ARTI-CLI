/**
 * 数据层统一入口
 * 根据配置自动选择使用 MCP 版本或 API 版本
 */
import { loadConfig } from "../config.js";
import type { HybridTechnicalResult } from "./mcp-technical.js";
import type { HybridQuoteResult, StockQuote, MarketIndex } from "./mcp-quote.js";

let usesMcp = false;

export async function getHybridQuote(symbol: string): Promise<HybridQuoteResult> {
  const config = loadConfig();

  if (config.backend.mcpEnabled) {
    try {
      const { getHybridQuote: getMcpQuote } = await import("./mcp-quote.js");
      usesMcp = true;
      return getMcpQuote(symbol);
    } catch {
      usesMcp = false;
      // fallback to API version
    }
  }

  const { getHybridQuote: getApiQuote } = await import("./quote.js");
  return getApiQuote(symbol);
}

export async function getHybridQuotes(symbols: string[]): Promise<HybridQuoteResult[]> {
  const config = loadConfig();

  if (config.backend.mcpEnabled) {
    try {
      const { getHybridQuotes: getMcpQuotes } = await import("./mcp-quote.js");
      usesMcp = true;
      return getMcpQuotes(symbols);
    } catch {
      usesMcp = false;
      // fallback to API version
    }
  }

  const { getHybridQuotes: getApiQuotes } = await import("./quote.js");
  return getApiQuotes(symbols);
}

export async function getHybridTechnical(symbol: string, days?: number): Promise<HybridTechnicalResult> {
  const config = loadConfig();

  if (config.backend.mcpEnabled) {
    try {
      const { getHybridTechnical: getMcpTechnical } = await import("./mcp-technical.ts");
      usesMcp = true;
      return getMcpTechnical(symbol, days);
    } catch {
      usesMcp = false;
      // fallback to API version
    }
  }

  const { getHybridTechnical: getApiTechnical } = await import("./hybrid.js");
  return getApiTechnical(symbol, days);
}

export function usingMcp(): boolean {
  return usesMcp;
}

export type { HybridTechnicalResult, HybridQuoteResult, StockQuote, MarketIndex };
