import { getQuote, type QuoteData, type TechnicalData } from "../openbb.js";
import { getHybridTechnical } from "./hybrid.js";

export interface ResearchStockContext {
  stockData: string;
  backendStockData: string;
  technicalSource: "backend" | "arti-data" | "openbb" | null;
}

export function formatResearchStockData(
  symbol: string,
  quote: QuoteData | null,
  technical: TechnicalData | null,
  technicalSource: "backend" | "arti-data" | "openbb" | null,
): string {
  const parts: string[] = [];

  if (quote) {
    const price = quote.last_price ?? quote.prev_close ?? 0;
    const changePct = typeof quote.change_percent === "number" ? quote.change_percent.toFixed(2) : "0.00";
    const volume = quote.volume?.toLocaleString?.() ?? String(quote.volume ?? "");
    parts.push(`${symbol}: $${price} ${quote.change >= 0 ? "+" : ""}${changePct}% 成交量:${volume}`);

    if (quote.ma_50d) parts.push(`MA50:${quote.ma_50d}`);
    if (quote.year_high && quote.year_low) parts.push(`52周:${quote.year_low}-${quote.year_high}`);
  }

  if (technical && !technical.error) {
    const technicalBits: string[] = [];
    if (technical.ma.MA20) technicalBits.push(`MA20:${technical.ma.MA20}`);
    if (technical.ma.MA60) technicalBits.push(`MA60:${technical.ma.MA60}`);
    if (technical.rsi !== null) technicalBits.push(`RSI:${technical.rsi.toFixed(1)}`);
    if (technical.macd) technicalBits.push(`MACD_hist:${technical.macd.histogram.toFixed(4)}`);
    if (technical.adx !== null) technicalBits.push(`ADX:${technical.adx.toFixed(1)}`);
    technicalBits.push(`信号:${technical.overall_signal}`);
    if (technicalSource) technicalBits.push(`source:${technicalSource}`);
    parts.push(technicalBits.join(" "));
  }

  return parts.join(" | ");
}

export function formatBackendResearchStockData(
  symbol: string,
  quote: QuoteData | null,
  technical: TechnicalData | null,
  technicalSource: "backend" | "arti-data" | "openbb" | null,
): string {
  const payload: Record<string, unknown> = { symbol };

  if (quote) {
    payload.quote = {
      price: quote.last_price ?? quote.prev_close ?? null,
      change: quote.change ?? null,
      changePercent: quote.change_percent ?? null,
      volume: quote.volume ?? null,
      ma50: quote.ma_50d ?? null,
      yearHigh: quote.year_high ?? null,
      yearLow: quote.year_low ?? null,
    };
  }

  if (technical && !technical.error) {
    payload.technical = {
      price: technical.price,
      change: technical.change,
      changePercent: technical.change_percent,
      ma: technical.ma,
      rsi: technical.rsi,
      macd: technical.macd,
      bbands: technical.bbands,
      atr: technical.atr,
      adx: technical.adx,
      signals: technical.signals,
      overallSignal: technical.overall_signal,
    };
  }

  if (technicalSource) {
    payload.technicalSource = technicalSource;
  }

  return Object.keys(payload).length > 1 ? JSON.stringify(payload) : "";
}

export async function buildResearchStockContext(symbol: string): Promise<ResearchStockContext> {
  const [quoteSettled, technicalSettled] = await Promise.allSettled([
    getQuote(symbol),
    getHybridTechnical(symbol, 220),
  ]);

  const quote = quoteSettled.status === "fulfilled" ? quoteSettled.value : null;
  const technical = technicalSettled.status === "fulfilled" ? technicalSettled.value.technical : null;
  const technicalSource = technicalSettled.status === "fulfilled" ? technicalSettled.value.source : null;

  return {
    stockData: formatResearchStockData(symbol, quote, technical, technicalSource),
    backendStockData: formatBackendResearchStockData(symbol, quote, technical, technicalSource),
    technicalSource,
  };
}
