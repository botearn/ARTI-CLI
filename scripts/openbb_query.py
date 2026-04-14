#!/usr/bin/env python3
"""
OpenBB 数据查询桥接脚本
接收 JSON 命令，调用 OpenBB，输出 JSON 结果到 stdout
供 ARTI CLI (TypeScript) 通过 child_process 调用
"""

import sys
import json
import math
import re
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

from openbb import obb

# ── 参数验证 ──

SYMBOL_PATTERN = re.compile(r'^[A-Z0-9.\-^=]{1,20}$', re.IGNORECASE)


def validate_symbol(symbol: str) -> str:
    """验证并规范化股票代码"""
    s = symbol.strip().upper()
    if not SYMBOL_PATTERN.match(s):
        raise ValueError(f"非法 symbol 参数: {repr(symbol)}")
    return s


def validate_limit(limit, default=10, max_val=100) -> int:
    """验证 limit 参数"""
    if limit is None:
        return default
    if not isinstance(limit, int) or not (1 <= limit <= max_val):
        raise ValueError(f"limit 参数超出范围 [1, {max_val}]: {limit}")
    return limit


def validate_days(days, default=60, max_val=3650) -> int:
    """验证 days 参数"""
    if days is None:
        return default
    if not isinstance(days, int) or not (1 <= days <= max_val):
        raise ValueError(f"days 参数超出范围 [1, {max_val}]: {days}")
    return days


def clean_value(v):
    """清理 NaN/Infinity 等 JSON 不支持的值"""
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, dict):
        return {k: clean_value(val) for k, val in v.items()}
    if isinstance(v, list):
        return [clean_value(item) for item in v]
    return v


def quote(params: dict) -> dict:
    """获取股票实时报价"""
    symbol = validate_symbol(params["symbol"])
    provider = params.get("provider", "yfinance")
    r = obb.equity.price.quote(symbol, provider=provider)
    d = r.results[0]
    return {
        "symbol": d.symbol,
        "name": d.name,
        "last_price": d.last_price,
        "open": d.open,
        "high": d.high,
        "low": d.low,
        "prev_close": d.prev_close,
        "volume": d.volume,
        "change": d.change,
        "change_percent": d.change_percent,
        "year_high": d.year_high,
        "year_low": d.year_low,
        "ma_50d": d.ma_50d,
        "ma_200d": d.ma_200d,
        "volume_average": d.volume_average,
        "currency": getattr(d, "currency", None),
    }


def historical(params: dict) -> list:
    """获取历史价格"""
    symbol = validate_symbol(params["symbol"])
    provider = params.get("provider", "yfinance")
    days = validate_days(params.get("days"))
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    end = datetime.now().strftime("%Y-%m-%d")

    r = obb.equity.price.historical(
        symbol, provider=provider, start_date=start, end_date=end
    )
    df = r.to_dataframe()
    records = []
    for idx, row in df.iterrows():
        records.append({
            "date": str(idx)[:10],
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": int(row["volume"]),
        })
    return records


def crypto_quote(params: dict) -> list:
    """获取加密货币历史价格"""
    symbol = validate_symbol(params["symbol"])
    provider = params.get("provider", "yfinance")
    days = validate_days(params.get("days"), default=30)
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    end = datetime.now().strftime("%Y-%m-%d")

    r = obb.crypto.price.historical(
        symbol, provider=provider, start_date=start, end_date=end
    )
    df = r.to_dataframe()
    records = []
    for idx, row in df.iterrows():
        records.append({
            "date": str(idx)[:10],
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]),
        })
    return records


