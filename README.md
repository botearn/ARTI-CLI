# ARTI CLI

智能投研命令行工具 — OpenBB 驱动的股票分析终端 + MCP Server

```
$ arti market

  全球市场概览
──────────────────────────────────────────────────

  美股
    标普500            6,816.89        -7.77 -0.11%
    道琼斯             47,916.57      -269.23 -0.56%
    纳斯达克            22,902.89       +80.47 +0.35%

  亚太
    恒生指数            25,660.85      -232.69 -0.90%
    上证指数             3,988.56        +2.33 +0.06%
    日经225           56,502.77      -421.34 -0.74%
```

## Public Beta

当前仓库适合以公开 beta / preview 的方式发布。

- 开箱即可用：`quote`、`market`、`history`、`scan`、`predict`、`news`、`search`、`watchlist`、`watch`、`fundamental`、`options`、`economy`、`crypto`
- 主产品主路径已对齐到三档：`quick-scan`、`full`、`deep`
- 公开安装默认不需要 `arti-data`、Supabase、数据库或额外 API key（`economy fred/search` 除外）
- `research` 不是纯本地能力，默认公开安装不保证可用，需要单独接入后端 orchestrator
- `arti-data hybrid` 是高级 / 内部增强链路，主要用于 A 股技术面数据增强，不是首次体验必需项

## Quick Start

### 1. 安装

需要 Node.js >= 18 和 Python >= 3.9。

#### Homebrew (macOS / Linux)

```bash
brew tap botearn/arti https://github.com/botearn/homebrew-arti
brew install arti
```

#### Shell script

```bash
curl -sSL https://raw.githubusercontent.com/botearn/ARTI-CLI/master/install.sh | sh
```

#### Build from source

```bash
git clone https://github.com/botearn/ARTI-CLI.git
cd ARTI-CLI
npm install && npm run build
python3 -m venv .venv && .venv/bin/pip install openbb
npm link
```

安装完成后即可使用 `arti` 命令。无参数运行 `arti` 会进入交互式 REPL 终端。

### 2. 首次体验

```bash
arti quick-scan AAPL
arti full NVDA
arti deep TSLA
```

如果你只想体验公开基础能力，也可以用：

```bash
arti quote AAPL
arti market
arti scan AAPL
arti history AAPL -d 30
arti predict NVDA
```

`quick-scan` 默认走本地 OpenBB + yfinance 免费链路；`full` / `deep` 需要单独 research 后端。

## 主产品三档

| 命令 | 对应主产品能力 | 说明 |
|---|---|---|
| `arti quick-scan AAPL` | Quick Scan | 快速研判，整合行情、技术面、新闻 |
| `arti full AAPL` | Full 全景研报 | 多分析师 Layer 1 全景报告 |
| `arti deep AAPL` | Deep 深度研报 | 三层级研报，含大师辩论和综合裁定 |

### 3. 可选环境变量

复制 [.env.example](/Users/nicolechen/ARTI-CLI/.env.example) 按需配置。对公开用户来说，通常只需要关心：

```bash
export ARTI_API_URL=https://your-research-backend
export ARTI_TIMEOUT=30000
export ARTI_AUTH_TOKEN=your-access-token
```

如果你不打算启用 `arti research` 或内部 hybrid 数据源，这一步可以跳过。

### 4. 登录

CLI 现已支持用户登录态。当前第一版采用 access token 登录：

```bash
arti login --token <your-access-token>
arti whoami
arti logout
```

登录后，CLI 调用后端 Edge Functions / orchestrator 时会自动附带 `Authorization: Bearer <token>`。

## 功能一览

