# RFC-2026-0009: CLI 接入 Backend Agent Harness

## 元数据

- **RFC 编号**: RFC-2026-0009
- **标题**: CLI 接入 Backend Agent Harness
- **作者**: zhe
- **状态**: Implementing
- **创建日期**: 2026-07-25
- **最后更新**: 2026-07-26
- **关联 Issue**: N/A
- **关联 PR**: N/A
- **关联 RFC**: RFC-2026-0003、RFC-2026-0007、RFC-2026-0008
- **取代**: N/A
- **被取代**: N/A

## 摘要

本 RFC 将 ARTI CLI 的全景研报和深度研报从同步 `/v1/orchestrator` 切换到生产 Backend Agent Harness 的异步研报任务链。普通 Chat 继续使用现有 `/v1-chat`，CLI 不指定模型、不决定执行路径、不计算费用，也不在第一版提供运行中的用户调整。

长期保留“用户接入自己的模型”方向，但当前优先让 CLI 复用 ARTI 已有的 Chat、数据工具、Agent Harness、质量门禁和服务端计费。

## 动机

### 问题陈述

CLI 当前的 `/full`、`/deep` 仍直接调用同步 orchestrator，并在客户端预取、拼装股票上下文。这条链路绕过了已经落地的异步 Agent Harness、任务持久化、质量门禁、服务端扣费和失败退款：

1. CLI 与 Web 产品没有共用同一条研报生产链。
2. 研报等待期间无法获得稳定 task ID，终端中断后不能恢复查看。
3. CLI 维护旧的分析师事件和上下文拼装，容易与后端 Agent Harness 漂移。
4. 当前同步 Railway orchestrator 处于临时免费窗口，不满足服务端权威计费原则。

### 用户故事

- 作为 CLI 用户，我希望 `/full NVDA` 和 `/deep NVDA` 使用 ARTI 当前的 Agent Harness，而不是旧同步编排链。
- 作为长任务用户，我希望看到真实任务状态，并在中断后通过 task ID 恢复查看。
- 作为自动化调用方，我希望 `--json` 仍输出单一、可解析的最终结果。
- 作为付费用户，我希望扣费、缓存和失败退款全部由后端决定。

## 数据：当前实现与后端契约

以下结论以 2026-07-25 的 CLI `main`、本地 Backend 代码和生产 OpenAPI 为准：

| 事实 | 当前实现 | 目标 |
|---|---|---|
| 普通 Chat | Supabase Edge `/v1-chat` SSE | 保持不变 |
| 全景/深度研报 | Railway `/v1/orchestrator` SSE | Backend 异步研报任务 |
| 客户端上下文 | CLI 预取并发送 `stockData` | Harness 通过数据工具自行取证 |
| 任务创建 | 无持久 task ID | `POST /v1/generate-report` |
| 任务查询 | 无 | `GET /v1/report/{taskId}` |
| 执行路径 | CLI 选择同步 orchestrator | 后端 rollout 决定 `legacy` / `agent_harness` |
| 计费 | 同步 orchestrator 临时免费 | 创建任务时服务端权威扣费，失败时服务端退款 |
| 结果 | SSE 分析师/大师事件 | 统一 `report_tasks.result` |

后端 canonical report type：

| CLI 能力 | `reportType` |
|---|---|
| `/full`、`arti full` | `panorama` |
| `/deep`、`arti deep` | `deep` |

## 规则：设计约束

### R1：Chat 与研报分开接入

- 普通对话继续调用 `/v1-chat`。
- quick-scan 继续调用现有产品函数。
- 只有 full/deep 切换到异步研报任务链。

### R2：CLI 不决定 Harness rollout

- CLI 不强制发送 `executionPath=agent_harness`。
- 后端根据用户 assignment、环境默认值和报告类型决定实际执行路径。
- CLI 可以展示后端返回的执行路径，但不能据此改变计费或结果。

### R3：第一版不可中途调整

- 用户只能在创建任务前表达研究重点。
- 运行中不提供 pause、steer、continue、cancel。
- Harness 内部可以选择工具、子智能体、补证据和重试。
- `progress` 只用于观察，不作为客户端控制协议。

### R4：长任务必须可恢复

- 创建成功后立即得到并展示 task ID。
- 前台轮询直到 done、failed 或本地等待超时。
- Ctrl+C 只停止本地等待，不取消后端任务。
- 外层 `arti report <taskId>` 和会话内 `/report <taskId>` 可以恢复查看。

### R5：自动化输出保持稳定

- TTY 模式展示进度和最终人类可读报告。
- `--json` stdout 只输出一次最终 JSON。
- 进度不得污染 JSON stdout。
- 返回的最终 JSON 包含 task 元数据和后端原始 result。