def index_quote(params: dict) -> dict:
    """获取指数报价"""
    symbol = validate_symbol(params["symbol"])
    provider = params.get("provider", "yfinance")

    r = obb.equity.price.historical(
        symbol, provider=provider, start_date=(datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
    )
    df = r.to_dataframe()
    if len(df) == 0:
        raise ValueError(f"symbol {symbol} 无历史数据")
    if len(df) < 2:
        latest = df.iloc[-1]
        return {
            "symbol": symbol,
            "date": str(df.index[-1])[:10],
            "close": float(latest["close"]),
            "change": 0,
            "change_percent": 0,
            "volume": int(latest["volume"]),
        }

    latest = df.iloc[-1]
    prev = df.iloc[-2]
    chg = float(latest["close"] - prev["close"])
    chg_pct = chg / float(prev["close"]) * 100

    return {
        "symbol": symbol,
        "date": str(df.index[-1])[:10],
        "close": float(latest["close"]),
        "open": float(latest["open"]),
        "high": float(latest["high"]),
        "low": float(latest["low"]),
        "change": round(chg, 2),
        "change_percent": round(chg_pct, 2),
        "volume": int(latest["volume"]),
    }


def market_overview(params: dict) -> dict:
    """全球市场概览"""
    indices = {
        "^GSPC": "标普500",
        "^DJI": "道琼斯",
        "^IXIC": "纳斯达克",
        "^RUT": "罗素2000",
        "^VIX": "VIX恐慌指数",
        "^HSI": "恒生指数",
        "000001.SS": "上证指数",
        "^N225": "日经225",
        "^FTSE": "富时100",
        "^GDAXI": "德国DAX",
    }

    def fetch_one(sym, name):
        try:
            data = index_quote({"symbol": sym})
            data["name_zh"] = name
            return data
        except Exception:
            return {"symbol": sym, "name_zh": name, "error": True}

    results_map = {}
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fetch_one, sym, name): sym for sym, name in indices.items()}
        for future in as_completed(futures):
            sym = futures[future]
            results_map[sym] = future.result()

    # 保持原始顺序
    results = [results_map[sym] for sym in indices]
    return {"indices": results}


def _normalize_discovery(df, limit: int) -> list:
    """规范化涨跌/活跃榜数据，统一输出格式"""
    records = []
    for _, row in df.head(limit).iterrows():
        pct = row.get("change_percent") or row.get("percent_change") or 0
        records.append({
            "symbol": str(row.get("symbol", "")),
            "name": str(row.get("name", "")),
            "price": float(row.get("price", 0)) if row.get("price") is not None else None,
            "change_percent": float(pct),
            "volume": int(row.get("volume", 0)) if row.get("volume") is not None else None,
        })
    return records


def gainers(params: dict) -> list:
    """今日涨幅榜"""
    limit = validate_limit(params.get("limit"))
    r = obb.equity.discovery.gainers(provider="yfinance")
    return _normalize_discovery(r.to_dataframe(), limit)


def losers(params: dict) -> list:
    """今日跌幅榜"""
    limit = validate_limit(params.get("limit"))
    r = obb.equity.discovery.losers(provider="yfinance")
    return _normalize_discovery(r.to_dataframe(), limit)


def active(params: dict) -> list:
    """今日活跃榜"""
    limit = validate_limit(params.get("limit"))
    r = obb.equity.discovery.active(provider="yfinance")
    return _normalize_discovery(r.to_dataframe(), limit)


