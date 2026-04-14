# ARTI CLI 开发路线图

> 智能投研命令行工具 — 框架完善计划

---

## 当前状态

核心功能已全部实现，进入稳定迭代阶段：
- [x] 12 个 CLI 命令（quote / market / scan / predict / news / research / config / watchlist / insights / watch / export / completion）
- [x] REPL 交互模式（session 状态管理 + 命令别名）
- [x] OpenBB 本地数据源（yfinance，免费无 API Key）
- [x] MCP Server（13 个工具）
- [x] Supabase Edge Functions API 层（research 命令专用）
- [x] 终端格式化工具（format.ts — chalk 涨跌着色、sparkline、置信度条）
- [x] tsup 构建配置

---

## Phase 1：基础设施补全

### 1.1 配置管理（config.ts）
- [x] 配置文件路径：`~/.config/arti/config.json`
- [x] 支持的配置项：
  - `api.baseUrl` — Edge Function 地址（可覆盖默认值）
  - `api.timeout` — 请求超时（默认 30s）
  - `display.market` — 默认市场（US / HK / CN）
  - `display.lang` — 语言（zh / en）
  - `watchlist` — 常用自选股列表
- [x] 新增命令：`arti config set <key> <value>`
- [x] 新增命令：`arti config get <key>`
- [x] 新增命令：`arti config list`
- [x] 新增命令：`arti config reset`

### 1.2 错误处理增强
- [x] 网络超时 → 提示检查网络连接
- [x] DNS 解析失败 → 提示检查网络或代理
- [x] HTTP 401/403 → 提示认证问题
- [x] HTTP 429 → 提示请求过快，稍后重试
- [x] HTTP 500 → 提示服务端异常，建议反馈
- [x] JSON 解析失败 → 提示返回格式异常
- [x] 统一错误展示格式（错误码 + 友好描述 + 建议操作）

### 1.3 API 层超时与重试
- [x] 使用 AbortController 实现请求超时（默认 30s，可通过配置覆盖）
- [x] 关键请求自动重试（最多 2 次，仅对 5xx / 网络错误重试）
- [x] 重试时 spinner 文案更新（"重试中 (1/2)..."）

---

## Phase 2：输出体系

### 2.1 统一输出层（output.ts）
- [x] 抽取输出逻辑：命令层只返回数据，输出层负责渲染
- [x] 根据 `--json` flag 自动选择输出模式
- [x] JSON 模式：结构化输出，适合管道和脚本
- [x] 终端模式：现有的 chalk 美化输出

### 2.2 全局 --json 选项
- [x] 在 program 级别添加 `--json` 全局选项
- [x] quote 命令 JSON 输出
- [x] research 命令 JSON 输出
- [x] scan 命令 JSON 输出
- [x] predict 命令 JSON 输出

---

## Phase 3：发布准备

### 3.1 package.json 完善
- [x] 添加 `files: ["dist"]` 控制发包内容
- [x] 添加 `keywords` 提升 npm 搜索可见性
- [x] 添加 `engines: { node: ">=18" }`
- [x] 添加 `repository` / `homepage` / `license` 字段

### 3.2 .gitignore 补全
- [x] 添加 `.env` / `.env.local`
- [x] 添加 OS 临时文件（.DS_Store 等）
- [x] 添加编辑器配置（.vscode / .idea）

---

## Phase 4：OpenBB 数据源集成

> 通过 OpenBB (v4.7.1) 替代/补充 Supabase Edge Functions，实现本地化金融数据获取
> 安装：`pip install openbb openbb-cli`（已安装于 `.venv/`，Python 虚拟环境）
> 调用入口：`from openbb import obb`

### 4.1 行情数据（替换 stock-quotes Edge Function）

