# ARTI CLI

<div align="center">

**🚀 智能投研命令行工具 — 聊天 / 快速扫描 / 全景研报 / 深度研报**

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![npm](https://img.shields.io/npm/v/artifin-cli)](https://www.npmjs.com/package/artifin-cli)
[![Repository](https://img.shields.io/badge/repo-botearn%2FARTI--CLI-black)](https://github.com/botearn/ARTI-CLI)

</div>

---

ARTI CLI 是 ARTI 投研产品的命令行客户端。它是生产后端的**瘦客户端**——所有能力直接调用与 web 产品**同一套生产函数**，数据口径、计费完全一致，无需本地 Python 或额外数据源。

```
$ arti
  智能投研终端 > 茅台现在怎么样？

  贵州茅台 快速扫描 · 600519.SS …
```

## 能力（v1）

| 能力 | 命令 | 说明 |
|---|---|---|
| 聊天 | `arti chat <问题>` | 智能路由到快速扫描 / 研报 / AI 投研对话 |
| 快速扫描 | `arti quick-scan <代码>` | 行情 + 技术面 + 基本面快速研判 |
| 全景研报 | `arti full <代码>` | 多分析师 Layer 1 全景报告 |
| 深度研报 | `arti deep <代码>` | 三层级深度研报（分析师 + 大师辩论 + 综合裁定） |
| 预测市场 | `arti poly events` | ARTi Poly 公开 API：事件、摘要、跨平台价差 |

支持美股、港股、A 股。无参运行 `arti` 进入交互终端，**直接打字即可**——内置意图识别会自动判断该聊天还是出报告。

## Quick Start

### 1. 安装

只需 Node.js >= 18，**无需 clone 源码、无需 Python**：

```bash
# npm 全局安装（推荐）
npm install -g artifin-cli

# 或一行脚本
curl -fsSL https://artifin.ai/cli/install.sh | bash

# 或 Homebrew
brew tap botearn/arti https://github.com/botearn/homebrew-arti
brew install arti
```

装完即可用 `arti` 命令（npm 包名是 `artifin-cli`，命令是 `arti`）。升级：`npm i -g artifin-cli@latest`。

> 仅在需要修改源码（贡献者）时才克隆：
> ```bash
> git clone https://github.com/botearn/ARTI-CLI.git
> cd ARTI-CLI && npm install && npm link
> ```

### 2. 登录

```bash
arti login        # 浏览器登录（推荐）
arti whoami       # 查看登录状态
arti logout
```

脚本环境也支持邮箱密码或直接传 token：

```bash
arti login --email you@example.com --password '***'
arti login --token <access-token> --refresh-token <refresh-token>
```

登录态会自动续期。

### 3. 上手

```bash
# 交互终端（推荐）：直接打字，意图自动识别
$ arti
  智能投研终端 > 帮我深度分析英伟达
  智能投研终端 > 今天大盘怎么样

# 或用显式命令
arti quick-scan AAPL
arti full NVDA
arti deep TSLA
arti chat 美股今天怎么样
arti chat --raw 美股今天怎么样  # 跳过意图识别，纯聊天
```

## 两种使用模式

### REPL 交互模式（chat-first）

无参运行 `arti` 进入终端。输入分两类：

- **命令**：`quick-scan AAPL`、`full NVDA`、`help`、`exit` 等
- **自由文本**：任意问题 → 复用产品意图识别（`classify-intent`）→ 自动派发到快速扫描 / 全景 / 深度 / 聊天；缺股票代码时会回问

### CLI 模式

每个能力都有显式命令，适合脚本与一次性调用。`arti chat <问题>` 默认复用产品意图识别，可能自动派发到快速扫描、全景研报、深度研报或聊天；需要强制纯聊天时使用 `arti chat --raw <问题>`。所有命令支持 `--json` 输出结构化 JSON。

## 命令一览

| 命令 | 说明 |
|---|---|
| `chat [--raw] <message...>` | 智能路由；`--raw` 为纯 AI 投研对话 |
| `quick-scan <symbol>` | 快速研判 |
| `full <symbol> [-f]` | 全景研报（`-f` 看完整内容） |
| `deep <symbol> [-f]` | 深度研报 |
| `login` / `logout` / `whoami` | 账户 |
| `credits` | 余额与套餐 |
| `poly events|event|summary|compare|search` | ARTi Poly 预测市场数据 |
| `doctor` | 连接诊断 |
| `config` | 配置管理 |
| `completion [bash\|zsh]` | Shell 补全 |

## Credit 计费

各能力按对应产品函数计费，口径与 web 产品一致。`arti credits` 查看余额；积分不足会在调用前提示。

## 架构

```
                   ┌─────────────────────────────────────┐
   web 产品 / CLI ──┤  生产产品函数（Supabase Edge Functions）│
                   │  chat · scan-stock · classify-intent  │
                   │  orchestrator · cli-auth · credits     │
                   └──────────────┬──────────────────────────┘
                                  │ 重型研报委派
                                  ▼
                       ARTI_backend（orchestrator 运行时）
```

CLI 不维护本地数据处理逻辑，全部复用生产函数，保证与产品口径一致、计费统一。

## 开发

```bash
npm install                   # 安装依赖
npm run dev -- quick-scan AAPL # 开发模式运行（tsx，免编译）
npm run build                 # 构建
npm test                      # 测试
```

### RFC 流程

重要功能变更、架构调整、破坏性更新先写 RFC。

- RFC 目录：`rfcs/`，索引：`rfcs/INDEX.md`，模板：`rfcs/template.md`
- 创建：`./scripts/create-rfc.sh`

## License

MIT