def technical(params: dict) -> dict:
    """技术分析 — 获取价格并计算技术指标"""
    symbol = validate_symbol(params["symbol"])
    provider = params.get("provider", "yfinance")
    days = validate_days(params.get("days"), default=200)
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    r = obb.equity.price.historical(symbol, provider=provider, start_date=start)
    df = r.to_dataframe()

    if len(df) < 30:
        return {"error": f"数据不足: 仅 {len(df)} 条记录"}

    latest = df.iloc[-1]
    prev = df.iloc[-2]
    price = float(latest["close"])
    prev_close = float(prev["close"])
    change = price - prev_close
    change_pct = change / prev_close * 100

    # 均线系统
    ma = {}
    for period in [5, 10, 20, 60, 120, 200]:
        if len(df) >= period:
            ma[f"MA{period}"] = round(float(df["close"].tail(period).mean()), 2)

    # RSI(14)
    rsi_result = obb.technical.rsi(data=df, length=14)
    rsi_df = rsi_result.to_dataframe()
    rsi_val = float(rsi_df["close_RSI_14"].iloc[-1]) if len(rsi_df) > 0 and "close_RSI_14" in rsi_df.columns else None

    # MACD(12,26,9)
    macd_result = obb.technical.macd(data=df, fast=12, slow=26, signal=9)
    macd_df = macd_result.to_dataframe()
    macd_data = None
    if len(macd_df) > 0:
        macd_data = {
            "MACD": round(float(macd_df["close_MACD_12_26_9"].iloc[-1]), 4),
            "signal": round(float(macd_df["close_MACDs_12_26_9"].iloc[-1]), 4),
            "histogram": round(float(macd_df["close_MACDh_12_26_9"].iloc[-1]), 4),
        }

    # 布林带(20,2)
    bb_result = obb.technical.bbands(data=df, length=20, std=2)
    bb_df = bb_result.to_dataframe()
    bbands = None
    if len(bb_df) > 0:
        bbands = {
            "lower": round(float(bb_df["close_BBL_20_2.0"].iloc[-1]), 2),
            "middle": round(float(bb_df["close_BBM_20_2.0"].iloc[-1]), 2),
            "upper": round(float(bb_df["close_BBU_20_2.0"].iloc[-1]), 2),
        }

    # ATR(14)
    atr_result = obb.technical.atr(data=df, length=14)
    atr_df = atr_result.to_dataframe()
    # ATR 列名可能包含 ATRr 或类似后缀，取包含 ATR 的列
    atr_val = None
    if len(atr_df) > 0:
        atr_cols = [c for c in atr_df.columns if "ATR" in c.upper() and c not in ("open", "high", "low", "close", "volume", "dividend")]
        if atr_cols:
            atr_val = round(float(atr_df[atr_cols[0]].iloc[-1]), 2)

    # ADX(14)
    adx_result = obb.technical.adx(data=df, length=14)
    adx_df = adx_result.to_dataframe()
    adx_val = round(float(adx_df["ADX_14"].iloc[-1]), 2) if len(adx_df) > 0 and "ADX_14" in adx_df.columns else None

    # OBV
    obv_result = obb.technical.obv(data=df)
    obv_df = obv_result.to_dataframe()
    obv_val = int(obv_df["OBV"].iloc[-1]) if len(obv_df) > 0 and "OBV" in obv_df.columns else None

    # Stochastic(14,3,3)
    stoch_result = obb.technical.stoch(data=df, fast_k_period=14, slow_d_period=3, slow_k_period=3)
    stoch_df = stoch_result.to_dataframe()
    stoch_data = None
    if len(stoch_df) > 0:
        stoch_data = {
            "K": round(float(stoch_df["STOCHk_14_3_3"].iloc[-1]), 2) if "STOCHk_14_3_3" in stoch_df.columns else None,
            "D": round(float(stoch_df["STOCHd_14_3_3"].iloc[-1]), 2) if "STOCHd_14_3_3" in stoch_df.columns else None,
        }

    # 近期价格（最近 5 个交易日）
    recent = []
    for i in range(-5, 0):
        if abs(i) <= len(df):
            row = df.iloc[i]
            recent.append({
                "date": str(df.index[i])[:10],
                "close": round(float(row["close"]), 2),
                "volume": int(row["volume"]),
            })

    # 综合信号判断
    signals = []
    if rsi_val is not None:
        if rsi_val > 70:
            signals.append("RSI超买")
        elif rsi_val < 30:
            signals.append("RSI超卖")
    if macd_data:
        if macd_data["histogram"] > 0:
            signals.append("MACD多头")
        else:
            signals.append("MACD空头")
    if bbands:
        if price > bbands["upper"]:
            signals.append("突破布林上轨")
        elif price < bbands["lower"]:
            signals.append("跌破布林下轨")
    if ma.get("MA5") and ma.get("MA20"):
        if ma["MA5"] > ma["MA20"]:
            signals.append("短期均线多头排列")
        else:
            signals.append("短期均线空头排列")
    if adx_val is not None:
        if adx_val > 25:
            signals.append(f"趋势较强(ADX={adx_val})")
        else:
            signals.append(f"趋势较弱(ADX={adx_val})")

    bull_count = sum(1 for s in signals if any(k in s for k in ["超卖", "多头", "突破"]))
    bear_count = sum(1 for s in signals if any(k in s for k in ["超买", "空头", "跌破"]))

    if bull_count > bear_count:
        overall = "偏多"
    elif bear_count > bull_count:
        overall = "偏空"
    else:
        overall = "中性"

    return {
        "symbol": symbol,
        "price": round(price, 2),
        "change": round(change, 2),
        "change_percent": round(change_pct, 2),
        "ma": ma,
        "rsi": round(rsi_val, 2) if rsi_val is not None else None,
        "macd": macd_data,
        "bbands": bbands,
        "atr": atr_val,
        "adx": adx_val,
        "obv": obv_val,
        "stochastic": stoch_data,
        "recent": recent,
        "signals": signals,
        "overall_signal": overall,
    }