| 能力 | OpenBB 调用 | 对应 ARTI 命令 |
|---|---|---|
| 股票实时报价 | `obb.equity.price.quote('AAPL', provider='yfinance')` | `arti quote AAPL` |
| 股票历史价格 | `obb.equity.price.historical('AAPL', start_date='...', provider='yfinance')` | `arti quote AAPL --history` |
| 股票价格表现 | `obb.equity.price.performance('AAPL', provider='yfinance')` | `arti quote AAPL --perf` |
| 加密货币行情 | `obb.crypto.price.historical('BTCUSD', provider='yfinance')` | `arti quote BTC` |
| 外汇汇率 | `obb.currency.price.historical('EURUSD', provider='yfinance')` | `arti quote EURUSD` |
| 大宗商品 | `obb.commodity.price.historical('CL=F', provider='yfinance')` | `arti quote CL` |
| 指数行情 | `obb.index.price.historical('^GSPC', provider='yfinance')` | `arti quote SPX` |
| ETF 行情 | `obb.etf.historical('SPY', provider='yfinance')` | `arti quote SPY` |
| 涨幅榜 | `obb.equity.discovery.gainers(provider='yfinance')` | `arti scan gainers` |
| 跌幅榜 | `obb.equity.discovery.losers(provider='yfinance')` | `arti scan losers` |
| 活跃榜 | `obb.equity.discovery.active(provider='yfinance')` | `arti scan active` |

### 4.2 基本面研究（增强 stock-research Edge Function）

| 能力 | OpenBB 调用 | 对应 ARTI Agent |
|---|---|---|
| 利润表 | `obb.equity.fundamental.income('AAPL', provider='yfinance')` | clint（基本面） |
| 资产负债表 | `obb.equity.fundamental.balance('AAPL', provider='yfinance')` | clint（基本面） |
| 现金流量表 | `obb.equity.fundamental.cash('AAPL', provider='yfinance')` | clint（基本面） |
| 财务指标 | `obb.equity.fundamental.metrics('AAPL', provider='yfinance')` | clint（基本面） |
| 财务比率 | `obb.equity.fundamental.ratios('AAPL', provider='yfinance')` | clint（基本面） |
| 分红历史 | `obb.equity.fundamental.dividends('AAPL', provider='yfinance')` | sam（收益分析） |
| EPS 历史 | `obb.equity.fundamental.historical_eps('AAPL', provider='yfinance')` | sam（收益分析） |
| 管理层信息 | `obb.equity.fundamental.management('AAPL', provider='yfinance')` | clint（基本面） |
| 分析师预测 | `obb.equity.estimates.consensus('AAPL')` | steve（板块轮动） |
| 目标价 | `obb.equity.estimates.price_target('AAPL')` | steve（板块轮动） |
| SEC 文件 | `obb.equity.fundamental.filings(symbol='AAPL', provider='sec')` | clint（基本面） |
| 财报纪要 | `obb.equity.fundamental.transcript('AAPL', year=2025)` | clint（基本面） |

### 4.3 技术分析（增强 scan-stock Edge Function）

| 指标 | OpenBB 调用 | 对应 ARTI Agent |
|---|---|---|
| RSI | `obb.technical.rsi(data=df)` | tony（技术面） |
| MACD | `obb.technical.macd(data=df)` | tony（技术面） |
| 布林带 | `obb.technical.bbands(data=df)` | tony（技术面） |
| SMA / EMA | `obb.technical.sma(data=df)` / `obb.technical.ema(data=df)` | tony（技术面） |
| ATR | `obb.technical.atr(data=df)` | thor（风控） |
| VWAP | `obb.technical.vwap(data=df)` | tony（技术面） |
| ADX | `obb.technical.adx(data=df)` | tony（技术面） |
| Stochastic | `obb.technical.stoch(data=df)` | tony（技术面） |
| CCI | `obb.technical.cci(data=df)` | tony（技术面） |
| OBV | `obb.technical.obv(data=df)` | tony（技术面） |
| Ichimoku | `obb.technical.ichimoku(data=df)` | tony（技术面） |
| Fibonacci | `obb.technical.fib(data=df)` | tony（技术面） |
| Donchian | `obb.technical.donchian(data=df)` | tony（技术面） |
| Aroon | `obb.technical.aroon(data=df)` | tony（技术面） |
| KC（肯特纳通道） | `obb.technical.kc(data=df)` | tony（技术面） |

