/**
 * Technical 数据层 — MCP 集成版
 * 优先级：Backend MCP（最高）→ Backend API → arti-data/OpenBB
 * MCP 对所有市场（美股/港股/A 股）都是最高优先级
 */
import { getTechnical, type TechnicalData } from "../openbb.js";
import { canUseArtiDataHistory, fetchHistoryFromArtiData } from "./client.js";
import { buildTechnicalFromHistory } from "./technical.js";
import { scanStockBackend, type BackendStockData } from "../api.js";
import { loadConfig } from "../config.js";
import { getMcpTechnicalIndicators, isMcpAvailable } from "./mcp-client.js";

export interface HybridTechnicalResult {
  technical: TechnicalData;
  source: "backend-mcp" | "backend" | "arti-data" | "openbb";
}

/**
 * 转换 Backend StockData 到 CLI TechnicalData 格式
 */
function convertBackendToTechnical(backendData: BackendStockData): TechnicalData {
  const tech = "tech" in backendData && backendData.tech
    ? backendData.tech
    : {
        trend: backendData.trend_signal ?? backendData.overall_signal ?? "中性",
        ma5: backendData.ma5,
        ma10: backendData.ma10,
        ma20: backendData.ma20,
        ma60: backendData.ma60,
        rsi: backendData.rsi,
        macd: backendData.macd,
        bb_pos: backendData.bb_pos,
        bb_up: backendData.bb_up,
        bb_dn: backendData.bb_dn,
        atr: backendData.atr,
        atr_stop: backendData.atr_stop,
        atr_pct: backendData.atr_pct,
        support: backendData.support,
        resist: backendData.resist,
      };
  return {
    price: backendData.price,
    change: backendData.price * (backendData.pct / 100),
    change_percent: backendData.pct,
    ma: {
      "MA5": tech.ma5,
      "MA10": tech.ma10,
      "MA20": tech.ma20,
      "MA60": tech.ma60,
    },
    rsi: tech.rsi,
    macd: tech.macd !== null ? {
      MACD: tech.macd,
      signal: 0,
      histogram: 0,
    } : null,
    bbands: tech.bb_up !== null && tech.bb_dn !== null ? {
      upper: tech.bb_up,
      middle: (tech.bb_up + tech.bb_dn) / 2,
      lower: tech.bb_dn,
    } : null,
    atr: tech.atr,
    adx: null,
    stochastic: null,
    obv: null,
    signals: [
      `趋势: ${tech.trend}`,
      tech.rsi !== null ? `RSI: ${tech.rsi.toFixed(1)}` : "",
      tech.support !== null ? `支撑位: ${tech.support.toFixed(2)}` : "",
      tech.resist !== null ? `压力位: ${tech.resist.toFixed(2)}` : "",
    ].filter(Boolean),
    overall_signal: tech.rsi !== null
      ? (tech.rsi > 70 ? "偏空" : tech.rsi < 30 ? "偏多" : "中性")
      : "中性",
  };
}

/**
 * 转换 MCP 技术指标数据格式
 */
function convertMcpToTechnical(mcpData: Record<string, unknown>): TechnicalData | null {
  try {
    const data = mcpData as Record<string, unknown>;
    const quote = (data.quote || {}) as Record<string, unknown>;

    return {
      price: Number(quote.current_price || 0) || 0,
      change: Number(quote.change || 0) || 0,
      change_percent: Number(quote.change_pct || 0) || 0,
      ma: {
        "MA5": Number((data.ma5 as Record<string, unknown>)?.value || 0) || null,
        "MA10": Number((data.ma10 as Record<string, unknown>)?.value || 0) || null,
        "MA20": Number((data.ma20 as Record<string, unknown>)?.value || 0) || null,
        "MA60": Number((data.ma60 as Record<string, unknown>)?.value || 0) || null,
      },
      rsi: data.rsi ? Number((data.rsi as Record<string, unknown>).value) : null,
      macd: data.macd ? {
        MACD: Number((data.macd as Record<string, unknown>).macd) || 0,
        signal: Number((data.macd as Record<string, unknown>).signal) || 0,
        histogram: Number((data.macd as Record<string, unknown>).histogram) || 0,
      } : null,
      bbands: data.bollinger_bands ? {
        upper: Number((data.bollinger_bands as Record<string, unknown>).upper) || 0,
        middle: Number((data.bollinger_bands as Record<string, unknown>).middle) || 0,
        lower: Number((data.bollinger_bands as Record<string, unknown>).lower) || 0,
      } : null,
      atr: data.atr ? Number((data.atr as Record<string, unknown>).value) : null,
      adx: data.adx ? Number((data.adx as Record<string, unknown>).value) : null,
      stochastic: data.stochastic ? {
        k: Number((data.stochastic as Record<string, unknown>).k) || 0,
        d: Number((data.stochastic as Record<string, unknown>).d) || 0,
      } : null,
      obv: data.obv ? Number((data.obv as Record<string, unknown>).value) : null,
      signals: [
        `趋势: ${String(data.trend || "中性")}`,
        data.rsi ? `RSI: ${Number((data.rsi as Record<string, unknown>).value).toFixed(1)}` : "",
      ].filter(Boolean),
      overall_signal: "中性",
    };
  } catch {
    return null;
  }
}

export async function getHybridTechnical(symbol: string, days = 220): Promise<HybridTechnicalResult> {
  const config = loadConfig();

  // 优先级 1: Backend MCP (如果启用)
  if (config.backend.mcpEnabled && (await isMcpAvailable())) {
    try {
      const mcpData = await getMcpTechnicalIndicators(symbol);
      const technical = convertMcpToTechnical(mcpData);
      if (technical) {
        return { technical, source: "backend-mcp" };
      }
    } catch (err) {
      console.warn("Backend MCP technical 失败，fallback：", (err as Error).message);
      // fallback below
    }
  }

  // 优先级 2: Backend API (如果启用)
  if (config.backend.enabled && config.backend.url) {
    try {
      const backendResult = await scanStockBackend(symbol);
      return {
        technical: convertBackendToTechnical(backendResult.scan),
        source: "backend",
      };
    } catch (err) {
      console.warn("Backend API scan 失败，fallback：", (err as Error).message);
      // fallback below
    }
  }

  // 优先级 3: arti-data (仅 A 股)
  if (canUseArtiDataHistory(symbol)) {
    try {
      const bars = await fetchHistoryFromArtiData(symbol, days);
      return {
        technical: buildTechnicalFromHistory(symbol, bars),
        source: "arti-data",
      };
    } catch {
      // fallback below
    }
  }

  // 优先级 4: OpenBB (兜底)
  return {
    technical: await getTechnical(symbol),
    source: "openbb",
  };
}
