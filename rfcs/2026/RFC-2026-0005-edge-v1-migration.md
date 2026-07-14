# RFC-2026-0005: chat / quick-scan 切换 Supabase Edge /v1 + REPL 会话历史

## 元数据

- **RFC 编号**: RFC-2026-0005
- **标题**: chat / quick-scan 切换 Supabase Edge /v1 + REPL 会话历史
- **作者**: zhe
- **状态**: Draft
- **创建日期**: 2026-07-14
- **最后更新**: 2026-07-14
- **关联 Issue**: N/A
- **关联 PR**: N/A（开 PR 后回填）
- **主篇 RFC**: [arti#0055-channel-conversation-parity](https://github.com/iloveopt/arti/blob/main/docs/rfcs/0055-channel-conversation-parity.md)
- **取代**: 延续 RFC-2026-0003「收敛到生产产品函数」方向，修正其 chat/quick 实际落点（Railway Python 网关 → Edge /v1）
- **被取代**: N/A

> 本篇是 [arti#0055](https://github.com/iloveopt/arti/blob/main/docs/rfcs/0055-channel-conversation-parity.md) 的姊妹实施篇，**只描述 CLI 侧端点切换与验收**。为什么统一到 Edge /v1、无状态会话契约、Python chat 退役（[backend#RFC-2026-0010](https://github.com/botearn/ARTI_backend/blob/main/rfcs/2026/RFC-2026-0010-retire-python-chat.md)）请读主篇。

## 摘要

RFC-2026-0003 把 CLI 收敛为"生产后端瘦客户端"，但 chat / quick-scan 的实际落点是 **Railway Python 网关** `/v1/chat`、`/v1/scan-stock`——其中 Python chat 是无标的识别/行情注入的双实现副本，Edge 侧修复 CLI 全部吃不到（`arti chat 腾讯最近怎么样` 至今答"暂无数据"，web/飞书已修复）。本 RFC 把 chat / quick-scan 切到 **Supabase Edge `/v1` 家族**（web / 飞书 bot 同款契约），并给 chat/REPL 补会话历史（无状态契约下调用方自带 messages）。

## 现状（已核对代码）

- `src/api.ts`：
  - `streamChat`（L612）→ `config.backend.url` + `/v1/chat`（Railway Python），**无条件**走 backend、不检查 `backend.enabled`；SSE 按 OpenAI chunk 解析（`parseChatDelta`）
  - `scanStockBackend`（L489）→ Railway `/v1/scan-stock`
  - `generateReport`（L506）→ Railway `/v1/generate-report`，**当前无调用方**（full/deep 实际走流式 orchestrator）
  - `callEdge`（L66）→ `config.api.baseUrl`（Supabase functions/v1）已有完整超时/重试/401 刷新，`classify-intent` 等在用
- `src/commands/chat.ts`：`rawChatCommand` 每次只发单条 message，无历史
- `src/core/session.ts`：REPL 会话态存在，但未累积 chat messages
- full / deep（`src/commands/research.ts:930`）：按 `backend.enabled` 走 Railway `/v1/orchestrator` 或 Edge `orchestrator` 流式——**本 RFC 不动**（另一对双实现，退役影响面大，另行评估）
- Edge 侧契约：`arti` 仓库 `src/lib/internal-api-contract.ts`（V1_ENDPOINTS / SSE 事件枚举 `message.delta` / `message.done` / `billing` / `error` / envelope）

## 详细设计

### 1. streamChat → Edge `v1-chat`

- URL：`${config.api.baseUrl}/v1-chat`（与 `callEdge` 同一 baseUrl 与鉴权：Bearer 用户 JWT + 401 刷新重试）
- 请求体不变：`{ messages, agentId }`（Edge v1-chat 透传给 chat，服务端自动做标的识别 + 行情注入 + 跨轮回溯）
- SSE 解析改为 typed 事件（对齐 internal-api-contract 枚举）：`message.delta` 取增量、`billing` 取计费元数据（替代 CLI 侧价格判断展示）、`error` 转 ApiError、未知事件跳过（forward-compatible）
- 移除对 `config.backend.url` 的依赖；`backend.*` 配置仅保留给 orchestrator（full/deep）

### 2. chat / REPL 会话历史（无状态契约,调用方自带）

- `core/session.ts` 增加 messages 累积：REPL 内每轮 push user/assistant 两条，`streamChat` 传最近 N 轮（N=6，与服务端跨轮回溯窗口一致）；`/clear`（REPL 已有语义则复用）清空
- 单次命令 `arti chat <text>` 保持单条（无会话可依附）；`--raw` 同
- 超长历史按轮截断，不做 token 级裁剪（服务端有自己的上限防御）

### 3. scanStockBackend → Edge `v1-scan-stock`

- URL 切换 + 响应解 envelope（`{ data: { scan }, meta: { billing } }`）；`renderQuickScan` 字段口径与 Edge scan-stock 输出对齐（实施时逐字段核对，缺失字段容错渲染）
- 计费展示读 `meta.billing`

### 4. 清理

- `generateReport` / `GenerateReportRequest`（无调用方）删除；后续 CLI 若做异步报告，直接接 Edge `v1-report-tasks`
- `callBackend` 保留（orchestrator 仍用），但补上 `backend.enabled` 检查语义说明（当前 streamChat/callBackend 均无视该开关，收敛后开关只对 orchestrator 生效）
- 本机全局 `npm link` 断链（指向已迁移的旧路径）随实施 PR 的 README/安装说明一并提醒

### 升级与兼容

- 旧版 CLI 在 backend 姊妹篇 Phase A 后调 Railway `/v1/chat` 会收到 410 + 升级提示（不静默失败）
- `--json` 输出结构尽量贴近 v1 envelope（RFC-0045 §4.6 方向），字段增删在 CHANGELOG 标注

## 验收

1. `arti chat 腾讯最近怎么样` → 走 Edge v1-chat，回答带真实行情（价格/PE 等注入数字）
2. REPL 内先问「腾讯最近怎么样」再问「那能买吗」→ 第二轮接住 00700.HK 上下文
3. `arti quick-scan NVDA` / 自然语言「看看 NVDA」→ Edge v1-scan-stock，渲染与计费展示正常
4. `arti full NVDA` / `arti deep NVDA` 行为不回归（路径未动）
5. 现有测试套件通过；新增 streamChat typed SSE 解析与历史组装单测
6. 断网 Railway（模拟 `backend.url` 不可达）时 chat / quick-scan 不受影响（已解耦）

## 实施记录（append-only）

| 日期 | PR | 一句话 |
|------|-----|--------|
| —    | —   | —      |
