# ARTI CLI 待办清单（Backlog）

> 汇总自 `AUDIT_2026-07-19.md`（未修项）+ RFC 草稿 + 文档治理。
> 最后更新：2026-07-21（PR #30 合入后核对）
> 已修项见审计文档原文标注，不在此重复。

## 一、涉及钱（需与后端确认 / 优先）

- [ ] **H2 疑似双重扣费** — chat / quick-scan：CLI 侧 `applyDeduction` 与 Edge v1 的 `billing` 事件可能重复记账。需后端确认 v1-chat / v1-scan-stock 是否服务端计费；若是，CLI 移除扣费、改读 billing 元数据展示。`src/commands/chat.ts:33`、`src/commands/product.ts:28`
- [ ] **H3 orchestrator fallback 不扣费** — `runOrchestrator` 的 catch 走 `runFallback`，7 个分析师并行跑完全程未调 `applyDeduction`。`src/commands/research.ts:1217, 1224-1280`
- [ ] **M-S2 计费端点重试无幂等保护** — 网络错误/5xx 重试可能导致重复扣费。需 `Idempotency-Key` 或对计费端点关闭重试。`src/api.ts:20-29, 76-136, 284-299`
- [ ] **M-C5 计费边界三处不一致** — SSE 中途 error 后的部分报告仍按全价扣；扣费 RPC 失败会误触发 fallback 重跑 7 个分析师。`src/commands/research.ts:1200-1217`

## 二、agent 契约（影响程序集成）

- [ ] **H6 `full`/`deep --json` stdout 被污染** — `research.ts` 125 处无守卫 `console.log`，`--json | jq` 必挂。JSON 模式下人类可读渲染全部跳过或转 stderr。`src/commands/research.ts:942-1162`
- [ ] **L13 `chat --json` 无结构化输出** — 始终流式文本，与文档矛盾。`src/commands/chat.ts:22-55`
- [ ] **M-C1 REPL `help` 在非 TTY 崩溃** — `setRawMode` 不存在。`src/core/repl.ts:213`
- [ ] **L10 意图识别 symbol 为 null 时静默空操作** — 用户看到完全沉默。`src/core/natural-dispatch.ts:35-43`

## 三、安全 / 稳定性

- [ ] **M-S1 自定义 base URL 不校验 scheme** — Bearer token 可能走明文 HTTP。非 localhost 强制 https。`src/config.ts`、`src/api.ts:98`
- [ ] **M-S3 认证/计费/device-flow 请求无超时** — 后端不响应时 CLI 永久挂起。统一 15–30s `AbortController`。`src/auth.ts`、`src/billing.ts`、`src/browser-login.ts`
- [ ] **M-S4 并发刷新同一 refresh token 无 inflight 去重** — Supabase 开 rotation 时会被中途登出。模块级单例刷新。`src/auth.ts:118-159`
- [ ] **M-S5 `streamOrchestratorBackend` 用裸 token 不刷新、无 401 重试** — full/deep 默认路径，token 过期直接 401。`src/api.ts:511`
- [ ] **M-C7 MCP 连接 token 刷新后旧连接泄漏** — 新建前 `close()` 旧连接。`src/data/mcp-client.ts:92-118`
- [ ] **M-C9 REPL 退出不清理 MCP 连接** — exit 前 `await shutdownBackendMcp()`。`src/core/repl.ts:374, 420`
- [ ] **L1 REPL 历史明文记录 `login --token <jwt>`** — 敏感命令跳过写历史或脱敏。`src/core/repl.ts`
- [ ] **L2 `config set auth.token` 明文回显 stdout** — 复用 `maskSecret`。`src/commands/config.ts:16`
- [ ] **L3 服务端错误原文未过滤** — 恶意后端可注入 ANSI 控制序列。strip + 截断。`src/api.ts`、`src/errors.ts`
- [ ] **L4 device flow 轮询间隔无下限钳制** — `Math.max(value, 1000)`。`src/browser-login.ts:55,66`
- [ ] **L5 Windows `cmd /c start` 打开 URL** — 改用 `explorer.exe`。`src/browser-login.ts:126`
- [ ] **L6 `--password`/`--token` 留在 shell history / `ps`** — help/文档标注风险。`src/index.ts:118-129`
- [ ] **L7 飞书 webhook 硬编码在仓库** — 移到 CI secret。`scripts/notify-feishu.sh:3`

## 四、正确性 / 体验

- [ ] **M-C2 REPL 历史方向反了** — 按 ↑ 先召回最旧命令，`loadHistory()` 传入前 `reverse()`。`src/core/repl.ts:58-65`
- [ ] **M-C3 空值字段 TypeError 崩溃** — `pct.toFixed` / `price.toFixed` 格式化前判空；`buildResearchStockContext` 移入 try 内。`src/data/research-context.ts:21`、`src/commands/product.ts:76`
- [ ] **M-C4 REPL 行处理并发竞态** — 命令执行期间 readline 继续收行，busy 标志排队。`src/core/repl.ts:361`
- [ ] **M-C6 `credits` 命令无错误兜底** — 未登录时 unhandled rejection 打 stack。包 try/catch + `printError`。`src/commands/credits.ts:25`
- [ ] **L11 以 exit/quit/help 开头的整句误触发内置命令** — 仅整行匹配。`src/core/repl.ts:371-386`
- [ ] **L12 本地状态文件非原子写、repl_history 无限增长** — tmp+rename、截断到 MAX_HISTORY。`src/core/session.ts`、`src/tracker.ts`
- [ ] **L14 扣费失败统一"未知错误"** — 区分"积分不足"与"后端不可用"。`src/billing.ts:482,512,539`
- [ ] **L15 classifyError 对 InsufficientCreditsError/PlanAccessError 无分支** — 显示"未知错误"。`src/errors.ts:12-95`
- [ ] **L16 计费文案与字段名矛盾 + 硬编码 0.04** — `src/billing.ts:227`、`src/commands/credits.ts:99`
- [ ] **L17 poly search 无 `?? []` 兜底；polyGet 丢原始 status** — `src/poly/commands.ts`、`src/poly/api.ts`
- [ ] **L18 poly `percent()` 量纲待与后端确认** — `src/poly/format.ts:20-23`
- [ ] **L19 补全脚本含 v1 已下线命令** — 与 AGENTS.md 矛盾。`src/commands/completion.ts:15,38-56`
- [ ] **L20 MCP 熔断器状态全局共享；`canUseBackendMcp` 的 symbol 形参未使用** — `src/data/mcp-client.ts`
- [ ] **L21 withBilling 检查与扣费非原子；扣费失败时已算出的结果不展示** — 设计权衡，记录即可
- [ ] **L22 `normalizeConfidence` 量纲歧义** — `src/commands/research.ts:73-78`

## 五、产品方向（Draft RFC，待评估/推进）

- [ ] **RFC-2026-0002** 新用户上手 — 一行安装 + REPL 登录态 Onboarding
- [ ] **RFC-2026-0003** CLI 数据链收敛到生产产品函数，下线 OpenBB 第二套处理
- [ ] **RFC-2026-0004** `arti poly` 子命令接入 ARTi-poly 公开 API
- [ ] **RFC-2026-0005** chat/quick-scan 切 Edge /v1 + REPL 会话历史 — 代码已大半落地，RFC 状态仍 Draft，需收尾更新

## 六、文档治理

- [ ] `docs/ROADMAP.md` 严重过时（v0.2.0-beta、OpenBB/MCP 已下线），需重写或归档
- [ ] 审计文档 H7 已修复但原文未标注（update-check 走 stderr + `--json` 跳过 + `unref`，代码侧确认完毕）