### R6：服务端权威计费

- CLI 不硬编码 full/deep 价格。
- HTTP 402 显示余额不足。
- 缓存命中、扣费、退款和任务去重由后端决定。

## 差距

| 能力 | 当前 | 本 RFC |
|---|---|---|
| 创建异步研报 | 无 | 新增任务 API 客户端 |
| 轮询状态 | 无 | 根据 task 状态轮询 |
| 真实进度 | 同步 SSE 文案 | 根据后端 status/progress 展示 |
| 中断恢复 | 无 | `report <taskId>` |
| Harness 结果渲染 | 只支持旧事件聚合 | 渲染统一 report result |
| Artifact | 来自旧 orchestrator 聚合 | 保存 task + result |
| 运行中调整 | 无 | 明确不做 |

## 产出物

1. `ReportTask` 请求、状态和结果类型。
2. 创建与查询 Backend 研报任务的 API 客户端。
3. full/deep 共用的任务等待器。
4. `report <taskId>` 外层命令和 `/report <taskId>` Slash Command。
5. Harness 任务终端渲染和 Artifact digest。
6. JSON、错误、中断和回归测试。

## 详细设计

### 总体流程

```text
用户输入 /full 或 /deep
          │
          ▼
POST /v1/generate-report
  ├─ 鉴权
  ├─ 服务端扣费/缓存
  ├─ 创建 report task
  └─ 后端决定 execution path
          │
          ▼
GET /v1/report/{taskId}（轮询）
  ├─ pending / processing → 展示真实进度
  ├─ done → 渲染 result + 写 Artifact
  └─ failed → 展示后端错误
```

### 任务状态

```typescript
type ReportTaskStatus = "pending" | "processing" | "done" | "failed";

interface ReportTask {
  taskId: string;
  symbol: string;
  reportType: string;
  status: ReportTaskStatus;
  progress?: unknown;
  error?: string | null;
  result?: unknown;
}
```

CLI 只把上述字段作为外部契约消费，不复制 Backend Harness 的内部 trace schema。对未知 progress 字段保持兼容。

### 等待与恢复

- 默认每 2 秒查询一次。
- TTY 模式在同一个 spinner 中更新状态。
- 本地达到等待上限时停止轮询并打印 task ID，不修改后端任务。
- `arti report <taskId>` 只读取已有任务，不创建或重复扣费。
- `/report <taskId>` 与外层命令复用同一查询和渲染逻辑。

### 结果与 Artifact

完成后 JSON 形状：

```json
{
  "taskId": "...",
  "symbol": "NVDA",
  "reportType": "panorama",
  "status": "done",
  "progress": {},
  "result": {}
}
```

会话内 full/deep 将该 payload 保存为对应 Artifact。digest 只提取标的、报告类型、结论、风险和 task ID；完整 result 不直接进入活跃上下文。

## 实现计划

### Phase 1：任务 API 与轮询

- [x] 增加创建和查询任务 API。
- [x] 处理 401、402、404、失败状态和本地超时。
- [x] 增加任务 API 契约测试。

### Phase 2：full/deep 切换

- [x] `/full`、`arti full` 发送 `panorama`。
- [x] `/deep`、`arti deep` 发送 `deep`。
- [x] 移除新链路中的客户端 stockData 预取。
- [x] 完成结果渲染和 Artifact。

### Phase 3：恢复查看

- [x] 增加 `arti report <taskId>`。
- [x] 增加 `/report <taskId>`。
- [x] 验证中断后恢复不创建新任务、不重复扣费。

## 验收标准

1. 普通问题仍走现有 Chat，不受本次变更影响。
2. full/deep 创建后端研报任务并展示 task ID 和任务状态。
3. CLI 不强制选择 Harness 路径，实际路径由后端返回。
4. 完成后终端显示可读报告，`--json` 输出单一合法 JSON。
5. 会话内完成的研报写入 Artifact，后续对话只引用 digest。
6. 中断本地等待后可通过 task ID 恢复查看。
7. 余额不足、任务失败、任务不存在和登录失效有明确错误。
8. 测试账号由后端 assignment 命中 `agent_harness` 后完成生产 smoke test。

## 测试策略

- **单元测试**：请求映射、状态解析、进度文案、结果 digest。
- **集成测试**：pending → processing → done、failed、402、404。
- **回归测试**：Chat、quick-scan、Slash、Session Artifact、`--json`。
- **真实验证**：测试账号执行 panorama/deep，确认后端返回的 execution path 为 `agent_harness`。

## 权衡与替代方案