def fundamental(params: dict) -> dict:
    """基本面数据"""
    symbol = validate_symbol(params["symbol"])
    provider = params.get("provider", "yfinance")
    fields = params.get("fields", ["income", "balance", "metrics"])

    result = {}

    if "income" in fields:
        try:
            r = obb.equity.fundamental.income(symbol, provider=provider, limit=4)
            df = r.to_dataframe()
            result["income"] = df.to_dict(orient="records")
        except Exception as e:
            result["income_error"] = str(e)[:100]

    if "balance" in fields:
        try:
            r = obb.equity.fundamental.balance(symbol, provider=provider, limit=4)
            df = r.to_dataframe()
            result["balance"] = df.to_dict(orient="records")
        except Exception as e:
            result["balance_error"] = str(e)[:100]

    if "metrics" in fields:
        try:
            r = obb.equity.fundamental.metrics(symbol, provider=provider)
            d = r.results[0]
            result["metrics"] = {k: v for k, v in d.__dict__.items() if not k.startswith("_")}
        except Exception as e:
            result["metrics_error"] = str(e)[:100]

    if "dividends" in fields:
        try:
            r = obb.equity.fundamental.dividends(symbol, provider=provider)
            df = r.to_dataframe()
            result["dividends"] = df.head(10).to_dict(orient="records")
        except Exception as e:
            result["dividends_error"] = str(e)[:100]

    return result


def search(params: dict) -> list:
    """搜索股票"""
    query = params["query"]
    provider = params.get("provider", "sec")
    r = obb.equity.search(query, provider=provider)
    df = r.to_dataframe()
    return df.head(params.get("limit", 10)).to_dict(orient="records")


def news_company(params: dict) -> list:
    """公司新闻"""
    symbol = validate_symbol(params["symbol"])
    provider = params.get("provider", "yfinance")
    limit = validate_limit(params.get("limit"), default=15)
    r = obb.news.company(symbol, provider=provider, limit=limit)
    df = r.to_dataframe()
    records = []
    for _, row in df.iterrows():
        records.append({
            "date": str(row.get("date", ""))[:19],
            "title": row.get("title", ""),
            "url": row.get("url", ""),
            "source": row.get("images", {}).get("source", "") if isinstance(row.get("images"), dict) else "",
        })
    # yfinance provider 可能忽略 limit 参数，手动截断
    return records[:limit]


def news_world(params: dict) -> list:
    """全球新闻 — 通过 yfinance 获取主要指数相关新闻"""
    import yfinance as yf
    limit = validate_limit(params.get("limit"), default=15)
    ticker = yf.Ticker("^GSPC")
    raw = ticker.news or []
    records = []
    for item in raw[:limit]:
        content = item.get("content", {})
        url_info = content.get("canonicalUrl", {})
        provider = content.get("provider", {})
        records.append({
            "date": str(content.get("pubDate", ""))[:19],
            "title": content.get("title", ""),
            "url": url_info.get("url", ""),
            "source": provider.get("displayName", ""),
        })
    return records


def options_chain(params: dict) -> list:
    """期权链"""
    symbol = validate_symbol(params["symbol"])
    provider = params.get("provider", "yfinance")
    r = obb.derivatives.options.chains(symbol, provider=provider)
    df = r.to_dataframe()
    return df.head(params.get("limit", 20)).to_dict(orient="records")


def economy_data(params: dict) -> dict:
    """宏观经济数据"""
    indicator = params["indicator"]
    result = {}

    if indicator == "fred_series":
        series_id = params["series_id"]
        r = obb.economy.fred_series(series_id)
        df = r.to_dataframe()
        result["data"] = df.tail(params.get("limit", 20)).to_dict(orient="records")

    elif indicator == "fred_search":
        query = params["query"]
        r = obb.economy.fred_search(query)
        df = r.to_dataframe()
        result["data"] = df.head(params.get("limit", 10)).to_dict(orient="records")

    elif indicator == "treasury_rates":
        r = obb.fixedincome.government.treasury_rates(provider="federal_reserve")
        df = r.to_dataframe()
        result["data"] = df.tail(params.get("limit", 5)).to_dict(orient="records")

    return result


# ── 命令路由 ──

COMMANDS = {
    "quote": quote,
    "historical": historical,
    "crypto": crypto_quote,
    "index": index_quote,
    "market": market_overview,
    "gainers": gainers,
    "losers": losers,
    "active": active,
    "technical": technical,
    "fundamental": fundamental,
    "search": search,
    "news_company": news_company,
    "news_world": news_world,
    "options": options_chain,
    "economy": economy_data,
}


def main():
    try:
        raw = sys.stdin.read()
        req = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"JSON 解析失败: {e}"}))
        sys.exit(1)

    cmd = req.get("command")
    params = req.get("params", {})

    if cmd not in COMMANDS:
        print(json.dumps({"error": f"未知命令: {cmd}", "available": list(COMMANDS.keys())}))
        sys.exit(1)

    try:
        result = COMMANDS[cmd](params)
        print(json.dumps({"ok": True, "data": clean_value(result)}, default=str, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
