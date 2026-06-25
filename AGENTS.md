# ARTI CLI — Agent 接入指南

给自动化 agent / 程序集成用的最小接入说明。ARTI CLI 是生产后端的瘦客户端，所有能力走线上产品函数，按账号计费。

## 1. 安装（clone 即自运行）

```bash
git clone https://github.com/botearn/ARTI-CLI.git
cd ARTI-CLI
npm install          # 触发 prepare 钩子自动构建，无需手动 build
```

之后用以下任一方式调用（无需 `npm link`）：

```bash
npx arti <command>           # 推荐
node dist/index.js <command> # 等价
```

要求：Node ≥ 18。**不需要 Python**。

## 2. 鉴权（非交互）

agent 不能走浏览器登录。流程：人工登录一次 → 取 token → 注入 agent 环境。

```bash
# 人工在有浏览器的机器上执行一次
arti login
arti token            # 打印可粘贴的 export 行（token 等同密码，勿外泄）
```

把输出的三个变量设到 agent 运行环境即可免登录：

```bash
export ARTI_AUTH_TOKEN=<access-token>
export ARTI_AUTH_REFRESH_TOKEN=<refresh-token>
export ARTI_AUTH_EXPIRES_AT=<unix-seconds>
```

CLI 会在 token 过期时用 refresh token 自动续期。验证：`arti whoami --json`。

## 3. 能力与调用

加 `--json` 输出结构化数据，供程序解析。

| 能力 | 命令 | 说明 |
|---|---|---|
| 聊天 | `arti chat "<问题>"` | AI 投研对话（流式文本） |
| 快速扫描 | `arti quick-scan <symbol> --json` | 行情 + 技术面 + 基本面 |
| 全景研报 | `arti full <symbol> --json` | 多分析师 Layer 1 |
| 深度研报 | `arti deep <symbol> --json` | 三层级 + 大师辩论 + 裁定 |

代码规范：
- 美股直接代码 `AAPL`；港股 5 位补零 `01709.HK`；A 股 `600519.SS` / `000858.SZ`。
- `full` / `deep` 较慢（约 1–2 分钟），且按次计费；`quick-scan` / `chat` 快且便宜。

示例：

```bash
export ARTI_AUTH_TOKEN=... ARTI_AUTH_REFRESH_TOKEN=... ARTI_AUTH_EXPIRES_AT=...
npx arti quick-scan AAPL --json
npx arti deep 01709.HK --json
```

## 4. 计费 / 错误

- 每次调用按对应能力扣 Credits；`arti credits --json` 查余额。
- 退出码非 0 表示失败；错误信息打到 stderr。常见：未登录 / 积分不足 / 代码不存在 / 后端不可用。

## 5. 不支持

- 无 MCP Server（v1 已下线）。如需 MCP 原生接入，另行评估。
- 裸数据命令（quote/history/fundamental/news 等）v1 未开放。
