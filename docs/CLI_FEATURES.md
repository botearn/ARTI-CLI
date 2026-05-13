# ARTI CLI 功能清单

这份文档用于回答两个问题：

- 当前 `arti` 命令行已经支持哪些功能
- 现在对外可以怎么介绍这款 CLI

## 1. 当前 CLI 已支持的命令能力

以下功能是用户可以直接在命令行执行的。

### 主产品三档核心能力

- `arti quick-scan AAPL`
  - 主产品 Quick Scan
  - 默认走行情 + 技术面 + 新闻的快速综合研判

- `arti full AAPL`
  - 主产品 Full 全景研报
  - 对应多分析师 Layer 1 全景报告

- `arti deep AAPL`
  - 主产品 Deep 深度研报
  - 对应三层级研报，包含大师辩论和综合裁定

### 行情与市场

- `arti quote AAPL`
  - 实时行情查询
  - 支持多股票、港股、中文名搜索

- `arti market`
  - 全球市场概览
  - 支持 `gainers`、`losers`、`active`

- `arti history AAPL -d 30`
  - 历史价格查询
  - 输出 OHLCV 数据

### 技术分析与综合研判

- `arti scan AAPL`
  - 技术指标扫描
  - 包含 MA、RSI、MACD、布林带、ATR、ADX、KDJ、OBV

- `arti predict AAPL`
  - 综合预测
  - 结合行情、技术面、新闻生成多空判断、支撑位、压力位和置信度

### 新闻与搜索

- `arti news`
  - 全球财经新闻

- `arti news AAPL`
  - 公司新闻

- `arti search 苹果`
  - 股票代码和标的搜索

### 资产类别扩展

- `arti crypto BTCUSD`
  - 加密货币行情/历史数据

- `arti fundamental AAPL`
  - 基本面数据

- `arti options AAPL`
  - 期权链数据

- `arti economy treasury`
  - 宏观经济数据

### 自选与监控

- `arti watchlist`
  - 查看自选股行情

- `arti watchlist add AAPL`
  - 添加自选股

- `arti watchlist remove AAPL`
  - 移除自选股

- `arti watch AAPL NVDA`
  - 实时行情 Dashboard
  - 支持轮询刷新

### 导出、配置与辅助能力

- `arti export AAPL -f csv`
  - 导出 CSV / JSON

- `arti credits`
  - 查看 Credits、套餐、余额、权益

- `arti config list`
  - 配置查看和修改

- `arti completion zsh`
  - 生成 shell 自动补全

### AI 研报命令

- `arti research AAPL`
  - AI 三层级研报
  - 支持完整模式、单分析师模式、Layer 1 only 模式

注意：

- `research` 虽然是 CLI 命令，但不是纯本地能力
- 它依赖额外的后端 orchestrator / Edge Function
- 如果只按主产品功能使用，建议优先用 `quick-scan`、`full`、`deep`

## 2. 当前可对外宣传的核心能力

如果是给外部用户、合作方或下载体验者介绍，建议主打下面这几类：

- 一个面向投资研究场景的命令行终端
- 主路径对齐主产品三档：Quick Scan、Full、Deep
- 开箱即可用的实时行情、市场概览、历史数据查询
- 内置技术分析能力，而不只是原始数据拉取
- 支持综合研判，把行情、技术指标、新闻合并成一个分析结果
- 支持自选股和实时监控，适合日常跟踪
- 支持 JSON 输出，方便接脚本、自动化流程和 agent
- 自带 MCP Server，可以把同一套金融数据能力暴露给 Claude Code、Claude Desktop 等 AI 工具

可以对外用一句话概括为：

> ARTI CLI 是一个面向投研场景的 AI 命令行终端，支持实时行情、历史数据、技术分析、综合研判、新闻、自选监控以及 MCP 接入。

## 3. 需要单独说明的高级能力

下面这些能力已经接入，但对外介绍时要单独说明条件，不建议混在“开箱即用”里。

### `research`

- 是 CLI 命令
- 但需要额外后端支持
- 适合写成“高级能力”或“Pro capability”

对外表达建议：

- 支持多分析师协作式 AI 研报
- 默认公开安装不保证直接可用
- 需要额外 research backend

### `arti-data hybrid`

- 这不是用户必须感知的主功能
- 本质上是 CLI 的数据增强链路
- 当前主要用于 A 股场景

目前已覆盖：

- `history`
- A 股 `scan`
- A 股 `predict` 技术面
- A 股 `research` 技术面上下文增强

对外表达建议：

- 可说“部分市场支持增强数据源”
- 不建议在公开首页直接暴露内部 key 或内部接法

## 4. 现在最适合主推的公开体验路径

如果别人第一次下载体验，最适合引导他们走这条路径：

```bash
arti quick-scan AAPL
arti full NVDA
arti deep TSLA
```

这条路径的好处是：

- 能直接体现主产品的三档能力结构
- `quick-scan` 适合公开默认体验
- `full` / `deep` 适合接入后端后的高价值体验

## 5. 一句话区分三类能力

- 公开基础能力：安装后即可使用
- 高级能力：命令已存在，但需要额外后端或配置
- 内部增强能力：主要用于数据质量增强，不是首次体验主路径
