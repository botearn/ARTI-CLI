import { loadConfig } from "../config.js";
import type { HistoricalBar } from "../openbb.js";

export class ArtiDataError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ArtiDataError";
  }
}

interface CnStockDailyRecord {
  symbol: string;
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function detectCnSymbol(symbol: string): string | null {
  const normalized = symbol.trim().toUpperCase();

  if (/^\d{6}$/.test(normalized)) return normalized;
  if (/^\d{6}\.(SS|SZ)$/.test(normalized)) return normalized.slice(0, 6);

  return null;
}

function buildDateRange(days: number): { start: string; end: string } {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

function mapCnDailyToHistorical(rows: CnStockDailyRecord[]): HistoricalBar[] {
  return rows
    .slice()
    .reverse()
    .map((row) => ({
      date: row.trade_date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    }));
}

export function canUseArtiDataHistory(symbol: string): boolean {
  const config = loadConfig();
  const provider = config.data.provider;

  if (provider === "openbb") return false;
  if (!config.data.artiDataBaseUrl) return false;
  if (!config.data.artiDataInternalKey) return false;

  return detectCnSymbol(symbol) !== null;
}

export async function fetchHistoryFromArtiData(symbol: string, days = 60): Promise<HistoricalBar[]> {
  const config = loadConfig();
  const cnSymbol = detectCnSymbol(symbol);

  if (!cnSymbol) {
    throw new ArtiDataError(400, `arti-data history 当前仅支持 A 股 symbol，收到: ${symbol}`);
  }
  if (!config.data.artiDataBaseUrl) {
    throw new ArtiDataError(503, "ARTI_DATA_API_URL 未配置");
  }
  if (!config.data.artiDataInternalKey) {
    throw new ArtiDataError(503, "ARTI_DATA_INTERNAL_KEY 未配置");
  }

  const { start, end } = buildDateRange(days);
  const url = new URL(`/v1/cn/stock/${cnSymbol}/daily`, config.data.artiDataBaseUrl);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  url.searchParams.set("limit", String(Math.min(Math.max(days, 1), 2000)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.data.artiDataTimeout);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Internal-Key": config.data.artiDataInternalKey,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ArtiDataError(res.status, text || `arti-data history 请求失败: HTTP ${res.status}`);
    }

    const data = await res.json() as CnStockDailyRecord[];
    return mapCnDailyToHistorical(data);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ArtiDataError(408, `arti-data history 请求超时（>${config.data.artiDataTimeout}ms）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