> 技术指标需先获取历史价格 DataFrame，再传入 `data=df` 参数

### 4.4 宏观经济（增强 natasha 情报·宏观 Agent）

| 能力 | OpenBB 调用 |
|---|---|
| GDP | `obb.economy.gdp.nominal(provider='oecd', start_date='...')` |
| CPI 通胀 | `obb.economy.cpi(provider='fred')` |
| 失业率 | `obb.economy.unemployment(provider='oecd')` |
| 利率 | `obb.economy.interest_rates(provider='oecd')` |
| 经济日历 | `obb.economy.calendar(provider='tradingeconomics')` |
| FRED 数据搜索 | `obb.economy.fred_search('inflation')` |
| FRED 数据序列 | `obb.economy.fred_series('GDP')` |
| FOMC 文件 | `obb.economy.fomc_documents()` |
| 国债收益率 | `obb.fixedincome.government.treasury_rates(provider='fred')` |
| 信用利差 | `obb.fixedincome.spreads.treasury_averages(provider='fred')` |

### 4.5 持仓与资金流（增强 vision 量化验证 Agent）

| 能力 | OpenBB 调用 |
|---|---|
| 内部人交易 | `obb.equity.ownership.insider_trading('AAPL', provider='sec')` |
| 机构持仓 | `obb.equity.ownership.institutional('AAPL')` |
| 13F 报告 | `obb.equity.ownership.form_13f(symbol='AAPL')` |
| 国会议员交易 | `obb.equity.ownership.government_trades()` |
| 做空量 | `obb.equity.shorts.short_volume(symbol='AAPL')` |
| 做空利率 | `obb.equity.shorts.short_interest(symbol='AAPL')` |
| 暗池交易 | `obb.equity.darkpool.otc(symbol='AAPL')` |

### 4.6 衍生品与 ETF

| 能力 | OpenBB 调用 |
|---|---|
| 期权链 | `obb.derivatives.options.chains('AAPL', provider='yfinance')` |
| 期货历史 | `obb.derivatives.futures.historical('ES=F', provider='yfinance')` |
| ETF 持仓 | `obb.etf.holdings('SPY')` |
| ETF 行业分布 | `obb.etf.sectors('SPY')` |
| ETF 国家分布 | `obb.etf.countries('SPY')` |

### 4.7 计量经济学（增强 vision 量化验证 Agent）

| 能力 | OpenBB 调用 |
|---|---|
| OLS 回归 | `obb.econometrics.ols_regression(data=df, y_column='y', x_columns=['x1','x2'])` |
| 协整检验 | `obb.econometrics.cointegration(data=df, columns=['a','b'])` |
| 因果检验 | `obb.econometrics.causality(data=df, y_column='y', x_column='x')` |
| 单位根检验 | `obb.econometrics.unit_root(data=df, column='price')` |
| 相关矩阵 | `obb.econometrics.correlation_matrix(data=df)` |

### 4.8 新闻资讯

| 能力 | 调用方式 |
|---|---|
| 公司新闻 | `obb.news.company('AAPL', provider='yfinance')` |
| 全球新闻 | `yfinance.Ticker('^GSPC').news`（OpenBB news.world 需付费 API Key，改用 yfinance 直接调用） |

### 免费可用的 Provider（无需 API Key）

| Provider | 覆盖范围 |
|---|---|
| `yfinance` | 股票、加密、外汇、ETF、指数、期权、期货、新闻 |
| `sec` | SEC 文件、公司搜索、13F 持仓、内部人交易 |
| `fred` | 美联储经济数据（GDP、CPI、利率、国债收益率等） |
| `oecd` | OECD 国际经济数据（GDP、失业率、利率等） |
| `ecb` | 欧洲央行汇率 |
| `multpl` | 标普500估值数据 |

### 集成方案

- [x] 新建 `src/openbb.ts` — Python 子进程桥接层，通过 `child_process` 调用 `.venv/bin/python`
- [x] 行情命令优先走 OpenBB 本地数据，Edge Function 作为备选（research 仍用 Edge Function）
- [x] 各 Agent 研报生成时自动拉取对应 OpenBB 数据作为上下文

