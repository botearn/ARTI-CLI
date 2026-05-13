# ARTI — AI Investment Research CLI

You have access to the `arti` CLI tool for real-time financial market data powered by OpenBB. All commands support `--json` for structured output.

## Available Commands

### Real-time Quotes
```bash
arti quote AAPL --json              # Single stock
arti quote AAPL NVDA TSLA --json    # Multiple stocks
```
Returns: symbol, name, price, change, change_percent, volume, 52-week range, moving averages.

### Market Overview
```bash
arti market --json                  # Global indices (S&P 500, DJIA, Nasdaq, HSI, SSE, Nikkei, FTSE, DAX)
arti market gainers --json          # Top gainers
arti market losers --json           # Top losers
arti market active --json           # Most active by volume
```

### Technical Analysis
```bash
arti scan AAPL --json
```
Returns: price, MA(5/10/20/60/120/200), RSI(14), MACD(12,26,9), Bollinger Bands(20,2), ATR(14), ADX(14), OBV, Stochastic(14,3,3), signal summary, overall_signal (偏多/偏空/中性).

### Comprehensive Prediction
```bash
arti predict AAPL --json
```
Returns: quote + technical indicators + news + bull/bear signal analysis + support/resistance levels + confidence score.

### News
```bash
arti news AAPL --json               # Company news
arti news --json                    # Global financial news
```

### AI Research Report (requires backend)
```bash
arti research AAPL --json           # 7 AI analysts in parallel
arti research AAPL --agent tony --json  # Single analyst (tony = technical)
```

### Configuration
```bash
arti config list                    # Show config
arti config set api.timeout 60000   # Set timeout
```

## Usage Tips

- Always use `--json` flag when you need to process the output programmatically.
- Stock symbols: US stocks use ticker (AAPL), HK stocks use suffix (0700.HK), China A-shares (000001.SS).
- Crypto symbols: BTCUSD, ETHUSD.
- The `arti scan` command provides the most comprehensive technical analysis.
- The `arti predict` command combines quote + technical + news for a holistic view.
- Data source is OpenBB with yfinance provider (free, no API key needed).
- First call may be slow (~5-10s) due to Python/OpenBB initialization. Subsequent calls are faster.

## Project Structure

- TypeScript CLI + Python (OpenBB) bridge
- Source: `src/` (TypeScript), `scripts/openbb_query.py` (Python)
- Build: `npm run build`, outputs to `dist/`
- Python venv: `.venv/` with openbb installed
