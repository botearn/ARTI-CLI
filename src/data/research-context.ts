import { scanStockBackend, type BackendStockData } from "../api.js";
import { canUseBackendMcp, fetchStockContextFromBackendMcp, fetchStockFundFlowFromBackendMcp } from "./mcp-client.js";

export interface ResearchStockContext {
  stockData: string;
  backendStockData: string;
  technicalSource: "backend_mcp" | "backend_http" | "arti-data" | "openbb" | null;
}

export function formatResearchStockData(
  symbol: string,
  scan: BackendStockData | null,
  mcpContext?: Record<string, unknown> | null,
  fundFlow?: Record<string, unknown> | null,
): string {
  const parts: string[] = [];

  if (scan) {
    const t = scan.tech;
    const volume = typeof scan.curr_vol === "number" ? scan.curr_vol.toLocaleString() : String(scan.curr_vol ?? "");
    const pctStr = scan.pct != null ? `${scan.pct >= 0 ? "+" : ""}${scan.pct.toFixed(2)}%` : "—";
    parts.push(`${symbol}: $${scan.price ?? "—"} ${pctStr} 成交量:${volume}`);

    const bits: string[] = [];
    if (t?.ma20 != null) bits.push(`MA20:${t.ma20}`);
    if (t?.ma60 != null) bits.push(`MA60:${t.ma60}`);
    if (t?.rsi != null) bits.push(`RSI:${t.rsi.toFixed(1)}`);
    if (t?.macd != null) bits.push(`MACD:${t.macd.toFixed(4)}`);
    const support = t?.support ?? scan.support;
    const resist = t?.resist ?? scan.resist;
    if (support != null) bits.push(`支撑:${support}`);
    if (resist != null) bits.push(`压力:${resist}`);
    if (scan.overall_signal) bits.push(`信号:${scan.overall_signal}`);
    if (bits.length) parts.push(bits.join(" "));

    if (scan.fundamentals && Object.keys(scan.fundamentals).length) {
      parts.push(`基本面:${JSON.stringify(scan.fundamentals).slice(0, 200)}`);
    }
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
  scan: BackendStockData | null,
  mcpContext?: Record<string, unknown> | null,
  fundFlow?: Record<string, unknown> | null,
): string {
  const payload: Record<string, unknown> = { symbol };

  if (scan) {
    payload.quote = {
      price: scan.price,
      changePercent: scan.pct,
      volume: scan.curr_vol,
    };
    payload.technical = {
      ...scan.tech,
      overallSignal: scan.overall_signal,
      trendSignal: scan.trend_signal,
    };
    if (scan.fundamentals) payload.fundamentals = scan.fundamentals;
    if (scan.recent_5d) payload.recent5d = scan.recent_5d;
  }

  if (mcpContext) payload.mcpContext = mcpContext;
  if (fundFlow) payload.fundFlow = fundFlow;

  return Object.keys(payload).length > 1 ? JSON.stringify(payload) : "";
}

export async function buildResearchStockContext(symbol: string): Promise<ResearchStockContext> {
  const [scanSettled, mcpContextSettled, fundFlowSettled] = await Promise.allSettled([
    scanStockBackend(symbol),
    canUseBackendMcp()
      ? fetchStockContextFromBackendMcp(symbol, ["quote", "technicals", "profile", "fundamentals"])
      : Promise.resolve(null),
    canUseBackendMcp()
      ? fetchStockFundFlowFromBackendMcp(symbol)
      : Promise.resolve(null),
  ]);

  const scan = scanSettled.status === "fulfilled" ? scanSettled.value.scan : null;
  const mcpContext = mcpContextSettled.status === "fulfilled" ? mcpContextSettled.value : null;
  const fundFlow = fundFlowSettled.status === "fulfilled" ? fundFlowSettled.value : null;
  const technicalSource: ResearchStockContext["technicalSource"] = scan ? "backend_http" : mcpContext ? "backend_mcp" : null;

  return {
    stockData: formatResearchStockData(symbol, scan, mcpContext, fundFlow),
    backendStockData: formatBackendResearchStockData(symbol, scan, mcpContext, fundFlow),
    technicalSource,
  };
}
