import { getTechnical, type TechnicalData } from "../openbb.js";
import { canUseArtiDataHistory, fetchHistoryFromArtiData } from "./client.js";
import { buildTechnicalFromHistory } from "./technical.js";

export interface HybridTechnicalResult {
  technical: TechnicalData;
  source: "arti-data" | "openbb";
}

export async function getHybridTechnical(symbol: string, days = 220): Promise<HybridTechnicalResult> {
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

  return {
    technical: await getTechnical(symbol),
    source: "openbb",
  };
}
