import { loadConfig } from "../config.js";
import { fetchQuotesBackend, type StockQuote, type MarketIndex } from "../api.js";
import { getQuote, getHistorical, type QuoteData } from "../openbb.js";

export interface HybridQuoteResult {
  quote: QuoteData;
  prices: number[];
  source: "backend" | "openbb";
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
