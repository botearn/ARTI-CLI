# RFC-2026-0007: 移除 CLI 本地扣费，计费一律服务端权威

## 元数据

- **RFC 编号**: RFC-2026-0007
- **标题**: 移除 CLI 本地扣费，计费一律服务端权威
- **作者**: zhe
- **状态**: Draft
- **创建日期**: 2026-07-23
- **最后更新**: 2026-07-23
- **关联 Issue**: 后端 orchestrator 补服务端扣费（待建，见"待后端跟进"）
- **关联 PR**: N/A（开 PR 后回填）
- **取代**: 修正 RFC-2026-0006 "待后端确认"章节的 H2 双重扣费项
- **被取代**: N/A
- **上游依据**: backend RFC-2026-0010「Credits 扣费一律服务端权威」（Accepted）

## 摘要

CLI 目前对 chat / quick-scan / full / deep 四个能力在**客户端侧又扣了一次费**（`billing.ts` 直连 Supabase `consume_credits_atomic` RPC），而服务端也在扣，构成双重扣费。这违反后端 RFC-2026-0010 的不变量 1（"前端只读余额，永不调用 `consume_*`"）。本 RFC 移除 CLI 侧所有本地扣费逻辑，计费完全交给服务端。

## 背景与现状（已跨仓库核对，2026-07-23）

四能力对应三条后端链路，服务端扣费情况不一致：

| 能力 | 后端链路 | 服务端是否扣费 | CLI 本地扣费 |
|---|---|---|---|
| chat | Edge `v1-chat`→`chat` | ✅ 已扣（`consumeServer`/`consumeMeteredServer`） | ✅ 有（双扣） |
| quick-scan | Edge `v1-scan-stock`→`scan-stock` | ✅ 已扣（`consumeServer`） | ✅ 有（双扣） |
| full | Railway `/v1/orchestrator` | ❌ **不扣** | ✅ 有（唯一扣费点） |
| deep | Railway `/v1/orchestrator` | ❌ **不扣** | ✅ 有（唯一扣费点） |

CLI 本地扣费入口：`src/billing.ts` 的 `consume_credits_atomic` 直连（踩 RFC-0010 §4 红线）。调用点：`chat.ts`（withBilling）、`product.ts`（withBilling）、`research.ts:862/912/1264`（assertSufficientCredits + applyDeduction ×2）。

## 决策

**移除 CLI 四个能力的全部本地扣费**（用户已知情拍板）：

1. **展示**：下掉本地扣费后，命令结尾**不再展示**"本次消耗 X / 余额 Y"。因此**无需**改 `api.ts` 去消费服务端透出的 `billing` SSE 事件 / `meta.billing`——改造范围收窄为纯移除。
2. **chat / quick-scan**：服务端已扣费，直接下掉 CLI 扣费即消除双扣，无副作用。
3. **full / deep**：⚠️ **接受临时免费窗口**。Railway `/v1/orchestrator` 当前不扣费，下掉 CLI 扣费后 full/deep 变免费，直到后端补上服务端扣费。此风险用户已知情接受，并配套后端 issue 跟踪（见下）。

### 为什么不保留 full/deep 的 CLI 扣费

一致性优先：保留会让 CLI 仍踩 RFC-0010 红线、代码里留半套扣费机制，反而更难维护。用户选择一次性下掉、用后端 issue 兜住免费窗口。

## 详细设计

### 移除（扣费动作）
- `src/commands/chat.ts`：去掉 `withBilling` 包裹，直接跑流式；移除 `printDeductResult` 调用与相关 import。
- `src/commands/product.ts`：quick-scan 去掉 `withBilling`，直接 `scanStockBackend` + 渲染。
- `src/commands/research.ts`：移除 `assertSufficientCredits`（:862）、两处 `applyDeduction`（:912/:1264）、`printDeductResult`；清理随之无用的 `featureKey`/`billingState` 参数链（`runOrchestrator`/`runFallback` 签名）。
- `src/billing.ts`：移除只服务于扣费的导出——`withBilling`、`applyDeduction`、`checkAndDeduct`、`assertSufficientCredits`、`printDeductResult`、内部 `consumeCreditsAtomic`、`FEATURE_ACTIONS`、`DeductResult`、`BillingBackendError`（仅扣费失败用）。

### 保留（只读余额，符合 RFC-0010）
- `getActiveBillingState`（credits 命令、REPL banner 读余额）、`PLANS`、`getFeatureCost`、`formatCredits`、`formatPlanLimit`、`creditDollarValue`、`getBillingPath`、`PlanAccessError` + `assertWatchlistCapacity`（自选股容量，非扣费）、`InsufficientCreditsError`（保留供 classifyError 分类，即使不再主动抛也无害；如确认无处抛出可一并移除）。

### 连带清理
- `src/errors.ts`：`BillingBackendError` 分类分支随类型移除而删（若移除该类型）。
- 测试：`tests/billing.test.ts`（applyDeduction/withBilling 相关用例）、`tests/errorClassify.test.ts`（BillingBackendError 用例）相应删除或调整。

## 验收要点（业务语言）

1. `arti chat <问题>`：正常出答案，**不再有** CLI 侧扣费,结尾**无**"消耗/余额"行；服务端仍扣一次（不再双扣）。
2. `arti quick-scan <代码>`：正常出研判，同上。
3. `arti full <代码>` / `arti deep <代码>`：正常出报告，CLI 不扣费（临时免费，已知）。
4. `arti credits`：仍能正确显示余额与套餐（只读能力保留）。
5. REPL 启动 banner 仍能显示余额。
6. 全仓库不再有任何 `consume_*` 调用（RFC-0010 红线清零）。

## 风险

- **full/deep 临时免费**：已知并接受；后端补扣费前存在白嫖窗口。用后端 issue 跟踪，合并前在 CHANGELOG 标注。
- **积分不足的前置拦截消失**：此前 CLI 会 `assertSufficientCredits` 提前挡下；移除后由服务端在扣费时返回不足错误，CLI 通过 `classifyError` 展示。chat/quick-scan 的服务端会返回相应错误；full/deep 免费期间不涉及。

## 待后端跟进（不属本 RFC 的 CLI 改动）

在后端仓库建 issue：给 Railway `/v1/orchestrator` 补上 server-authoritative 扣费（`report_panorama`/`report_stock` 口径，或改走已扣费的 `/v1/generate-report`），并按 RFC-0045 透出 `billing`。后端就绪后关闭 full/deep 免费窗口。

## 实施顺序

1. 本 RFC 评审。
2. `fix/remove-cli-local-billing` 分支：改 chat/product/research → 清理 billing.ts/errors.ts → 更新测试。
3. `npm run build` + `npm test` 通过。
4. CHANGELOG 标注 full/deep 临时免费。
5. 开 PR + 后端 issue。
