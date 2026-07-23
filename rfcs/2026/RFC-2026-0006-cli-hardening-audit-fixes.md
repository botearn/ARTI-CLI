# RFC-2026-0006: CLI 加固与审计缺陷修复计划

## 元数据

- **RFC 编号**: RFC-2026-0006
- **标题**: CLI 加固与审计缺陷修复计划
- **作者**: zhe
- **状态**: Draft
- **创建日期**: 2026-07-23
- **最后更新**: 2026-07-23
- **关联 Issue**: N/A
- **关联 PR**: N/A（开 PR 后回填）
- **取代**: 取代 `docs/BACKLOG.md`（非正式清单），并入正式 RFC 流程跟踪
- **被取代**: N/A

## 摘要

本 RFC 取代 `docs/BACKLOG.md`，把 2026-07-19 审计报告（`AUDIT_2026-07-19.md`）遗留的未修项，经 **2026-07-23 重新审计**（四组并行核对 + 跨仓库交叉验证）后，收敛为一份**可执行的修复计划**。

重新审计结论：BACKLOG 中约 40 项**几乎全部仍成立，无一项因 v1 收敛而失效**；其中 H2 双重扣费经 CLI + 后端两仓库交叉核对，已从"疑似"**坐实为确认**。此外审计额外发现 RFC 状态字段滞后、`docs/ROADMAP.md` 与 `CHANGELOG.md` 存在文档口径矛盾。

本 RFC 按"能否独立修复 + 用户可见影响"重排优先级，分 5 批实施，并单列"待后端确认"章节隔离需后端配合的项。

## 背景

`docs/BACKLOG.md` 是审计后的非正式待办清单，问题：
1. 行号/结论停留在 2026-07-19，之后已合并多个 PR，需重新核对时效性。
2. 按严重度（H/M/L）分组，混淆了"多严重"与"能否马上做"两个维度，无法直接指导实施。
3. 不在 RFC 流程内，无验收要点、无实施批次，长期挂账。

## 重新审计方法（2026-07-23）

四组只读审计 agent 并行核对，均以当前代码为准（不信任 BACKLOG 行号），计费组额外核对了后端两仓库（`arti/supabase/functions/`、`ARTI_backend/`）：

1. 安全/稳定性组：M-S1/S3/S4/S5、M-C7/C9、L1-L5、L7
2. 正确性/REPL 组：H6、L13、M-C1/C2/C3/C4/C6、L10/L11/L12
3. 计费组：H2/H3、M-S2、M-C5、L14/L15/L16/L21（跨仓库）
4. 过时项/文档组：L6、L17-L20、L22、RFC 状态、ROADMAP

**核心修正（相对 BACKLOG 的两个假设）**：
- "v1 下线了 poly" → **不成立**。`arti poly` 仍在 `src/index.ts:230-247` 注册，`src/poly/` 四文件都在。
- "mcp-client 已删除" → **不成立**。`src/data/mcp-client.ts` 仍是 full/deep/scan 的取数主链路（经 `research-context.ts`），被 REPL/doctor 引用。v1 下线的是**本地 MCP Server**，不是**后端 MCP 客户端**。因此 M-C7/M-C9/L20 依然有效。

## 详细设计：修复计划

> 每项格式：**问题** → 证据（当前代码位置）→ 修复方向 → 难度。行号为 2026-07-23 核对值。

### 批次 1 — 用户可见崩溃 / 数据错误（最高优先，纯 CLI 可修）

- **M-C3 空值字段 TypeError 崩溃**
  - 证据：`src/commands/product.ts:76` `d.price.toFixed(2)`、`src/data/research-context.ts:21` `scan.pct.toFixed(2)` 格式化前未判空；且 `buildResearchStockContext`（`src/commands/research.ts:885`）在 try 块（`:927`）**之外**，抛错冒泡到 `main()` 无 catch → unhandled rejection 打栈到终端。字段 TS 类型虽标非空 `number`，后端违约回 null 即崩。
  - 修复：`price`/`pct` 格式化前判空；`buildResearchStockContext` 移入 try 内。
  - 难度：小-中。

- **M-C6 credits 命令无错误兜底**
  - 证据：`src/commands/credits.ts:25` `await getActiveBillingState()` 无 try/catch，未登录时 `billing.ts:272` 抛错 → 全局无 `unhandledRejection` 处理器 → 打完整 stack。其它命令（quickScan/research）都有 `printError` 兜底，credits 是唯一漏网。
  - 修复：包 try/catch + `printError`。
  - 难度：小。

