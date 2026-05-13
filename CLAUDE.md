# ARTI CLI — 智能投研工具

ARTI 是一个基于 OpenBB 的金融数据命令行工具，同时提供 MCP Server 供 AI 助手调用。

## 项目结构

- `src/index.ts` — CLI 入口（commander 命令路由）
- `src/mcp-server.ts` — MCP Server 入口（暴露金融数据工具）
- `src/openbb.ts` — OpenBB Python 桥接层（通过 child_process 调用）
- `scripts/openbb_query.py` — Python 端 OpenBB 数据查询脚本
- `src/commands/` — CLI 各命令实现
- `prompts/` — AI 研报 prompt 定义（从 ARTI_backend 同步）
  - `layer1/` — 8 位分析师 prompt（Natasha/Steve/Tony/Thor/Clint/Sam/Vision/Wanda）
  - `layer2/` — 7 位投资大师 prompt（巴菲特/林奇/马克斯/索罗斯/达里奥/德鲁肯米勒/段永平）
  - `panorama_synthesizer.yaml` — 全景研报综合裁定
  - `synthesizer.yaml` — 深度研报综合裁定
  - `_common.yaml` — 公共 prompt 片段

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
| `arti_fundamental` | 基本面数据 | `symbol`, `fields?` |
| `arti_options` | 期权链 | `symbol`, `limit?` |
| `arti_economy` | 宏观经济数据 | `indicator`, `series_id?`, `query?`, `limit?` |

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
arti watch AAPL NVDA          # 实时行情 Dashboard（Ctrl+C 退出）
arti export AAPL -f csv       # 导出历史数据到 CSV
arti completion zsh           # 生成 Shell 自动补全脚本
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

## 演绎法（强制）

修改 src/ 时，按顺序执行：
1. 查 `.deductive/acs/rules.json` → 向用户展示相关规则
2. 用业务语言写验收要点（3-5条）→ 等用户说"确认"
3. 写 `tests/test_ac_*.py`（头部 `# @covers: 规则ID`）+ 写生产代码
4. 跑一次给用户看结果 → 等用户说"对"
5. 用户说"对" → commit；说"不对" → 改了再跑给用户看

不可跳步。未确认不写代码。未验证不 commit。
无匹配规则时告知用户后正常实现。
用户说"跳过演绎"时可直接实现。

### 验收要点规则
用用户能判断对错的业务语言，禁止写技术细节。

### 意图识别规则
系统已配置 UserPromptSubmit hook 做意图识别。
当 hook 返回 UNCERTAIN 时，不要视为确认。必须追问用户。
"应该对吧""算是吧""嗯...""可能" = 不确定 = 必须追问。

### 演绎法文件结构

```
.deductive/
├── config.json              # 模式配置（observe/enforce）
├── state.json               # 实时状态（自动更新）
├── acs/
│   └── rules.json           # 规则注册表（ARTI CLI 需求清单）
├── hooks/
│   ├── gate-commit.py       # commit 门禁 + 覆盖率计算
│   ├── run-lint.py          # 编辑后即时 lint
│   └── check-intent.py      # 用户意图识别
├── evidence/                # 验证存档（自动写入）
└── logs/                    # 执行日志
```

启用方式：将 `settings.deductive.json` 中的 hooks 合并到 `~/.claude/settings.json`。
临时禁用：`touch .deductive/DISABLED`
切换为强制模式：编辑 `.deductive/config.json` 将 mode 改为 `enforce`。
