/**
 * 数据层统一入口
 * 统一使用 Backend HTTP API
 */
import type { HybridTechnicalResult } from "./hybrid.js";
import type { HybridQuoteResult } from "./quote.js";

export async function getHybridQuote(symbol: string): Promise<HybridQuoteResult> {
  const { getHybridQuote: getApiQuote } = await import("./quote.js");
  return getApiQuote(symbol);
}

export async function getHybridQuotes(symbols: string[]): Promise<HybridQuoteResult[]> {
  const { getHybridQuotes: getApiQuotes } = await import("./quote.js");
  return getApiQuotes(symbols);
}

export async function getHybridTechnical(symbol: string, days?: number): Promise<HybridTechnicalResult> {
  const { getHybridTechnical: getApiTechnical } = await import("./hybrid.js");
  return getApiTechnical(symbol, days);
}

export function usingMcp(): boolean {
  return false;
}

export type { HybridTechnicalResult, HybridQuoteResult };