- **M-C1 REPL help 在非 TTY 崩溃**
  - 证据：`src/core/repl.ts:239` `interactiveSelect` 无条件 `process.stdin.setRawMode(true)`，非 TTY 下 `setRawMode` 为 `undefined` → `TypeError`。管道输入含 `help`/`?`/`/` 即触发。
  - 修复：进入前判 `process.stdin.isTTY`，非 TTY 退化为纯文本列表。
  - 难度：小。

- **M-C2 REPL 历史方向反了**
  - 证据：`src/core/repl.ts:64` `loadHistory` 按文件顺序（旧→新）返回，未 reverse 直接传 `readline`（`:384`）；Node readline 约定 `history[0]` 为最新，导致按 ↑ 先召回最旧命令。
  - 修复：传入前 `reverse()`。
  - 难度：小。

### 批次 2 — 认证 / 连接健壮性（纯 CLI 可修）

- **M-S3 认证/计费/device-flow 请求无超时**
  - 证据：`src/auth.ts`、`src/billing.ts`、`src/browser-login.ts` 全无 `AbortController`（各 grep 计数 0），后端不响应时永久挂起。对比 `src/api.ts` 的 `callEdge`/`callBackend` 已有超时模式。（本会话 login 卡两轮 5 分钟、quick-scan 偶发 30s 超时与此相关。）
  - 修复：复用 api.ts 的 AbortController 模式，统一 15–30s 超时。
  - 难度：小。

- **M-S5 streamOrchestratorBackend 用裸 token、无 401 重试**
  - 证据：`src/api.ts:509-511` 直接取 `config.auth.token`，未调 `ensureValidAccessToken()`；`:538` 仅 `throw`，无 401→刷新→重试。对比同文件 `streamOrchestrator`（`:269`）与 `streamChat`（`:618`）都有。full/deep 默认走此路径（`research.ts:933`，`backend.enabled` 默认 true），token 过期直接 401。
  - 修复：照抄 `streamOrchestrator` 的 token 获取 + 401 重试。
  - 难度：小。

- **M-S4 并发刷新同一 refresh token 无 inflight 去重**
  - 证据：`src/auth.ts:118-131` `refreshAuthSession` 每次直接发起刷新，无模块级单例。full/deep 会并发触发多路 `ensureValidAccessToken`（orchestrator + billing 内 5 个并行请求 + mcp-client），Supabase rotation 下先返回者使旧 token 失效 → 后续刷新失败被登出。
  - 修复：模块级 `inflightRefresh` Promise 单例，完成后清空；注意写盘一致性。
  - 难度：中。

- **M-C7 MCP 连接 token 刷新后旧连接泄漏**
  - 证据：`src/data/mcp-client.ts:92` 缓存命中条件含 `cachedToken === token`，token 变化时新建 client（`:96/114`）覆盖旧引用，**旧 client 从未 close()**。`shutdownBackendMcp` 只在进程退出关一次。
  - 修复：新建前 `if (activeClient?.close) await activeClient.close()`。
  - 难度：小。

- **M-C9 REPL 退出不清理 MCP 连接**
  - 证据：`src/index.ts:293` REPL 分支在 `shutdownBackendMcp` 的 finally（`:305`）之前 return；`repl.ts:407/455` exit/close 直接 `process.exit(0)`，无 `await shutdownBackendMcp()`。
  - 修复：exit/close 前 `await shutdownBackendMcp().catch(()=>{})`。
  - 难度：小（清洁性问题，process.exit 会让 OS 回收，影响低）。

### 批次 3 — agent 契约 / REPL 体验（纯 CLI 可修）

- **H6 full/deep --json stdout 被污染**
  - 证据：`src/commands/research.ts` 全文不 import `isJsonMode`，SSE 事件循环大量无守卫 `console.log`（`:980-1058`、`:1087-1102`、`:1116-1162`），真正 JSON 只在末尾 `output()`（`:1203`）。`--json | jq` 必挂。
  - 修复：json 模式整体跳过人类可读渲染，或全部循环内 console.log 加 `if (!isJsonMode())` 守卫。
  - 难度：中。

- **L13 chat --json 无结构化输出**
  - 证据：`src/commands/chat.ts:36-42` 始终 `process.stdout.write(delta)` 流式，无 `isJsonMode` 分支、不调 `output()`。与 CLAUDE.md"所有命令支持 --json"矛盾。
  - 修复：json 模式收集全文，末尾 `output({ answer })`。
  - 难度：小。

