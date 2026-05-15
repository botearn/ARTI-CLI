/**
 * Quote 数据层 — MCP 集成版
 * 优先级：Backend MCP → Backend API → OpenBB
 */
import { loadConfig } from "../config.js";
import { fetchQuotesBackend, type StockQuote, type MarketIndex } from "../api.js";
import { getQuote, getHistorical, type QuoteData } from "../openbb.js";
import { getMcpRealtimeQuote, isMcpAvailable } from "./mcp-client.js";

export interface HybridQuoteResult {
  quote: QuoteData;
  prices: number[];
  source: "backend-mcp" | "backend" | "openbb";
}

function backendToQuoteData(sq: StockQuote): QuoteData {
  const vol = parseVolume(sq.volume);
  return {
    symbol: sq.symbol,
    name: sq.nameZh || sq.name,
    last_price: sq.price,
    open: 0,
    high: 0,
    low: 0,
    prev_close: sq.price - sq.change,
    volume: vol,
    change: sq.change,
    change_percent: sq.changePercent,
    year_high: 0,
    year_low: 0,
    ma_50d: 0,
    ma_200d: 0,
    volume_average: 0,
    currency: null,
  };
}

function mcpToQuoteData(mcpData: Record<string, unknown>): QuoteData | null {
  try {
    const quote = mcpData as Record<string, unknown>;
    if (!quote.symbol || !quote.current_price) return null;

    return {
      symbol: String(quote.symbol),
      name: quote.name_zh ? String(quote.name_zh) : String(quote.name || ""),
      last_price: Number(quote.current_price) || 0,
      open: Number(quote.open || 0) || 0,
      high: Number(quote.high || 0) || 0,
      low: Number(quote.low || 0) || 0,
      prev_close: Number(quote.prev_close || 0) || 0,
      volume: Number(quote.volume || 0) || 0,
      change: Number(quote.change || 0) || 0,
      change_percent: Number(quote.change_pct || 0) || 0,
      year_high: Number(quote.year_high || 0) || 0,
      year_low: Number(quote.year_low || 0) || 0,
      ma_50d: Number(quote.ma_50d || 0) || 0,
      ma_200d: Number(quote.ma_200d || 0) || 0,
      volume_average: Number(quote.avg_volume || 0) || 0,
      currency: null,
    };
  } catch {
    return null;
  }
}

function parseVolume(vol: string): number {
  if (!vol) return 0;
  const upper = vol.toUpperCase();
  if (upper.endsWith("B")) return parseFloat(vol) * 1e9;
  if (upper.endsWith("M")) return parseFloat(vol) * 1e6;
  if (upper.endsWith("K")) return parseFloat(vol) * 1e3;
  return parseFloat(vol) || 0;
}

export async function getHybridQuote(symbol: string): Promise<HybridQuoteResult> {
  const config = loadConfig();

  // 优先级 1: Backend MCP (如果启用)
  if (config.backend.mcpEnabled && (await isMcpAvailable())) {
    try {
      const mcpData = await getMcpRealtimeQuote(symbol);
      const quote = mcpToQuoteData(mcpData);
      if (quote) {
        return {
          quote,
          prices: [],
          source: "backend-mcp",
        };
      }
    } catch (err) {
      console.warn("Backend MCP quote 失败，fallback：", (err as Error).message);
      // fallback below
    }
  }

  // 优先级 2: Backend API (如果启用)
  if (config.backend.enabled && config.backend.url) {
    try {
      const res = await fetchQuotesBackend(symbol);
      const sq = res.quotes?.[0];
      if (sq) {
        return {
          quote: backendToQuoteData(sq),
          prices: sq.sparkline || [],
          source: "backend",
        };
      }
    } catch {
      // fallback to openbb
    }
  }

  // 优先级 3: OpenBB (兜底)
  const quote = await getQuote(symbol);
  let prices: number[] = [];
  try {
    const hist = await getHistorical(symbol, 20);
    prices = hist.map(h => h.close);
  } catch { /* sparkline non-critical */ }

  return { quote, prices, source: "openbb" };
}

export async function getHybridQuotes(symbols: string[]): Promise<HybridQuoteResult[]> {
  const config = loadConfig();

  // 优先级 1: Backend MCP (如果启用)
  if (config.backend.mcpEnabled && (await isMcpAvailable())) {
    try {
      const results: HybridQuoteResult[] = [];
      for (const symbol of symbols) {
        try {
          const mcpData = await getMcpRealtimeQuote(symbol);
          const quote = mcpToQuoteData(mcpData);
          if (quote) {
            results.push({
              quote,
              prices: [],
              source: "backend-mcp",
            });
          }
        } catch {
          // skip this symbol, will fallback
        }
      }
      if (results.length > 0) return results;
    } catch (err) {
      console.warn("Backend MCP quotes 失败，fallback：", (err as Error).message);
      // fallback below
    }
  }

  // 优先级 2: Backend API (如果启用)
  if (config.backend.enabled && config.backend.url) {
    try {
      const res = await fetchQuotesBackend(symbols.join(","));
      if (res.quotes?.length) {
        return res.quotes.map(sq => ({
          quote: backendToQuoteData(sq),
          prices: sq.sparkline || [],
          source: "backend" as const,
        }));
      }
    } catch {
      // fallback to openbb
    }
  }

  // 优先级 3: OpenBB (兜底)
  const results = await Promise.all(symbols.map(async (sym): Promise<HybridQuoteResult | null> => {
    try {
      const quote = await getQuote(sym);
      let prices: number[] = [];
      try {
        const hist = await getHistorical(sym, 20);
        prices = hist.map(h => h.close);
      } catch { /* sparkline non-critical */ }
      return { quote, prices, source: "openbb" };
    } catch {
      return null;
    }
  }));

  return results.filter((r): r is HybridQuoteResult => r !== null);
}

export { type StockQuote, type MarketIndex };