---

## Phase 5：AI 助手适配（Claude Code + Codex）

> 已完成

### 5.1 Claude Code — MCP Server
- [x] `src/mcp-server.ts` — MCP Server，暴露 13 个金融数据工具
- [x] `.mcp.json` — 项目级 MCP 配置，Claude Code 自动发现
- [x] `CLAUDE.md` — Claude Code 项目指令
- [x] 构建入口：`npm run build` 同时输出 `dist/index.js` 和 `dist/mcp-server.js`
- [x] bin 入口：`arti-mcp` 可全局运行 MCP Server

### MCP 工具清单

| 工具 | 功能 |
|---|---|
| `arti_quote` | 股票实时报价 |
| `arti_historical` | 股票历史价格 |
| `arti_crypto` | 加密货币历史价格 |
| `arti_market` | 全球市场概览 |
| `arti_gainers` | 涨幅榜 |
| `arti_losers` | 跌幅榜 |
| `arti_active` | 活跃榜 |
| `arti_technical` | 技术指标全面扫描 |
| `arti_search` | 搜索股票代码 |
| `arti_news` | 财经新闻 |
| `arti_fundamental` | 基本面数据 |
| `arti_options` | 期权链 |
| `arti_economy` | 宏观经济数据 |

### 5.2 Codex CLI 适配
- [x] `agents.md` — Codex agent 指令（工具说明 + 用法示例）
- [x] `codex.md` — Codex 配置指南
- [x] 所有命令 `--json` 输出（Codex 通过 shell 调用 + JSON 解析）

---

## Phase 6：功能扩展

- [x] `arti watch <symbols>` — 轮询刷新行情（终端 dashboard）
- [x] `arti export <symbol> --format csv` — 导出数据
- [x] Shell 自动补全（`arti completion bash/zsh`）
- [x] REPL 交互模式（`arti` 无参数进入，支持命令别名和 session 状态）
- [x] `arti insights` — 个人投研洞察（HTML 可分享）
- [x] `arti watchlist` — 自选股管理（add / remove / list + 行情展示）
- [ ] `arti login` — 用户认证（如果需要）
- [x] 版本更新检查提示
- [x] MCP Server 增加 fundamental / economy / options 工具

---

## 目标文件结构

```
src/
  index.ts          ← CLI 入口，注册命令 + 全局选项
  mcp-server.ts     ← MCP Server 入口，暴露金融数据工具
  openbb.ts         ← OpenBB Python 桥接层
  config.ts         ← 配置管理（读写 ~/.config/arti/）
  api.ts            ← HTTP 层（Supabase Edge Function，保留用于 research）
  format.ts         ← 终端格式化
  output.ts         ← 统一输出（JSON / 终端 自动切换）
  errors.ts         ← 错误分类与友好提示
  update-check.ts   ← 版本更新检查
  tracker.ts        ← 活动追踪
  commands/
    quote.ts        ← 实时行情（OpenBB）
    market.ts       ← 全球市场概览（OpenBB）
    scan.ts         ← 技术指标扫描（OpenBB）
    predict.ts      ← 综合预测（OpenBB）
    news.ts         ← 财经新闻（OpenBB）
    research.ts     ← AI 多维研报（Edge Function）
    config.ts       ← arti config set/get/list/reset
    watchlist.ts    ← 自选股管理
    insights.ts     ← 个人投研洞察
    watch.ts        ← 实时行情 Dashboard
    export.ts       ← 数据导出（CSV / JSON）
    completion.ts   ← Shell 自动补全脚本生成
  core/
    handler.ts      ← 统一命令处理器
    session.ts      ← 会话状态管理
    repl.ts         ← REPL 交互模式
scripts/
  openbb_query.py   ← Python 端 OpenBB 数据查询
CLAUDE.md           ← Claude Code 项目指令
.mcp.json           ← MCP Server 配置
agents.md           ← Codex CLI agent 指令
codex.md            ← Codex 配置指南
```