- **M-C4 REPL 行处理并发竞态**
  - 证据：`src/core/repl.ts:396` async line handler 执行期间 readline 不暂停、无 busy 标志（grep 无 pause/resume/busy），粘贴多行/快速回车会并发进多个 handler，输出交错。
  - 修复：加 busy 标志 + 队列，或执行前 `rl.pause()`、完成后 `resume()`。
  - 难度：中。

- **L10 意图识别 symbol 为 null 时静默空操作**
  - 证据：`src/core/natural-dispatch.ts:34-43` 三分支 `if (res.symbol) await ...`，symbol 缺失且 needs_symbol=false 时零输出，用户看到完全沉默。
  - 修复：else 分支打印"未识别到股票代码"提示。
  - 难度：小。

- **L11 以 exit/quit/help 开头的整句误触发内置命令**
  - 证据：`src/core/repl.ts:290/407-424` 取首词判定内置命令，`exit 仓位`/`quit 现在` 直接退出、`help 分析茅台` 进帮助丢弃后文、`clear/reset 持仓` 清屏。
  - 修复：仅整行 trim 后全等匹配（`args.length === 0 && cmdName === ...`）。
  - 难度：小。

### 批次 4 — 安全加固（纯 CLI 可修，含 1 项需飞书侧操作）

- **M-S1 自定义 base URL 不校验 scheme**
  - 证据：`src/config.ts:239-263` `setConfigValue` 对 URL 类键无 scheme 校验，`src/api.ts:94` 附 `Bearer` header，baseUrl 为 `http://` 时 token 明文传输。
  - 修复：`setConfigValue`/`loadConfig` 对 URL 键校验非 localhost 必须 https。
  - 难度：小。

- **L7 飞书 webhook 硬编码在仓库**
  - 证据：`scripts/notify-feishu.sh:3` 完整 webhook token 明文入库。
  - 修复：改读环境变量；**且需在飞书侧重置/吊销该已泄漏 webhook**（已进 git 历史，仅改文件不够）。
  - 难度：小 + 需飞书侧操作。

- **L1 REPL 历史明文记录 login --token \<jwt\>**
  - 证据：`src/core/repl.ts:443` `appendHistory(line.trim())` 把含 JWT 整行写入 `repl_history`，readline 内存 history 也留明文。
  - 修复：对含敏感参数的行脱敏或跳过 appendHistory。
  - 难度：小。

- **L2 config set auth.token 明文回显 stdout**
  - 证据：`src/commands/config.ts:13-20` set 回显 `${key} = ${value}` 无脱敏，项目已有 `maskSecret`/`isSecretConfigKey`（`config.ts:54-61`）但 set 未复用。
  - 修复：`isSecretConfigKey(key) ? maskSecret(value) : value`。
  - 难度：小。

- **L3 服务端错误原文未过滤（ANSI 注入）**
  - 证据：`src/api.ts:113-120` 等把 `res.text()`/`json.error` 原样塞进 ApiError，`src/errors.ts:97-104` `printError` 直接 console.error，无 ANSI/控制字符剥离。恶意/被劫持后端可注入终端控制序列。
  - 修复：printError 或 ApiError 构造处 strip `\x1b`/控制字符 + 截断。
  - 难度：小（低危）。

- **L4 device flow 轮询间隔无下限钳制**
  - 证据：`src/browser-login.ts:66` 直接采用服务端 `poll_after_ms`，无 `Math.max(value, 1000)` 下限，服务端返回极小值会高频轮询。
  - 修复：`Math.max(value, 1000)`。
  - 难度：小。

- **L5 Windows 用 cmd /c start 打开 URL**
  - 证据：`src/browser-login.ts:121-127` win32 分支为 `cmd /c start "" url`，含 `&` 的 URL 会解析出错。
  - 修复：改 `explorer.exe <url>`（本机 macOS，无法实测 Windows）。
  - 难度：小。

- **L6 --password/--token 留在 shell history / ps**
  - 证据：`src/index.ts:118-121/133-134` login 支持 `--token`/`--password` 明文参数并在示例演示。
  - 修复：help/文档标注风险（保留 device-flow 为首选路径）。
  - 难度：小（文档层）。

### 批次 5 — 局部正确性 / 一致性（纯 CLI 可修）

