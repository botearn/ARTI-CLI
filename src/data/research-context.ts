import type { QuoteData, TechnicalData } from "../openbb.js";
import { getHybridTechnical } from "./hybrid.js";
import { getHybridQuote } from "./quote.js";
import { canUseBackendMcp, fetchStockContextFromBackendMcp, fetchStockFundFlowFromBackendMcp } from "./mcp-client.js";

export interface ResearchStockContext {
  stockData: string;
  backendStockData: string;
  technicalSource: "backend_mcp" | "backend_http" | "arti-data" | "openbb" | null;
}

type ResearchSource = ResearchStockContext["technicalSource"];

export function formatResearchStockData(
  symbol: string,
  quote: QuoteData | null,
  technical: TechnicalData | null,
  technicalSource: ResearchSource,
  mcpContext?: Record<string, unknown> | null,
  fundFlow?: Record<string, unknown> | null,
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

  if (mcpContext) {
    const profile = mcpContext.profile ?? mcpContext.company_profile ?? mcpContext.companyProfile;
    if (profile && typeof profile === "object") {
      const p = profile as Record<string, unknown>;
      const bits = [
        p.name ? `名称:${p.name}` : "",
        p.industry ? `行业:${p.industry}` : "",
        p.market ? `市场:${p.market}` : "",
      ].filter(Boolean);
      if (bits.length) parts.push(bits.join(" "));
    }
  }

  if (fundFlow) {
    const items = Array.isArray(fundFlow.items) ? fundFlow.items : Array.isArray(fundFlow.data) ? fundFlow.data : null;
    if (items?.length) {
      parts.push(`资金流: ${JSON.stringify(items[0]).slice(0, 180)}`);
    }
  }

  return parts.join(" | ");
}

export function formatBackendResearchStockData(
  symbol: string,
  quote: QuoteData | null,
  technical: TechnicalData | null,
  technicalSource: ResearchSource,
  mcpContext?: Record<string, unknown> | null,
  fundFlow?: Record<string, unknown> | null,
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
  if (mcpContext) {
    payload.mcpContext = mcpContext;
  }
  if (fundFlow) {
    payload.fundFlow = fundFlow;
  }

  return Object.keys(payload).length > 1 ? JSON.stringify(payload) : "";
}

export async function buildResearchStockContext(symbol: string): Promise<ResearchStockContext> {
  const [quoteSettled, technicalSettled, mcpContextSettled, fundFlowSettled] = await Promise.allSettled([
    getHybridQuote(symbol),
    getHybridTechnical(symbol, 220),
    canUseBackendMcp(symbol)
      ? fetchStockContextFromBackendMcp(symbol, ["quote", "technicals", "profile", "fundamentals"])
      : Promise.resolve(null),
    canUseBackendMcp(symbol)
      ? fetchStockFundFlowFromBackendMcp(symbol)
      : Promise.resolve(null),
  ]);

  const quote = quoteSettled.status === "fulfilled" ? quoteSettled.value.quote : null;
  const technical = technicalSettled.status === "fulfilled" ? technicalSettled.value.technical : null;
  const technicalSource = technicalSettled.status === "fulfilled" ? technicalSettled.value.source : null;
  const mcpContext = mcpContextSettled.status === "fulfilled" ? mcpContextSettled.value : null;
  const fundFlow = fundFlowSettled.status === "fulfilled" ? fundFlowSettled.value : null;

  return {
    stockData: formatResearchStockData(symbol, quote, technical, technicalSource, mcpContext, fundFlow),
    backendStockData: formatBackendResearchStockData(symbol, quote, technical, technicalSource, mcpContext, fundFlow),
    technicalSource,
  };
}
