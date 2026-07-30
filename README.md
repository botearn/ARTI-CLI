# ARTI CLI

<div align="center">

**智能投研命令行终端 — 连续对话 / 快速扫描 / 全景研报 / 深度研报**

[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![npm](https://img.shields.io/npm/v/artifin-cli)](https://www.npmjs.com/package/artifin-cli)
[![Repository](https://img.shields.io/badge/repo-botearn%2FARTI--CLI-black)](https://github.com/botearn/ARTI-CLI)

</div>

ARTI CLI 是 ARTI 投研产品的命令行客户端。它直接调用线上产品函数，不在本地维护行情、指标或研报计算逻辑；数据口径和 Credits 结算均以后端为准。支持美股、港股和 A 股，无需 Python 或 Docker。

```text
$ arti
arti> /quick AAPL
arti> 这份扫描最值得关注的风险是什么？
```

## 当前能力

| 能力 | 交互终端 | 外层命令 | 实际行为 |
|---|---|---|---|
| 普通对话 | 直接输入问题 | `arti chat --raw <问题>` | 流式 AI 投研对话；交互终端会携带当前 Session 上下文 |
| 快速扫描 | `/quick <代码>` | `arti quick-scan <代码>` | 行情、技术指标、基本面及后端返回的分析判断、综合结论和数据来源 |
| 全景研报 | `/full <代码> [重点]` | `arti full <代码> [重点]` | 创建后端异步研报任务，由 Agent Harness 取证和综合 |
| 深度研报 | `/deep <代码> [重点]` | `arti deep <代码> [重点]` | 创建后端异步深度任务，包含投资框架圆桌与综合裁定 |
| 研报恢复 | `/report <taskId>` | `arti report <taskId>` | 恢复等待或查看已有后端研报任务，不重复创建 |
| 预测市场 | `/poly ...` | `arti poly ...` | 查询事件、摘要、跨平台比较和市场搜索；需要登录 |

股票代码格式：

- 美股：`AAPL`
- 港股：`01709.HK`
- A 股：`600519.SS`、`000858.SZ`

## 安装

要求 Node.js >= 18。npm 包名是 `artifin-cli`，安装后的命令是 `arti`。

```bash
npm install -g artifin-cli
arti --version
```

升级到 npm 最新版本：

```bash
npm install -g artifin-cli@latest
```

当前仅推荐 npm 安装。

如需修改源码：

```bash
git clone https://github.com/botearn/ARTI-CLI.git
cd ARTI-CLI
npm install
npm link
```

## 登录

个人终端推荐使用浏览器授权：

```bash
arti login
arti whoami
```

退出登录：

```bash
arti logout
```

Agent、CI 或没有浏览器的环境使用 device flow。第一步取得授权链接并交给用户打开：

```bash
arti login --start --json
```

用户确认后重复轮询授权结果，直到返回 `authorized`：

```bash
arti login --poll --json
```

`--start` 会保存待确认会话，后续 `--poll` 可自动读取。已有登录态也可通过 `arti token --json` 取得环境变量所需的 token；这些值属于敏感凭证，不要写入仓库、日志或聊天记录。完整的自动化接入流程见 [AGENTS.md](AGENTS.md)。

## 两种入口

### 交互终端

无参数运行 `arti`：

```bash
arti
```

交互终端采用 chat-first 规则：

- 普通文本始终进入连续对话，不会自动触发快速扫描或付费研报。
- 只有行首 Slash Command 才确定性调用能力，例如 `/quick AAPL`。
- 输入 `/` 浏览全部命令；输入 `/help deep` 查看单个命令。
- 如需发送 `/` 开头的普通文本，使用 `//text`。

新 Session 第一次成功完成普通对话后，CLI 会说明当前入口以及 `/quick`、`/full`、`/deep` 的研究深度。普通对话只展示后端返回的回答正文，CLI 无法据此证明内部存在多角色过程；`/full` 和 `/deep` 才提供可见、可追踪的角色化研究流程。参与角色由 Backend Agent Harness 根据任务选择；分析师和大师均为 AI 角色，大师观点是投资框架模拟，并非真人意见。

普通对话等待首个回答片段时会分阶段显示真实入口、历史消息、摘要、Artifact 和活动标的；超过 8 秒后每 6 秒轮换一条原创投资原则，超过 20 秒提示可按 `Ctrl+C` 取消当前回答并继续使用 REPL。已经生成的部分会带中断标记保存在 Session。首个回答片段到达后 Loading 会立即清除，完成时显示总耗时，以及后端实际返回的模型和 Token usage（如有）。`--json` 或非 TTY 环境不会输出动态 Loading，以保持结构化输出和管道稳定。

TTY 中的普通对话会把 Markdown 标题、粗体、列表、引用、分隔线和建议标签渲染成适合终端阅读的样式；Markdown 表格会转换成纵向信息块，常见 LaTeX 公式会降级为纯文本，避免中英文宽字符或数学标记影响阅读。Session、`--json` 和非 TTY 管道仍保留服务端原始回答。

### 外层命令

显式命令适合脚本、Agent、CI 和一次性调用：

```bash
arti quick-scan AAPL
arti full NVDA 重点看估值风险
arti deep TSLA 重点看AI供应链
arti poly summary
```

`full` 和 `deep` 会先创建持久化的后端任务，再轮询直到完成。CLI 会显示 task ID；按 `Ctrl+C` 只停止本地等待，不会取消后端任务，之后可运行：

```bash
arti report <taskId>
```

Harness 内部可以选择数据工具、分析角色和补充证据，但第一版不支持用户在运行中调整任务。实际使用 `agent_harness`、`legacy` 或其他 rollout 路径由后端决定，CLI 不强制选择执行路径。

### Harness Streaming Reference Consumer

`arti harness` 是供 CLI、自动化 Agent 和未来客户端验证通用 Agent Run Event Contract 的参考消费者，不替代面向普通用户的 `full`、`deep` 和 `report`。它默认关闭，关闭时不会鉴权或发送网络请求。

在明确连接到目标环境后，可显式开启：

```bash
export ARTI_HARNESS_STREAMING_ENABLED=true
export ARTI_BACKEND_URL=https://api-gateway-dev-dev.up.railway.app
export ARTI_WEB_AUTH_URL=https://dev.artifin.ai/cli/auth

arti harness run AAPL --type panorama
arti harness attach <run-id> --after 12
arti harness status <run-id>
arti harness result <run-id>
arti harness result <run-id> --json
arti harness cancel <run-id>
```

默认终端输出只显示角色、耗时、证据数量、质量门禁和报告地址；完整结构化结果使用 `--json`。该命令不允许客户端强制选择内部执行路径，也不包含数据库 Migration 或部署能力。

在 Dev 环境重新执行 `arti login` 时，必须让 `ARTI_SUPABASE_URL`、`ARTI_BACKEND_URL` 和 `ARTI_WEB_AUTH_URL` 指向同一环境。`ARTI_WEB_AUTH_URL` 未设置时默认使用生产设备登录页；CLI 不根据域名猜测环境。

`arti chat <问题>` 是兼容入口，默认先调用产品意图识别：快速扫描可直接派发，普通问题进入对话；全景和深度研报只返回建议命令，必须由用户显式运行 `arti full` 或 `arti deep` 后才创建可能扣费的任务。需要保证只进行聊天时使用：

```bash
arti chat --raw 美股今天怎么样
```

Slash Command 只属于交互终端。自动化程序应调用外层命令并加全局 `--json`：

```bash
arti chat --raw "用一句话解释市盈率" --json
arti quick-scan AAPL --json
arti deep 01709.HK --json
arti credits --json
```

`chat --json` 的 `answer` 字段始终存在；后端返回 usage 事件时，结果还包含
`requestId`、`model` 和 `usage`。Token usage 只反映模型上下文，不代表 Credits。

## Slash Command

| 分组 | 命令 | 说明 |
|---|---|---|
| 会话 | `/help [command]` | 浏览命令或查看具体用法 |
| 会话 | `/status` | 查看 Session、模型、上下文、标的和 Artifact 状态 |
| 会话 | `/usage` | 查看服务端返回的最近一轮和会话累计 Token usage |
| 会话 | `/compact [重点]` | 压缩活跃上下文，保留原始 transcript |
| 会话 | `/new [标题]` | 新建 Session |
| 会话 | `/resume [Session]` | 列出最近会话，或按 ID、唯一前缀恢复 |
| 会话 | `/clear` | 保存当前 Session 并开始新 Session |
| 会话 | `/cls` | 清空终端屏幕 |
| 会话 | `/exit` | 保存并退出 |
| 研报 | `/quick <代码>` | 快速扫描 |
| 研报 | `/full <代码> [重点] [--full]` | 创建全景研报任务 |
| 研报 | `/deep <代码> [重点] [--full]` | 创建深度研报任务 |
| 研报 | `/report <taskId> [--full]` | 恢复等待或查看已有任务 |
| 工具 | `/credits` | 查看 Credits 余额和套餐 |
| 工具 | `/poly ...` | 查询预测市场 |
| 账户 | `/login` | 登录 |

## Session、Compact 与 Artifact

交互终端会把 transcript 以 append-only JSONL 保存在 `~/.config/arti/sessions/`。目录权限为 `0700`，文件权限为 `0600`；外层 `arti <command>` 不会创建或读取这些会话文件。

Session 默认保留 30 天。可以修改保留期：

```bash
arti config set session.retentionDays 60
```

也可以设置环境变量 `ARTI_SESSION_RETENTION_DAYS`。`/resume` 无参数时列出最近 10 个会话。

`/compact [重点]` 通过普通聊天请求生成结构化摘要，只缩小后续请求携带的活跃上下文，不删除原始 transcript。是否扣费及扣费多少仍由后端决定，CLI 不包含价格或本地扣费逻辑。

交互终端中的 `/quick`、`/full`、`/deep`、`/report` 和 `/poly` 会把完整结构化结果保存为当前 Session 的 Artifact。后续对话只携带摘要和 Artifact 引用，不重复发送完整结果；Artifact 不跨 Session，并随所属 Session 的保留期清理。

## 命令一览

| 命令 | 说明 |
|---|---|
| `arti` | 进入交互终端 |
| `arti chat [--raw] <message...>` | 智能路由；`--raw` 强制普通对话 |
| `arti quick-scan <symbol>` | 快速扫描；别名 `quick`、`qs` |
| `arti full <symbol> [focus...] [--full]` | 创建并等待全景研报任务；别名 `panorama`、`fr` |
| `arti deep <symbol> [focus...] [--full]` | 创建并等待深度研报任务；别名 `dr` |
| `arti report <taskId> [--full]` | 恢复等待或查看已有研报任务 |
| `arti poly events\|event\|summary\|compare\|search` | 预测市场查询 |
| `arti login` / `logout` / `whoami` / `token` | 登录态和凭证管理 |
| `arti credits` | Credits 余额和套餐 |
| `arti doctor mcp` | 维护者使用的后端 MCP 数据链诊断 |
| `arti config set\|get\|list\|reset` | 管理 `~/.config/arti/config.json` |
| `arti completion [bash\|zsh]` | 输出 Shell 补全脚本 |

使用 `arti <command> --help` 查看完整参数和示例。

## Credits 与 Token

Credits 和 Token usage 是两套概念：

- Credits 是产品余额。调用是否收费、扣多少均由生产后端决定，CLI 不维护价格常量，也不在本地扣费。
- Token usage 描述对话模型的输入、输出、缓存和上下文用量，只使用 `v1-chat` 服务端返回的 usage 事件。
- Token 不能用于推导 Credits。服务端没有返回 usage 时，CLI 会明确显示未知，不进行字符数或 tokenizer 估算。

使用 `arti credits` 或交互终端中的 `/credits` 查看余额，使用 `/usage` 查看当前 Session 的 Token usage。

## 架构边界

```text
交互终端普通文本 ──────────────────────────> v1-chat
交互终端 Slash / 外层显式命令
  ├─ quick-scan ───────────────────────────> v1-scan-stock
  ├─ full / deep ─> generate-report ───────> Backend Agent Harness / rollout
  ├─ report ───────────────────────────────> report task query
  └─ poly ─────────────────────────────────> poly-data

外层 arti chat（默认）─> classify-intent ──> quick-scan / v1-chat / full、deep 显式命令提示
```

CLI 是生产后端的瘦客户端，不是面向用户暴露的 MCP Server。`arti doctor mcp` 仅用于诊断 CLI 内部依赖的后端数据链，不代表提供 MCP Server 接入。

## 开发

```bash
npm install
npm run dev -- quick-scan AAPL
npm test
npm run build
```

项目使用 TypeScript ESM，导入路径带 `.js` 后缀。修改前请阅读 [CLAUDE.md](CLAUDE.md) 和 [AGENTS.md](AGENTS.md)，不要直接在 `main` 上开发。

重要功能、架构、API 或计费模型变更先写 RFC：

- [RFC 索引](rfcs/INDEX.md)
- [RFC 模板](rfcs/template.md)
- 创建命令：`./scripts/create-rfc.sh`

## License

`package.json` 声明为 MIT。
