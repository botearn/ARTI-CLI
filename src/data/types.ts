/**
 * 行情/技术面数据类型
 *
 * 原定义在 openbb.ts；OpenBB 链下线后迁出，供 mcp-client / research-context 复用。
 */

export interface QuoteData {
  symbol: string;
  name: string;
  last_price: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  volume: number;
  change: number;
  change_percent: number;
  year_high: number;
  year_low: number;
  ma_50d: number;
  ma_200d: number;
  volume_average: number;
  currency: string | null;
}

export interface HistoricalBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalData {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  ma: Record<string, number>;
  rsi: number | null;
  macd: { MACD: number; signal: number; histogram: number } | null;
  bbands: { upper: number; middle: number; lower: number } | null;
  atr: number | null;
  adx: number | null;
  obv: number | null;
  stochastic: { K: number; D: number } | null;
  recent: { date: string; close: number; volume: number }[];
  signals: string[];
  overall_signal: string;
  error?: string;
}