| 命令 | 说明 | 公开可用性 | 计费 / 限制 |
|---|---|---|---|
| `arti quote AAPL NVDA` | 实时行情（支持多股、港股、中文名搜索） | 公开可用 | `1 Credit` / 次 |
| `arti market` | 全球指数概览（美股 / 亚太 / 欧洲） | 公开可用 | `1 Credit` / 次 |
| `arti market gainers` | 今日涨幅榜 | 公开可用 | `1 Credit` / 次 |
| `arti market losers` | 今日跌幅榜 | 公开可用 | `1 Credit` / 次 |
| `arti market active` | 今日活跃榜 | 公开可用 | `1 Credit` / 次 |
| `arti quick-scan AAPL` | 主产品 Quick Scan（行情 + 技术面 + 新闻） | 公开可用 | `5 Credits` / 次 |
| `arti full AAPL` | 主产品 Full 全景研报（Layer 1） | 高级功能，需单独后端 | `30 Credits` / 次 |
| `arti deep AAPL` | 主产品 Deep 深度研报（三层级） | 高级功能，需单独后端 | `100 Credits` / 次 |
| `arti scan AAPL` | 技术指标扫描（MA / RSI / MACD / 布林带 / ATR / ADX / KDJ / OBV） | 公开可用 | `5 Credits` / 次 |
| `arti predict AAPL` | 综合预测（行情 + 技术面 + 新闻 → 多空研判） | 公开可用 | `5 Credits` / 次 |
| `arti history AAPL -d 30` | 历史价格（OHLCV 表格） | 公开可用 | `1 Credit` / 次 |
| `arti crypto BTCUSD` | 加密货币历史价格 | 公开可用 | 当前未接入 Credit 扣费 |
| `arti fundamental AAPL` | 基本面数据（财报 / 估值 / 分红） | 公开可用 | 当前未接入 Credit 扣费 |
| `arti options AAPL` | 期权链（行权价 / IV / 持仓量） | 公开可用 | 当前未接入 Credit 扣费 |
| `arti economy treasury` | 宏观经济（国债利率 / FRED 数据） | 公开可用 | 当前未接入 Credit 扣费 |
| `arti search 苹果` | 搜索股票代码（模糊匹配） | 公开可用 | `1 Credit` / 次 |
| `arti news AAPL` | 公司新闻 | 公开可用 | `1 Credit` / 次 |
| `arti news` | 全球财经新闻 | 公开可用 | `1 Credit` / 次 |
| `arti research AAPL` | AI 三层级研报（8 位分析师 → 大师辩论 → 综合裁定） | 高级功能，需单独后端 | `30 / 100 Credits` |
| `arti watchlist` | 查看自选股行情 | 公开可用 | 查看行情时 `1 Credit` / 次 |
| `arti watchlist add AAPL` | 添加 / 移除自选股 | 公开可用 | 受套餐自选上限限制 |
| `arti watch AAPL NVDA` | 实时行情 Dashboard（自动轮询，Ctrl+C 退出） | 公开可用 | 启动时 `1 Credit` |
| `arti export AAPL -f csv` | 导出历史数据到 CSV / JSON 文件 | 公开可用 | 当前未接入 Credit 扣费 |
| `arti insights` | 个人投研洞察报告（HTML 可分享） | 公开可用 | 当前未接入 Credit 扣费 |
| `arti credits` | 查看余额、套餐与权益 | 公开可用 | 不扣费 |
| `arti completion zsh` | 生成 Shell 自动补全脚本 | 公开可用 | 不扣费 |
| `arti config list` | 查看 / 修改配置 | 公开可用 | 不扣费 |

所有命令支持 `--json` 输出结构化 JSON，适合脚本和管道。

## Credit 计费

- 套餐与主产品对齐：`free` / `basic` / `pro` / `flagship`
- `Free` 新用户首月默认 400 Credits，常规月配额 100 Credits
- 消耗规则：普通查询 `1`、快速扫描 `5`、全景报告 `30`、深度报告 `100`
- 自选股上限按套餐限制：`1 / 5 / 20 / 无限`
- `arti full`、`arti research --agent ...` 或 `arti research -m panorama` 记作全景报告 `30 Credits`
- `arti deep`、`arti research` 或 `arti research -m deep` 记作深度报告 `100 Credits`
- 可用 `arti credits` 查看余额与权益；本地联调可用 `arti credits --set-plan pro` 切换模拟套餐
- 下载体验、升级提示与真实付费边界见 [BILLING_FLOW.md](/Users/nicolechen/ARTI-CLI/BILLING_FLOW.md)

## 两种使用模式

### CLI 模式

直接传入命令参数，适合脚本和管道：

```bash
arti quote AAPL
arti --json market gainers | jq '.[0:3]'
```

### REPL 交互模式

无参数运行 `arti` 进入金融终端，支持命令补全、历史记录、连续查询：

```
$ arti

   █████╗ ██████╗ ████████╗██╗
  ██╔══██╗██╔══██╗╚══██╔══╝██║
  ███████║██████╔╝   ██║   ██║
  ██╔══██║██╔══██╗   ██║   ██║
  ██║  ██║██║  ██║   ██║   ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝
  智能投研终端 v0.2.0 — 输入 help 查看命令

arti> q AAPL          # 快捷别名
arti> m gainers -l 5  # 涨幅榜前 5
arti> s NVDA          # 技术扫描
arti> help            # 查看所有命令
```

