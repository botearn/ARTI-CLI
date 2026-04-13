# ARTI CLI — 智能投研工具

ARTI 是一个基于 OpenBB 的金融数据命令行工具，同时提供 MCP Server 供 AI 助手调用。

## 项目结构

- `src/index.ts` — CLI 入口（commander 命令路由）
- `src/mcp-server.ts` — MCP Server 入口（暴露金融数据工具）
- `src/openbb.ts` — OpenBB Python 桥接层（通过 child_process 调用）
- `scripts/openbb_query.py` — Python 端 OpenBB 数据查询脚本
- `src/commands/` — CLI 各命令实现

## 依赖环境

- Node.js >= 18
- Python 虚拟环境在 `.venv/`，内含 openbb 包
- OpenBB 数据源主要使用 yfinance（免费，无需 API Key）

## MCP Server 可用工具

本项目的 MCP Server 暴露以下工具，用于获取金融市场数据：

| 工具名 | 功能 | 参数 |
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

## CLI 命令

```bash
arti quote AAPL NVDA          # 实时行情
arti market                   # 全球市场概览
arti market gainers           # 涨幅榜
arti scan AAPL                # 技术指标扫描
arti predict AAPL             # 综合预测分析
arti news AAPL                # 公司新闻
arti news                     # 全球新闻
arti research AAPL            # AI 多维研报（需后端服务）
arti config list              # 查看配置
```

所有命令支持 `--json` 全局选项，输出结构化 JSON。

## 开发

```bash
npm install                   # 安装 Node 依赖
npm run dev -- quote AAPL     # 开发模式运行 CLI
npm run dev:mcp               # 开发模式运行 MCP Server
npm run build                 # 构建
```

## 技术约定

- TypeScript ESM 模块，导入路径带 `.js` 后缀
- OpenBB 调用通过 `src/openbb.ts` 桥接，底层是 `scripts/openbb_query.py`
- 每个 Python 调用是独立子进程，120s 超时
- 涨红跌绿（中国习惯）
