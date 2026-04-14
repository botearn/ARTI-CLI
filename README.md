# ARTI CLI

智能投研命令行工具 — OpenBB 驱动的股票分析终端

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

## 功能

| 命令 | 说明 |
|---|---|
| `arti quote AAPL NVDA` | 实时行情（支持多股、中文搜索） |
| `arti market` | 全球指数概览（美股/亚太/欧洲） |
| `arti market gainers` | 今日涨幅榜 |
| `arti market losers` | 今日跌幅榜 |
| `arti market active` | 今日活跃榜 |
| `arti scan AAPL` | 技术指标扫描（MA/RSI/MACD/布林带/ATR/ADX/KDJ/OBV） |
| `arti predict AAPL` | 综合预测（行情 + 技术面 + 新闻 → 多空研判） |
| `arti history AAPL -d 30` | 历史价格（OHLCV 表格） |
| `arti crypto BTCUSD` | 加密货币历史价格 |
| `arti fundamental AAPL` | 基本面数据（财报 / 估值 / 分红） |
| `arti options AAPL` | 期权链（行权价 / IV / 持仓量） |
| `arti economy treasury` | 宏观经济（国债利率 / FRED 数据） |
| `arti search 苹果` | 搜索股票代码 |
| `arti news AAPL` | 公司新闻 |
| `arti news` | 全球财经新闻 |
| `arti research AAPL` | AI 多维研报（7 位分析师并行，需后端服务） |
| `arti config list` | 查看配置 |

所有命令支持 `--json` 输出结构化 JSON，适合脚本和管道。

## 安装

需要 Node.js >= 18 和 Python >= 3.9。

### Homebrew (macOS / Linux)

```bash
brew tap botearn/arti https://github.com/botearn/homebrew-arti
brew install arti
```

### Shell script

```bash
curl -sSL https://raw.githubusercontent.com/botearn/ARTI-CLI/master/install.sh | sh
```

### Build from source

```bash
git clone https://github.com/botearn/ARTI-CLI.git
cd ARTI-CLI
npm install && npm run build && python3 -m venv .venv && .venv/bin/pip install openbb && npm link
```

安装完成后即可使用 `arti` 命令。

## 架构

```
┌─────────────────────────────────────────────────┐
│  CLI (TypeScript / Commander)                   │
│  src/index.ts → commands/                       │
├─────────────────────────────────────────────────┤
│  桥接层 (src/openbb.ts)                          │
│  child_process → stdin JSON → stdout JSON       │
├─────────────────────────────────────────────────┤
│  数据层 (scripts/openbb_query.py)                │
│  OpenBB SDK → yfinance / SEC / FRED / OECD      │
└─────────────────────────────────────────────────┘
```

**数据流向：** CLI 命令 → TypeScript 桥接层通过 `child_process` 调用 Python 脚本 → Python 脚本调用 OpenBB SDK 获取数据 → JSON 返回 → 终端格式化输出

## 数据源

通过 [OpenBB](https://github.com/OpenBB-finance/OpenBB) 聚合多个金融数据源，以下为免费可用（无需 API Key）：

| Provider | 数据范围 |
|---|---|
| yfinance | 全球股票、加密货币、外汇、ETF、指数、期权、期货、新闻 |
| SEC | SEC 文件、公司搜索、13F 持仓、内部人交易 |
| FRED | 美联储经济数据（GDP、CPI、利率、国债收益率等） |
| OECD | 国际经济数据（GDP、失业率、通胀等） |
| ECB | 欧洲央行汇率 |

## 命令详解

### quote — 实时行情

```bash
arti quote AAPL              # 单只股票
arti quote AAPL NVDA TSLA    # 多只股票
arti quote 0700.HK           # 港股
```

输出包含：价格、涨跌幅、成交量、52 周范围、50 日均线、近期走势 sparkline。

### scan — 技术扫描

```bash
arti scan AAPL
```

计算并展示：
- 均线系统（MA5/10/20/60/120/200）
- RSI(14) + 超买超卖判断
- MACD(12,26,9) DIF/DEA/柱状
- 布林带(20,2) 上轨/中轨/下轨
- ATR(14) 波动率
- ADX(14) 趋势强度
- Stochastic(14,3,3) KDJ
- OBV 能量潮
- 综合信号研判（偏多/偏空/中性）

### predict — 综合预测

```bash
arti predict AAPL
```

整合行情报价 + 全部技术指标 + 公司新闻，生成：
- 方向判断（看多/看空/中性）+ 置信度
- 支撑位 / 压力位
- 多空信号分解
- 分析依据

### market — 市场概览

```bash
arti market            # 全球 10 大指数
arti market gainers    # 涨幅榜 Top 15
arti market losers     # 跌幅榜 Top 15
arti market active     # 活跃榜 Top 15
```

### news — 财经新闻

```bash
arti news AAPL    # 公司新闻
arti news         # 全球财经新闻
```

### config — 配置管理

```bash
arti config list               # 查看所有配置
arti config get api.timeout    # 查看单项
arti config set api.timeout 60000
arti config reset              # 重置为默认
```

配置文件位于 `~/.config/arti/config.json`。

## JSON 模式

所有命令支持 `--json` 输出，方便与其他工具组合：

```bash
arti --json quote AAPL | jq '.quotes[0].last_price'
arti --json scan AAPL | jq '.rsi'
arti --json market gainers | jq '.[0:3]'
```

## 项目结构

```
ARTI-CLI/
├── src/
│   ├── index.ts              # CLI 入口，命令注册
│   ├── openbb.ts             # OpenBB Python 桥接层
│   ├── api.ts                # Supabase Edge Function（research 命令）
│   ├── config.ts             # 配置管理
│   ├── format.ts             # 终端格式化（涨跌着色、sparkline、置信度条）
│   ├── output.ts             # 统一输出层（JSON / 终端切换）
│   ├── errors.ts             # 错误分类与友好提示
│   └── commands/
│       ├── quote.ts          # 实时行情
│       ├── market.ts         # 市场概览 + 涨跌榜
│       ├── scan.ts           # 技术指标扫描
│       ├── predict.ts        # 综合预测
│       ├── news.ts           # 财经新闻
│       ├── research.ts       # AI 多维研报
│       └── config.ts         # 配置管理命令
├── scripts/
│   └── openbb_query.py       # OpenBB 数据查询（15 个命令）
├── package.json
├── tsconfig.json
└── TODO.md                   # 开发路线图
```

## 开发

```bash
# 开发模式（直接运行 TypeScript）
npm run dev -- quote AAPL

# 构建
npm run build

# 运行
node dist/index.js market
```

## License

MIT