- **L14 扣费失败统一"未知错误"**
  - 证据：积分不足**已区分**（`billing.ts:369` 抛 `InsufficientCreditsError`，三入口显式 catch）；但"后端不可用/RPC 失败"仍抛通用 `Error("扣费失败:…")`（`billing.ts:482`）→ 落"未知错误"兜底。
  - 修复：区分后端不可用与积分不足。
  - 难度：小（部分成立）。

- **L15 classifyError 对 InsufficientCreditsError/PlanAccessError 无分支**
  - 证据：`src/errors.ts:12-95` 无这两个 `name` 分支。`PlanAccessError`（`billing.ts:233`，`assertWatchlistCapacity` 抛）**全仓库无 catch**，触发即落"未知错误"，丢失升级引导文案。
  - 修复：classifyError 顶部加两个 `instanceof` 分支透传 message/suggestion。
  - 难度：小。

- **L16 硬编码 0.04（+ 文案矛盾未定位）**
  - 证据：`src/commands/credits.ts:99` 写死 `(cost * 0.04)`，未复用已有的 `creditDollarValue()`（`billing.ts:256`）。"文案与字段名矛盾"审计**未定位到明确点**，需原作者补充或视为已消解。
  - 修复：credits.ts 改用 `creditDollarValue(cost)`。
  - 难度：小。

- **L21 withBilling 非原子 + 扣费失败丢弃已产出结果**
  - 证据：`src/billing.ts:386-401` `assertSufficientCredits → fn() → applyDeduction` 查扣间非原子；`applyDeduction` 抛错时 `result`（`:391`）被丢弃，调用方 catch 后 return，已生成的正文/扫描结果不展示（而服务端可能已扣费，见 H2）。真正扣减在 RPC 内原子（不会超扣）。
  - 修复：先展示已产出结果，扣费失败降级为告警而非吞结果。
  - 难度：中。

- **L12 本地状态非原子写 + repl_history/activity 无限增长**
  - 证据：`src/core/session.ts:65`、`src/tracker.ts:43` 直接 `writeFileSync` 覆盖，无 tmp+rename；`repl.ts:71` appendHistory 无截断（MAX_HISTORY=500 只限内存条数不限文件）；`tracker.ts:38` records 从不裁剪。
  - 修复：tmp 写入后 rename；历史/activity 按上限截断。
  - 难度：小-中。

- **L17 poly search 无兜底、polyGet 丢 status**
  - 证据：`src/poly/commands.ts:93` `res.data.map(...)` 无 `?? []`（同文件其它 render 都有）；`src/poly/api.ts:27-31` catch 只 `throw new PolyApiError(err.message)`，丢原始 HTTP status（构造器 status 形参从未传）。
  - 修复：`res.data ?? []`；PolyApiError 带上 status。
  - 难度：小。

- **L18 poly percent() 量纲待与后端确认**
  - 证据：`src/poly/format.ts:20-23` 一律 `value * 100`，假设后端返回 0-1 小数，若某字段已是百分数会翻 100 倍。
  - 修复：**待与 poly 后端确认字段量纲**后处理（见"待后端确认"章节）。
  - 难度：小（阻塞在确认）。

- **L19 补全脚本含 v1 已下线命令**
  - 证据：`src/commands/completion.ts:15`（bash）、`:37-57`（zsh）列出 quote/market/scan/predict/news/research/watchlist/insights/watch/export 等 RFC-2026-0003 已下线命令；反向**缺失**实际存在的 chat/token/doctor/poly。
  - 修复：补全命令列表对齐当前实际命令（chat/quick-scan/full/deep/login/logout/whoami/token/doctor/credits/poly/completion/config）。
  - 难度：小。

- **L20 MCP 熔断器全局共享 + canUseBackendMcp symbol 形参未用**
  - 证据：`src/data/mcp-client.ts:70-71` `failureCount`/`circuitOpenUntil` 模块级全局，一只股票失败熔断所有股票；`:298` `canUseBackendMcp(symbol?)` 的 symbol 在函数体从未引用。
  - 修复：熔断状态按 symbol/维度隔离或明确设计意图；移除未用形参或落实其语义。
  - 难度：小-中。

- **L22 normalizeConfidence 量纲歧义**
  - 证据：`src/commands/research.ts:73-78` 用 `confidence > 1` 猜百分数/小数，`confidence === 1` 无法区分 1% 与 100%，被多处调用。
  - 修复：统一上游入参量纲契约，去掉猜测式归一。
  - 难度：小（需确认上游各调用点量纲）。