### 方案 A：异步任务 + 前台轮询（选中）

**优点**：

- 直接复用现有生产 Harness。
- 任务可持久化、可恢复。
- 计费和失败退款回到后端权威链路。

**缺点**：

- 进度更新受轮询间隔限制。
- 终端需要适配异步长任务。

### 方案 B：创建后立即返回 task ID

**优点**：

- CLI 实现最小。

**缺点**：

- 人类用户无法直接看到结果。
- 与当前同步命令体验差异过大。

**结论**：不选。

### 方案 C：后端新增 SSE 和运行中调整

**优点**：

- 进度更实时，未来可支持 steer。

**缺点**：

- 需要新的后端状态机和控制协议。
- 阻塞当前 CLI 接入。

**结论**：第一版不选，后续单独 RFC。

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| 后端 rollout 未命中 Harness | 中 | 高 | 展示实际 execution path；用测试账号 assignment 验收 |
| 长任务中断 | 高 | 中 | 展示 task ID，提供 report 恢复命令 |
| progress schema 演进 | 中 | 低 | 只依赖稳定顶层字段，未知字段忽略 |
| Harness 结果与旧终端渲染不一致 | 中 | 中 | 以统一 result 为输入编写契约测试 |
| JSON stdout 被进度污染 | 低 | 高 | JSON 模式进度仅写 stderr，最终只输出一次 |

## 依赖关系

### 前置依赖

- RFC-2026-0003：CLI 是生产后端瘦客户端。
- RFC-2026-0007：计费完全由服务端决定。
- RFC-2026-0008：Slash、Session 和 Artifact 已落地。
- Backend `/v1/generate-report` 与 `/v1/report/{taskId}` 已部署。

### 非依赖

- 不依赖用户自带模型。
- 不依赖新的 Agent SDK。
- 不依赖后端 steer/cancel 接口。
- 不依赖 Docker、Python 或本地数据处理。

## 安全性考虑

- 只向已配置的 HTTPS Backend 发送 Bearer token。
- CLI 不记录 token、完整请求 header 或 Harness 内部 trace。
- task 查询必须继续由后端校验任务所有者。
- 错误信息不输出内部工具参数和敏感服务信息。

## 性能影响

- CLI 每个活跃任务每 2 秒发起一次轻量状态查询。
- 不再由 CLI 预取股票上下文，减少一次客户端数据链。
- 研报总耗时由后端队列和 Harness 决定。

## 可观测性

CLI 可见：

- task ID、报告类型、后端状态、已完成阶段、实际 execution path。

后端权威：

- 队列耗时、Harness 工具调用、Judge、质量门禁、计费和退款。

## 文档影响

- [x] `README.md`：说明异步研报和恢复命令。
- [x] `AGENTS.md`：说明 agent 调用 full/deep 时需要等待最终 JSON。
- [x] `CLAUDE.md`：更新研报数据链。
- [x] `CHANGELOG.md`：记录 full/deep 后端切换。
- [x] 命令帮助和 Slash 帮助。

## 开放问题

1. 后端何时将 `agent_harness` 从测试账号 assignment 扩大到更多用户，由后端 rollout 单独决定。
2. 运行中调整、取消和服务端主动推送不属于本 RFC。

## 未来展望

- 后端增加检查点后，可设计 `/steer`、`/continue`、`/cancel`。
- Agent Harness 稳定后，可让外部 Chat/Agent 通过同一任务能力调用 ARTI。
- 用户自带模型只作为未来模型层扩展，不改变 ARTI 对数据、证据和金融能力的控制。

---

## 讨论记录

### 2026-07-25 - zhe / Codex

讨论了两条长期开放方向：用户模型接入 ARTI，或开放 ARTI 数据能力。确认长期倾向用户模型接入 ARTI，但近期不实施；当前优先让 CLI 接入已有 Chat 和 Backend Agent Harness。

同时确认 Agent Harness 第一版不提供用户运行中调整。Harness 内部可以动态选择工具、子智能体和补证据，但用户只能在任务开始前表达重点，CLI 最终交付报告。

**决策**：采用异步任务 + 前台轮询；不修改后端、不开放 steer，执行路径和计费继续由后端权威决定。

## 实施记录

### 实施开始

- **日期**: 2026-07-25
- **负责人**: Codex
- **分支**: `feat/backend-agent-harness`

### CLI 第一版完成

- **日期**: 2026-07-26
- **验证**: 39 个测试文件、154 个测试通过；构建与命令帮助检查通过。
- **待完成**: 后端将测试账号分配到 `agent_harness` 后，执行一次可能扣费的生产 smoke test，再将 RFC 标记为 Implemented。
