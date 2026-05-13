import type { HistoricalBar, TechnicalData } from "../openbb.js";

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function computeRsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function computeMacd(closes: number[]): { MACD: number; signal: number; histogram: number } | null {
  if (closes.length < 26) return null;
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = closes.map((_, index) => ema12[index] - ema26[index]);
  const signalLine = ema(macdLine, 9);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  return {
    MACD: round(macd, 4),
    signal: round(signal, 4),
    histogram: round(macd - signal, 4),
  };
}

function computeBbands(closes: number[], period = 20, stdMultiplier = 2): { upper: number; middle: number; lower: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((sum, value) => sum + value, 0) / period;
  const variance = slice.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / period;
  const std = Math.sqrt(variance);
  return {
    upper: round(mean + std * stdMultiplier),
    middle: round(mean),
    lower: round(mean - std * stdMultiplier),
  };
}

function computeAtr(bars: HistoricalBar[], period = 14): number | null {
  if (bars.length <= period) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const current = bars[i];
    const previous = bars[i - 1];
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;

  let atr = trs.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = ((atr * (period - 1)) + trs[i]) / period;
  }
  return round(atr);
}

function computeAdx(bars: HistoricalBar[], period = 14): number | null {
  if (bars.length <= period * 2) return null;

  const trs: number[] = [];
  const plusDms: number[] = [];
  const minusDms: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const current = bars[i];
    const previous = bars[i - 1];
    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;

    plusDms.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDms.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    ));
  }

  let atr = trs.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  let plusDm = plusDms.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  let minusDm = minusDms.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  const dxs: number[] = [];
  for (let i = period; i < trs.length; i++) {
    atr = ((atr * (period - 1)) + trs[i]) / period;
    plusDm = ((plusDm * (period - 1)) + plusDms[i]) / period;
    minusDm = ((minusDm * (period - 1)) + minusDms[i]) / period;

    if (atr === 0) continue;

    const plusDi = (plusDm / atr) * 100;
    const minusDi = (minusDm / atr) * 100;
    const denominator = plusDi + minusDi;
    if (denominator === 0) continue;

    dxs.push((Math.abs(plusDi - minusDi) / denominator) * 100);
  }

  if (!dxs.length) return null;

  let adx = dxs.slice(0, period).reduce((sum, value) => sum + value, 0) / Math.min(period, dxs.length);
  for (let i = period; i < dxs.length; i++) {
    adx = ((adx * (period - 1)) + dxs[i]) / period;
  }

  return round(adx);
}

function computeObv(bars: HistoricalBar[]): number | null {
  if (bars.length < 2) return null;
  let obv = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) obv += bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) obv -= bars[i].volume;
  }
  return Math.trunc(obv);
}

function computeStochastic(bars: HistoricalBar[], period = 14): { K: number; D: number } | null {
  if (bars.length < period + 3) return null;
  const ks: number[] = [];

  for (let i = period - 1; i < bars.length; i++) {
    const window = bars.slice(i - period + 1, i + 1);
    const highestHigh = Math.max(...window.map((bar) => bar.high));
    const lowestLow = Math.min(...window.map((bar) => bar.low));
    const denominator = highestHigh - lowestLow;
    const value = denominator === 0 ? 50 : ((bars[i].close - lowestLow) / denominator) * 100;
    ks.push(value);
  }

  if (ks.length < 3) return null;
  const k = ks.slice(-3).reduce((sum, value) => sum + value, 0) / 3;
  const d = ks.slice(-5, -2).length >= 3
    ? ks.slice(-5, -2).reduce((sum, value) => sum + value, 0) / 3
    : k;

  return {
    K: round(k),
    D: round(d),
  };
}

export function buildTechnicalFromHistory(symbol: string, bars: HistoricalBar[]): TechnicalData {
  if (bars.length < 30) {
    return {
      symbol,
      price: 0,
      change: 0,
      change_percent: 0,
      ma: {},
      rsi: null,
      macd: null,
      bbands: null,
      atr: null,
      adx: null,
      obv: null,
      stochastic: null,
      recent: [],
      signals: [],
      overall_signal: "中性",
      error: `数据不足: 仅 ${bars.length} 条记录`,
    };
  }

  const closes = bars.map((bar) => bar.close);
  const latest = bars[bars.length - 1];
  const previous = bars[bars.length - 2];
  const price = latest.close;
  const change = price - previous.close;
  const changePercent = previous.close === 0 ? 0 : (change / previous.close) * 100;

  const ma: Record<string, number> = {};
  for (const period of [5, 10, 20, 60, 120, 200]) {
    const value = sma(closes, period);
    if (value !== null) ma[`MA${period}`] = round(value);
  }

  const rsi = computeRsi(closes);
  const macd = computeMacd(closes);
  const bbands = computeBbands(closes);
  const atr = computeAtr(bars);
  const adx = computeAdx(bars);
  const obv = computeObv(bars);
  const stochastic = computeStochastic(bars);
  const recent = bars.slice(-5).map((bar) => ({
    date: bar.date,
    close: round(bar.close),
    volume: bar.volume,
  }));

  const signals: string[] = [];
  if (rsi !== null) {
    if (rsi > 70) signals.push("RSI超买");
    else if (rsi < 30) signals.push("RSI超卖");
  }
  if (macd) {
    if (macd.histogram > 0) signals.push("MACD多头");
    else signals.push("MACD空头");
  }
  if (bbands) {
    if (price > bbands.upper) signals.push("突破布林上轨");
    else if (price < bbands.lower) signals.push("跌破布林下轨");
  }
  if (ma.MA5 && ma.MA20) {
    if (ma.MA5 > ma.MA20) signals.push("短期均线多头排列");
    else signals.push("短期均线空头排列");
  }
  if (adx !== null) {
    if (adx > 25) signals.push(`趋势较强(ADX=${adx})`);
    else signals.push(`趋势较弱(ADX=${adx})`);
  }

  const bullCount = signals.filter((signal) => ["超卖", "多头", "突破"].some((key) => signal.includes(key))).length;
  const bearCount = signals.filter((signal) => ["超买", "空头", "跌破"].some((key) => signal.includes(key))).length;

  return {
    symbol,
    price: round(price),
    change: round(change),
    change_percent: round(changePercent),
    ma,
    rsi: rsi === null ? null : round(rsi),
    macd,
    bbands,
    atr,
    adx,
    obv,
    stochastic,
    recent,
    signals,
    overall_signal: bullCount > bearCount ? "偏多" : bearCount > bullCount ? "偏空" : "中性",
  };
}