REPL 命令别名：

| 别名 | 命令 | 别名 | 命令 |
|---|---|---|---|
| `q` | quote | `n` | news |
| `m` | market | `r` | research |
| `s` | scan | `wl` | watchlist |
| `p` | predict | `w` | watch |
| `i` | insights | `exp` | export |
| `hist` | history | `fund` | fundamental |
| `cr` | crypto | `opt` | options |
| `eco` | economy | `find` | search |

## MCP Server

ARTI 同时提供 MCP Server，供 Claude Code、Claude Desktop 等 AI 助手直接调用金融数据。

### 启动

```bash
# 开发模式
npm run dev:mcp

# 生产模式
node dist/mcp-server.js
```

### 配置 Claude Code

在 `~/.claude/settings.json` 或项目 `.mcp.json` 中添加：

```json
{
  "mcpServers": {
    "arti": {
      "command": "node",
      "args": ["/path/to/ARTI-CLI/dist/mcp-server.js"]
    }
  }
}
```

### 可用工具

| 工具 | 功能 | 参数 |
|---|---|---|
| `arti_quote` | 股票实时报价 | `symbol` |
| `arti_historical` | 股票历史价格 | `symbol`, `days?` |
| `arti_crypto` | 加密货币历史价格 | `symbol`, `days?` |
| `arti_market` | 全球市场概览（主要指数） | 无 |
| `arti_gainers` | 今日涨幅榜 | `limit?` |
| `arti_losers` | 今日跌幅榜 | `limit?` |
| `arti_active` | 今日活跃榜 | `limit?` |
| `arti_technical` | 技术指标全面扫描 | `symbol` |
| `arti_search` | 搜索股票代码 | `query`, `limit?` |
| `arti_news` | 财经新闻 | `symbol?`, `limit?` |
| `arti_fundamental` | 基本面数据 | `symbol`, `fields?` |
| `arti_options` | 期权链 | `symbol`, `limit?` |
| `arti_economy` | 宏观经济数据 | `indicator`, `series_id?`, `query?`, `limit?` |

## 命令详解

### quote — 实时行情

```bash
arti quote AAPL              # 单只股票
arti quote AAPL NVDA TSLA    # 多只股票
arti quote 0700.HK           # 港股
arti quote 腾讯              # 中文名搜索（自动解析为股票代码）
```

输出包含：当前价格、涨跌额/涨跌幅、成交量、52 周范围、50 日均线、近期走势 sparkline。

计费：每次调用扣 `1 Credit`。

### scan — 技术扫描

```bash
arti scan AAPL
arti scan NVDA --json        # JSON 输出，适合脚本
```

计算并展示：
- **均线系统** — MA5 / 10 / 20 / 60 / 120 / 200，多空排列判断
- **RSI(14)** — 超买（>70）/ 超卖（<30）信号
- **MACD(12,26,9)** — DIF / DEA / 柱状，金叉死叉判断
- **布林带(20,2)** — 上轨 / 中轨 / 下轨，突破信号
- **ATR(14)** — 波动率水平
- **ADX(14)** — 趋势强度（>25 为强趋势）
- **Stochastic(14,3,3)** — KDJ 超买超卖
- **OBV** — 能量潮，量价配合判断
- **综合信号** — 偏多 / 偏空 / 中性研判

计费：每次调用扣 `5 Credits`。

### predict — 综合预测

```bash
arti predict AAPL
arti predict TSLA --json
```

整合行情报价 + 全部技术指标 + 公司新闻，生成：
- 方向判断（看多 / 看空 / 中性）+ 置信度
- 支撑位 / 压力位
- 多空信号分解
- 分析依据

计费：每次调用扣 `5 Credits`。

### market — 市场概览

```bash
arti market               # 全球 10 大指数
arti market gainers       # 涨幅榜 Top 15
arti market losers        # 跌幅榜 Top 15
arti market active        # 活跃榜 Top 15
arti market gainers -l 5  # 只看前 5 名
```

计费：每次调用扣 `1 Credit`，包含 `gainers / losers / active` 子命令。

### history — 历史价格

```bash
arti history AAPL            # 默认 60 天 OHLCV 表格
arti history NVDA -d 30      # 最近 30 天
```

