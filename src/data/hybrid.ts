import { getTechnical, type TechnicalData } from "../openbb.js";
import { canUseArtiDataHistory, fetchHistoryFromArtiData } from "./client.js";
import { buildTechnicalFromHistory } from "./technical.js";
import { scanStockBackend, type BackendStockData } from "../api.js";
import { loadConfig } from "../config.js";

export interface HybridTechnicalResult {
  technical: TechnicalData;
  source: "backend" | "arti-data" | "openbb";
}

/**
 * 转换 Backend StockData 到 CLI TechnicalData 格式
 */
function convertBackendToTechnical(backendData: BackendStockData): TechnicalData {
  const tech = backendData.tech;
  return {
    price: backendData.price,
    change: backendData.price * (backendData.pct / 100), // 从百分比算回绝对值
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
      signal: 0, // Backend 只返回 MACD 值，这里用 0 占位
      histogram: 0,
    } : null,
    bbands: tech.bb_up !== null && tech.bb_dn !== null ? {
      upper: tech.bb_up,
      middle: (tech.bb_up + tech.bb_dn) / 2,
      lower: tech.bb_dn,
    } : null,
    atr: tech.atr,
    adx: null, // Backend 没有 ADX
    stochastic: null, // Backend 没有 KDJ
    obv: null, // Backend 没有 OBV
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

export async function getHybridTechnical(symbol: string, days = 220): Promise<HybridTechnicalResult> {
  const config = loadConfig();

  // 优先级 1: Backend (如果启用)
  if (config.backend.enabled && config.backend.url) {
    try {
      const backendResult = await scanStockBackend(symbol);
      return {
        technical: convertBackendToTechnical(backendResult.scan),
        source: "backend",
      };
    } catch (err) {
      console.warn("Backend scan 失败，fallback 到 arti-data/openbb:", (err as Error).message);
      // fallback below
    }
  }

  // 优先级 2: arti-data (仅 A 股)
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

  // 优先级 3: OpenBB (兜底)
  return {
    technical: await getTechnical(symbol),
    source: "openbb",
  };
}
