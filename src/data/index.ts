/**
 * 数据层统一入口
 * 优先使用 Backend MCP，失败再回退到 HTTP API / arti-data / OpenBB
 */
import type { HybridTechnicalResult } from "./hybrid.js";
import type { HybridQuoteResult } from "./quote.js";
import { canUseBackendMcp } from "./mcp-client.js";

export async function getHybridQuote(symbol: string, options?: { forceRefresh?: boolean }): Promise<HybridQuoteResult> {
  const { getHybridQuote: getApiQuote } = await import("./quote.js");
  return getApiQuote(symbol, options);
}

export async function getHybridQuotes(symbols: string[], options?: { forceRefresh?: boolean }): Promise<HybridQuoteResult[]> {
  const { getHybridQuotes: getApiQuotes } = await import("./quote.js");
  return getApiQuotes(symbols, options);
}

export async function getHybridTechnical(symbol: string, days?: number, options?: { forceRefresh?: boolean }): Promise<HybridTechnicalResult> {
  const { getHybridTechnical: getApiTechnical } = await import("./hybrid.js");
  return getApiTechnical(symbol, days, options);
}

export function usingMcp(): boolean {
  return canUseBackendMcp();
}

export type { HybridTechnicalResult, HybridQuoteResult };