计费：每次调用扣 `1 Credit`。

### crypto — 加密货币

```bash
arti crypto BTCUSD           # 比特币 30 天
arti crypto ETHUSD -d 7      # 以太坊 7 天
```

### fundamental — 基本面

```bash
arti fundamental AAPL                          # 利润表 + 资产负债 + 估值
arti fundamental NVDA --fields metrics         # 仅估值指标
arti fundamental TSLA --fields income,dividends
```

支持的 fields：`income`（利润表）、`balance`（资产负债表）、`metrics`（估值指标）、`dividends`（分红历史）。

### options — 期权链

```bash
arti options AAPL              # 默认 20 条
arti options NVDA -l 10        # 前 10 条
```

### economy — 宏观经济

```bash
arti economy treasury          # 美国国债收益率曲线
arti economy fred GDP          # FRED 数据系列（需 API Key）
arti economy fred UNRATE       # 失业率
arti economy search CPI        # 搜索 FRED 数据系列
```

### search — 搜索股票

```bash
arti search apple              # 搜索 Apple 相关股票
arti search 腾讯               # 中文搜索
arti search bank -l 20         # 返回 20 条
```

计费：每次调用扣 `1 Credit`。

### news — 财经新闻

```bash
arti news                # 全球财经新闻
arti news AAPL           # 公司新闻
arti news AAPL -l 5      # 只看 5 条
```

计费：每次调用扣 `1 Credit`。

### research — AI 三层级研报

如果你只是按主产品能力使用，优先使用：

```bash
arti full AAPL
arti deep AAPL
```

`research` 更适合作为底层兼容入口或调试入口。

```bash
arti research AAPL                     # 完整三层级研报
arti research NVDA -a tony             # 仅 Tony（技术面）快速分析
arti research TSLA -m panorama         # 仅 Layer 1，跳过大师辩论
arti research AAPL -m deep -f          # 深度研报 + 完整输出
```

三层结构：
- **Layer 1** — 8 位分析师并行分析：Natasha（情报宏观）、Steve（板块轮动）、Tony（技术面）、Thor（风控）、Clint（基本面）、Sam（收益分析）、Vision（量化验证）、Wanda（组合策略）
- **Layer 2** — 投资大师圆桌辩论（动态路由）：巴菲特、林奇、马克斯、索罗斯、达里奥、德鲁肯米勒、段永平
- **Layer 3** — 综合裁定（多空联盟 + 分歧点 + 失败信号）

公开 beta 说明：

- `research` 默认不是纯本地能力，公开安装不保证直接可用
- 需要可访问的后端 `api.baseUrl`，当前默认协议是 Supabase Edge Function / orchestrator SSE
- 如果没有单独部署 research 后端，建议先使用 `quote`、`scan`、`predict`、`history` 作为公开体验主路径

计费：
- `arti deep AAPL`、`arti research AAPL` 或 `arti research -m deep` 默认扣 `100 Credits`
- `arti full AAPL`、`arti research NVDA -a tony` 或 `arti research -m panorama` 扣 `30 Credits`

### watchlist — 自选股管理

```bash
arti watchlist               # 查看自选股行情
arti watchlist add AAPL NVDA # 添加到自选
arti watchlist remove TSLA   # 从自选移除
arti watchlist list          # 列出自选股代码
```

套餐限制：
- `free` 最多 `1` 支
- `basic` 最多 `5` 支
- `pro` 最多 `20` 支
- `flagship` 不限

`arti watchlist` 查看自选股行情时会复用 `quote`，因此会扣 `1 Credit`；`add/remove/list` 本身不扣费。

### watch — 实时行情 Dashboard

```bash
arti watch AAPL NVDA TSLA    # 监控三只股票（默认 15 秒刷新）
arti watch AAPL -i 10        # 10 秒刷新
# 按 Ctrl+C 退出
```

计费：启动 Dashboard 时扣 `1 Credit`；后续轮询刷新当前不重复扣费。

### export — 导出数据

```bash
arti export AAPL                        # 导出 60 天 CSV
arti export NVDA -f json -d 90          # 导出 90 天 JSON
arti export TSLA -o ~/data/tsla.csv     # 指定输出路径
```

当前未接入 Credit 扣费。

### credits — Credits 与套餐

```bash
arti credits
arti credits --set-plan pro
arti credits --json
```

用途：
- 查看当前余额、月度配额、rollover、自选上限和套餐权益
- 本地联调时切换模拟套餐：`free | basic | pro | flagship`

