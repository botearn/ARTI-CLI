# ARTI CLI — Agent 接入指南

给自动化 agent / 程序集成用的最小接入说明。ARTI CLI 是生产后端的瘦客户端，所有能力走线上产品函数，按账号计费。

## 1. 安装（npm 全局安装，无需 clone）

```bash
npm install -g artifin-cli   # 装完得到 `arti` 命令
```

要求：Node ≥ 18，不需要 Python。之后直接 `arti <command>` 调用。

> 仅在需要改源码时才克隆：`git clone https://github.com/botearn/ARTI-CLI.git && cd ARTI-CLI && npm install`（prepare 钩子自动构建），用 `npx arti <command>` 调用。

## 2. 鉴权

agent 不能自己开浏览器，但可以**把授权链接交给用户去点**（device flow）。任选一种：

### 方式 A：device flow（agent 引导用户授权，推荐）

```bash
# 1) 取授权链接（立即返回，不阻塞、不开浏览器）
arti login --start --json
# → {"status":"authorize_pending","login_url":"https://artifin.ai/cli/auth?...",
#    "user_code":"CWKQ6R","session_id":"...","poll_interval_ms":2000}
```

agent 把 `login_url`（或 `user_code`）抛给用户 → 用户在浏览器/邮件点击确认。

```bash
# 2) 轮询确认（单次返回当前状态，按 poll_interval_ms 循环调用）
arti login --poll --json
# → {"status":"pending","poll_interval_ms":2000}      # 重复直到 ↓
# → {"status":"authorized","email":"you@..."}          # token 已存，完成
```

`--start` 会把会话落盘，`--poll` 自动读取，无需 agent 自己穿 session_id。

**可直接照抄的完整流程**（取链接 → 抛给用户 → 自动轮询直到通过）：

```bash
# 1) 取链接，抛给用户去任意浏览器点确认
LOGIN_URL=$(arti login --start --json | python3 -c 'import sys,json;print(json.load(sys.stdin)["login_url"])')
echo "请在浏览器打开并用账号登录确认：$LOGIN_URL"

# 2) 轮询直到授权完成（用户点确认后自动结束）
for i in $(seq 1 150); do
  STATUS=$(arti login --poll --json | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])')
  case "$STATUS" in
    authorized) echo "✅ 登录完成"; break ;;
    pending)    sleep 2 ;;
    *)          echo "⚠️ 会话失效（$STATUS），重新执行 arti login --start"; break ;;
  esac
done
```

用户只需在浏览器点一下确认，agent 这边自动检测完成、token 自动写入——之后所有 `arti ... --json` 调用都已鉴权。

### 方式 B：已有 token（直接注入环境）

人工在有浏览器的机器上 `arti login` 一次，再 `arti token` 取出三个值，设到 agent 环境：

```bash
export ARTI_AUTH_TOKEN=<access-token>
export ARTI_AUTH_REFRESH_TOKEN=<refresh-token>
export ARTI_AUTH_EXPIRES_AT=<unix-seconds>
```

两种方式都会让 CLI 在 token 过期时自动续期。验证：`arti whoami --json`。
> 在非 TTY（agent）环境直接 `arti login` 也会自动改为打印链接而非开浏览器。

## 3. 能力与调用

加 `--json` 输出结构化数据，供程序解析。

> `/quick`、`/full` 等 Slash Command 仅供 `arti` 交互终端使用。agent、脚本和 CI 必须继续调用下面的外层 `arti <command> --json`，不要模拟交互输入。

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
arti quick-scan AAPL --json
arti deep 01709.HK --json
```

## 4. 计费 / 错误

- 每次调用按对应能力扣 Credits；`arti credits --json` 查余额。
- 退出码非 0 表示失败；错误信息打到 stderr。常见：未登录 / 积分不足 / 代码不存在 / 后端不可用。

## 5. 不支持

- 无 MCP Server（v1 已下线）。如需 MCP 原生接入，另行评估。
- 裸数据命令（quote/history/fundamental/news 等）v1 未开放。