## 待后端确认（隔离项，不作为 CLI 独立任务）

以下项 CLI 侧无法单方面正确修复，需先与后端对齐。合并入本 RFC 仅为登记与追踪，实施前必须拿到后端结论。

- **H2 chat/quick-scan 双重扣费（确认）**
  - 跨仓库核对坐实：CLI `withBilling` 主动扣一次（`chat.ts:33`/`product.ts:28` → `consume_credits_atomic`）；服务端 `v1-scan-stock`/`v1-chat` 代理旧 EF 也扣一次（`consumeServer`/`consumeMeteredServer`，透出 `X-Credit-Cost`）。后端 RFC-0010 规定"扣费一律服务端权威，前端永不直接扣费"。
  - **CLI 侧修复方向明确且不必须后端配合**：删除 chat/quickScan 的 `applyDeduction`，改为消费服务端 `meta.billing`/`X-Credit-Cost` 头做展示。**列此处仅因需后端确认"服务端计费口径已稳定、CLI 可安全下掉本地扣费"**，避免误删后变成不扣费。
  - 优先级：最高（涉及真实重复扣费）。

- **H3 orchestrator fallback 不扣费**
  - `research.ts:1210-1280` catch 走 `runFallback` 并行跑 7 分析师，全程无 `applyDeduction`；默认 Railway `/v1/orchestrator` 也无服务端扣费。fallback 下全免费产出。
  - 待确认：fallback 路径是否应计费、按什么口径（部分产出/全价）。

- **M-S2 计费/付费端点重试无幂等保护**
  - `consume_credits_atomic` 本身不重试且不传幂等键（`billing.ts:476` `p_task_id: null`）；但付费数据端点 `v1-scan-stock`/`stock-research` 经带重试的 `callEdge`（`api.ts:66-139`，5xx/网络错误重试 2 次）发起，上游已扣费后重试会再次触发服务端扣费。
  - 待确认：`consume_credits_atomic` 是否支持幂等键去重（需后端 RPC 支持）。CLI 侧可先对付费端点禁用自动重试（不必须后端）。

- **M-C5 计费边界不一致（两子项）**
  - (a) SSE 中途 error 后部分报告仍全价扣（`research.ts:1165/1200`）；(b) 扣费 RPC 失败被 catch 误判为引擎失败 → 触发 fallback 重跑分析师。
  - 待确认：部分产出的计价/退款策略需后端配合；控制流修复（区分"数据产出失败"与"扣费失败"，后者不进 fallback）可纯 CLI。

- **L18 poly percent() 量纲**（见批次 5，阻塞在 poly 后端字段量纲确认）

## 文档治理（随本 RFC 一并处理）

- 删除 `docs/BACKLOG.md`（本 RFC 取代之）。
- 更新 RFC 状态字段：**RFC-2026-0003 / RFC-2026-0004 文件头仍标 Draft，但代码已在 0.4.0 落地**，应改为 Implemented/Accepted，并同步 `rfcs/INDEX.md` 统计。
- 重写或归档 `docs/ROADMAP.md`：停留在 v0.2.0-beta（2025-01-15），列满已下线命令与 OpenBB/MCP Server，与 0.4.0 现状严重冲突。
- 核对 `CHANGELOG.md` 措辞矛盾：某版本段落称"移除 mcp-client.ts"，但该文件仍存在且在用；"下线 MCP Server"与保留后端 MCP 取数链口径不一致。
- 顺带（审计发现，非清单项）：`src/config.ts:43/190` `data.provider` 仍保留 `"openbb"` 选项，与 v1 下线 OpenBB 有残留，是否清理待定。

## 实施顺序与验收

- 批次 1 → 2 → 3 → 4 → 5，一批一 PR，从 `main` 切 `fix/<名>`。
- 每项验收：能复现的问题先写复现测试（看它失败→修到通过），无法测的说明原因与残留风险。
- "待后端确认"章节的项**不进上述批次**，待后端结论后单独开条目。
- 修改 `src/` 触发项目演绎法流程（查 `.deductive/acs/rules.json` → 写验收要点等确认 → 测试 + 代码 → 验证）。

## 未决问题

- L16 "文案与字段名矛盾"审计未定位到具体点，需原作者确认或判定已消解。
- L22 各调用点量纲需逐一核对上游契约。
- `stock-research` EF 在 `arti/supabase/functions/` 下无同名目录（可能已改名/下线），独立影响 H3 fallback 可用性，需后端核对。