### config — 配置管理

```bash
arti config list               # 查看所有配置
arti config get api.timeout    # 查看单项
arti config set api.timeout 60000
arti config reset              # 重置为默认
```

配置文件位于 `~/.config/arti/config.json`。

常见配置：

- `api.baseUrl`：`arti research` 使用的后端地址
- `api.timeout`：后端请求超时
- `data.provider`：`openbb | arti-data | hybrid`
- `data.artiDataBaseUrl` / `data.artiDataInternalKey`：仅高级 / 内部 hybrid 链路需要

也可通过环境变量覆盖配置文件，示例见 [.env.example](/Users/nicolechen/ARTI-CLI/.env.example)。

### completion — Shell 补全

```bash
arti completion bash >> ~/.bashrc
arti completion zsh >> ~/.zshrc
```

## JSON 模式

所有命令支持 `--json` 输出，方便与其他工具组合：

```bash
arti --json quote AAPL | jq '.quotes[0].last_price'
arti --json scan AAPL | jq '.rsi'
arti --json market gainers | jq '.[0:3]'
arti --json news AAPL | jq '.[].title'
```

## 架构

```
┌─────────────────────────────────────────────────┐
│  CLI / REPL (TypeScript)                        │
│  src/index.ts → commands/ + core/repl.ts        │
├─────────────────────────────────────────────────┤
│  MCP Server (TypeScript)                        │
│  src/mcp-server.ts → 13 个金融数据工具           │
├─────────────────────────────────────────────────┤
│  桥接层 (src/openbb.ts)                          │
│  child_process → stdin JSON → stdout JSON       │
├─────────────────────────────────────────────────┤
│  数据层 (scripts/openbb_query.py)                │
│  OpenBB SDK → yfinance / SEC / FRED / OECD      │
└─────────────────────────────────────────────────┘
```

**数据流向：** CLI 命令 → TypeScript 桥接层通过 `child_process` 调用 Python 脚本 → Python 脚本调用 OpenBB SDK 获取数据 → JSON 返回 → 终端格式化输出（涨红跌绿）

## 数据源

通过 [OpenBB](https://github.com/OpenBB-finance/OpenBB) 聚合多个金融数据源：

| Provider | 数据范围 | API Key |
|---|---|---|
| yfinance | 全球股票、加密货币、外汇、ETF、指数、期权、期货、新闻 | 不需要 |
| SEC | SEC 文件、公司搜索、13F 持仓、内部人交易 | 不需要 |
| Federal Reserve | 国债收益率 (`arti economy treasury`) | 不需要 |
| FRED | 美联储经济数据 (`arti economy fred/search`) | **需要**（免费） |
| OECD | 国际经济数据（GDP、失业率、通胀等） | 不需要 |
| ECB | 欧洲央行汇率 | 不需要 |

> **FRED API Key 配置：** `arti economy fred` 和 `arti economy search` 需要 FRED API Key。前往 [https://fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html) 免费注册，然后配置：
> ```bash
> # 方式一：环境变量
> export OPENBB_fred_api_key=YOUR_KEY
>
> # 方式二：写入 OpenBB 配置
> echo '{"credentials":{"fred_api_key":"YOUR_KEY"}}' > ~/.openbb_platform/user_settings.json
> ```
> 其他所有命令（quote、market、scan、history、crypto、options 等）均无需 API Key。

## Internal / Advanced: arti-data Hybrid 数据源

这部分不是公开用户首次安装的必需项。当前主要用于 A 股技术面增强和内部链路对齐。

- 当前第一步已接入：`history`
- 当前第二步已接入：A 股 `scan`
- 当前第三步已接入：A 股 `predict` 的技术面部分
- 当前第四步已接入：A 股 `research` 的技术面上下文增强
- 仅 A 股 `history` 会优先尝试 `arti-data`
- A 股 `scan` 会优先使用 `arti-data` 日线，并在 CLI 内计算技术指标
- A 股 `predict` 会复用同一套 hybrid 技术面链路
- A 股 `research` 会把 hybrid 技术面摘要拼进传给 agent/orchestrator 的 `stockData`
- 其他市场或 `arti-data` 不可用时，会自动 fallback 到现有 OpenBB/yfinance 链路

高级环境变量：

```bash
export ARTI_DATA_PROVIDER=hybrid
export ARTI_DATA_API_URL=https://your-arti-data-host
export ARTI_DATA_INTERNAL_KEY=your-internal-key
export ARTI_DATA_TIMEOUT=15000
```

高级配置项：

- `data.provider`：`openbb | arti-data | hybrid`
- `data.artiDataBaseUrl`
- `data.artiDataInternalKey`
- `data.artiDataTimeout`

实现细节和接入计划见 [ARTI_DATA_INTEGRATION_PLAN.md](/Users/nicolechen/ARTI-CLI/ARTI_DATA_INTEGRATION_PLAN.md)。

## 项目结构

```
ARTI-CLI/
├── src/
│   ├── index.ts              # CLI 入口，Commander 命令注册 + REPL 声明
│   ├── mcp-server.ts         # MCP Server 入口（stdio 传输）
│   ├── openbb.ts             # OpenBB Python 桥接层（child_process，120s 超时）
│   ├── api.ts                # Supabase Edge Function（research 命令后端）
│   ├── config.ts             # 配置管理（~/.config/arti/config.json）
│   ├── format.ts             # 终端格式化（涨跌着色、sparkline、置信度条）
│   ├── output.ts             # 统一输出层（JSON / 终端切换）
│   ├── errors.ts             # 错误分类与友好提示
│   ├── tracker.ts            # 使用追踪
│   ├── update-check.ts       # 版本更新检查（静默、不阻塞）
│   ├── core/
│   │   ├── repl.ts           # REPL 交互模式（补全、历史、命令路由）
│   │   ├── registry.ts       # 统一命令注册表（parseArgs 声明式参数解析）
│   │   ├── handler.ts        # 统一命令处理器（spinner + try-catch）
│   │   └── session.ts        # 会话管理
│   └── commands/
│       ├── quote.ts          # 实时行情
│       ├── market.ts         # 市场概览 + 涨跌榜
│       ├── scan.ts           # 技术指标扫描
│       ├── predict.ts        # 综合预测
│       ├── history.ts        # 历史价格
│       ├── crypto.ts         # 加密货币
│       ├── fundamental.ts    # 基本面数据
│       ├── options.ts        # 期权链
│       ├── economy.ts        # 宏观经济
│       ├── search.ts         # 股票搜索
│       ├── news.ts           # 财经新闻
│       ├── research.ts       # AI 三层级研报
│       ├── watchlist.ts      # 自选股管理
│       ├── watch.ts          # 实时行情 Dashboard
│       ├── export.ts         # 数据导出
│       ├── insights.ts       # 投研洞察
│       ├── completion.ts     # Shell 补全脚本生成
│       └── config.ts         # 配置管理命令
├── scripts/
│   └── openbb_query.py       # OpenBB 数据查询脚本
├── package.json
├── tsconfig.json
└── CLAUDE.md                 # AI 助手项目说明
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式（直接运行 TypeScript，无需编译）
npm run dev -- quote AAPL
npm run dev:mcp               # 开发模式启动 MCP Server

# 构建
npm run build

# 运行构建产物
node dist/index.js market
node dist/mcp-server.js       # 启动 MCP Server

# 测试
npm test                       # 运行测试
npm run test:watch             # 监听模式
```

## 技术栈

- **运行时** — Node.js >= 18 (ESM)
- **语言** — TypeScript 5.6+, Python 3.9+
- **CLI 框架** — [Commander.js](https://github.com/tj/commander.js)
- **MCP** — [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- **数据引擎** — [OpenBB](https://github.com/OpenBB-finance/OpenBB)（yfinance / SEC / FRED / OECD）
- **构建** — [tsup](https://github.com/egoist/tsup)（ESM, 带 .d.ts）
- **测试** — [Vitest](https://vitest.dev)
- **终端** — [chalk](https://github.com/chalk/chalk) + [ora](https://github.com/sindresorhus/ora)

## 文档

项目文档位于 `docs/` 目录：

- [agents.md](docs/agents.md) — AI 分析师系统架构与角色说明
- [ARTI_DATA_INTEGRATION_PLAN.md](docs/ARTI_DATA_INTEGRATION_PLAN.md) — arti-data 高级数据源接入计划
- [BILLING_FLOW.md](docs/BILLING_FLOW.md) — Credit 计费流程、套餐对比与升级引导
- [CLI_FEATURES.md](docs/CLI_FEATURES.md) — CLI 功能清单与开发进度
- [codex.md](docs/codex.md) — Codex 集成说明

## License

MIT
