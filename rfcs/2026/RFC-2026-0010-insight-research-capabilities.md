# RFC-2026-0010: CLI 引入 ARTI Insight 与 ARTI Research

## 元数据

- **RFC 编号**: RFC-2026-0010
- **标题**: CLI 引入 ARTI Insight 与 ARTI Research
- **作者**: zhe
- **状态**: Draft
- **创建日期**: 2026-07-29
- **最后更新**: 2026-07-29
- **关联 Issue**: N/A
- **关联 PR**: N/A
- **关联 RFC**: RFC-2026-0008、RFC-2026-0009
- **姊妹 RFC**: 产品与 Backend 仓库待创建
- **取代**: N/A
- **被取代**: N/A

## 摘要

本 RFC 为 ARTI CLI 增加 `ARTI Insight` 与 `ARTI Research` 两种正式能力，使用户既能通过普通对话获得即时回答，也能把单个金融问题转成结构化专业判断，或围绕一个主题持续追问并形成版本化研究报告。

本 RFC 不修改、不重命名、不迁移现有 `full` 与 `deep`；不讨论用户自带模型。CLI 继续作为生产后端的瘦客户端，Insight 的判断、Research 的项目状态与报告版本、执行路径和计费均由服务端权威管理。

## 假设与边界

以下假设必须在评审阶段显式确认，不能在实现中静默选择其他解释：

1. **我假设 `ARTI Chat`、`ARTI Insight`、`ARTI Research` 是三种执行契约，而不是三个模型或三个品牌别名。**
2. **我假设 Insight 是一次性任务**：输入标的、问题和分析时点，输出结构化判断。
3. **我假设 Research 是长期资源**：保存研究目标、约束、历史输入和报告版本，可跨 CLI 重启与设备恢复。
4. **我假设普通 Chat 仍是默认入口**；只有用户显式调用或确认升级时，才进入 Insight 或 Research。
5. **我假设现有 `full/deep` 保持兼容且不参与本 RFC 的产品映射**；实现可以复用底层基础设施，但不能让 API 和用户语义互相冒充。
6. **我假设 Research 的原文与版本真源在服务端**；CLI 本地 Session 和 Artifact 只负责交互、缓存与上下文引用。
7. **我假设计费继续由后端决定**；CLI 不硬编码价格，也不从 Token usage 推导 Credits。
8. **我假设 Insight 对用户表现为同步等待，但服务端内部采用可恢复的异步 Run**；CLI 前台等待并展示事件，断线后按 `runId` 恢复。
9. **我假设复用的是通用 Agent Runtime，而不是现有股票研报适配层**；Insight 与 Research 必须有独立 Skill、输入和结果契约。

## 数据：产品能力定义

根据 ARTI Enterprise API 产品页，三种能力的稳定差异不是“回答长短”，而是执行形态、输入和产出物：

| 能力 | 用户目标 | 执行形态 | 输入 | 产出 |
|---|---|---|---|---|
| ARTI Chat | 快速回答与连续追问 | 同步流式 | 消息与对话上下文 | 自然语言回答 |
| ARTI Insight | 专业判断 | 单次分析 | 标的、问题与分析时点 | 结构化判断 |
| ARTI Research | 持续研究 | 异步任务与多轮迭代 | 研究主题、约束与追问 | 版本化研究报告 |

典型使用：

- Chat：金融问答、新闻解释、内容摘要。
- Insight：标的诊断、事件影响、风险评估。
- Research：公司深研、主题研究、报告修订。

## 规则：从能力定义推导出的约束

### R1：一个对话入口，三种执行契约

- 用户进入 `arti` 后，普通文本默认进入 Chat。
- Insight 和 Research 使用显式 Slash Command。
- Chat 可以建议升级能力，但不能未经确认创建付费或长期任务。
- 升级后复用当前 Session 中与主题相关的摘要和 Artifact，不要求用户重复描述背景。

### R2：Insight 必须交付结构化判断

Insight 不是更长的 Chat。最小产出必须包含：

- 标的或分析对象；
- 用户问题；
- 数据与判断时点；
- 核心结论；
- 支持证据；
- 反证或主要分歧；
- 风险；
- 置信状态；
- 来源或证据引用。

评级、目标价格和有效期必须消费产品后端已有的统一判断契约；CLI 不另造术语或计算公式。

### R3：Research 必须是可恢复、可演进的资源

Research 不是一次性深度报告。服务端至少需要保存：

- 研究项目 ID；
- 研究目标、范围和约束；
- 活动标的与数据时点；
- 用户追问和研究输入；
- 引用的 Insight / 数据 /报告 Artifact；
- 当前运行状态；
- 当前报告版本；
- 版本历史与每次修订摘要。

一次追问可以只更新研究上下文，也可以触发新的研究运行。是否启动可能扣费的运行必须由用户显式操作或确认。

### R4：报告版本不可覆盖

- 新报告版本必须引用上一版本。
- 历史版本保持只读，不能被新运行覆盖。
- 新版本记录新增证据、结论变化、风险变化和未解决问题。
- “继续研究”创建新运行或新版本，不修改已完成任务结果。

### R5：本地 Session 不充当服务端 Research 数据库

- CLI Session 可以保存 `researchId`、最近状态和 Artifact digest。
- CLI 不复制完整服务端 Research 历史作为权威真源。
- `/resume` 恢复本地对话；`/research resume` 恢复服务端研究项目，两者语义分开。
- 同一 Research 可以被 Web、CLI 或外部 Agent 读取与继续。

### R6：付费与副作用显式授权

- 用户显式 `/insight`、`/research run` 视为发起对应能力。
- Chat 建议升级时必须展示能力、作用和服务端报价，再由用户确认。
- Research 中的普通追问默认只更新对话；不能因为一句自然语言自动触发昂贵任务。
- 幂等、扣费、缓存与失败退款全部由服务端处理。

### R7：自动化接口与交互接口共用能力

- 会话内 Slash 与外层命令调用同一客户端函数和后端契约。
- `--json` stdout 保持单一、可解析；进度只写 stderr。
- 外部 Agent 不模拟 REPL 输入，使用外层命令与结构化输出。

### R8：`full/deep` 暂时保持独立

- 不把 `full` 重命名为 Insight。
- 不把 `deep` 重命名为 Research。
- 不删除或隐藏现有命令。
- 是否长期迁移、合并或下线，必须基于真实使用数据另写 RFC。

## 差距：CLI 当前能力与目标

| 目标 | 当前能力 | 缺口 |
|---|---|---|
| Chat | 已接入 `/v1-chat`、Session、Usage、Compact、Artifact | 保持现状 |
| Insight | quick-scan 和一次性报告能提供部分分析 | 没有独立命令、结构化判断契约和专属后端能力 |
| Research Project | 本地 Session 可持续对话 | 没有服务端研究项目、目标与约束 |
| Research Run | `full/deep` 可创建一次异步报告任务 | 没有基于 Research 版本和追问创建新运行的契约 |
| Report Version | Artifact 保存单次结果 | 没有服务端版本号、父版本与修订摘要 |
| 跨端恢复 | `report <taskId>` 可恢复单任务 | 不能列出和继续长期研究项目 |
| 能力升级 | Chat 可提示显式 full/deep | 没有 Chat → Insight → Research 的确认协议 |

真实代码核对后，差距进一步收敛为：

| 层 | 可直接复用 | 存在但不满足 | 完全缺失 |
|---|---|---|---|
| CLI | CommandDef、Slash、Session、Artifact、异步任务轮询 | Artifact 类型只有 quick/full/deep/poly；`commands/research.ts` 是未注册的旧研报实现，存在源码命名冲突 | Insight 命令、Research 项目模式与服务端恢复 |
| 产品 Internal API | JWT、SSE、Usage、Billing、Chat Context | `AnswerKind`、AI Judgment、Share Artifact 都只覆盖现有能力 | Insight/Research endpoint typed SoT |
| Backend Runtime | AgentLoop、ToolBroker、Judge、durable event、幂等 Run、取消与所有者查询 | `POST /v1/agent-runs` 只接受 `symbol + panorama/deep`，Run 创建仍绑定 `report_tasks` | Insight/Research 的 Domain Service 与 Skill |
| Report Pipeline | 原子创建 task/job/扣费、worker 恢复、质量事件 | worker registry、缓存键、结果装配都强绑定现有 report type | Research Project、Input、Run 关联与不可变版本 |
| 判断层 | 统一评级、目标价、期限和 `ai_judgment` 快照 | 只适合具备 symbol、价格和期限的方向性判断 | Insight 的证据、反证、风险和非方向性结论存储 |

## 产出物

本 RFC 完成后应形成：

1. Insight 请求与结构化结果契约。
2. Research Project、Research Input、Research Run、Report Version 数据模型。
3. 后端 Internal API endpoint 与错误语义。
4. CLI 外层命令、Slash Command 和 Research 模式状态机。
5. Chat → Insight → Research 的升级与确认规则。
6. 服务端权威计费、幂等、所有者鉴权和可观测性要求。
7. 产品仓库与 ARTI_backend 的姊妹 RFC。

## 详细设计

### 总体架构

```text
普通文本 ───────────────► ARTI Chat ───────────────► 流式回答
                              │
                              │ 用户显式升级 / 确认
                              ▼
/insight ───────────────► ARTI Insight ────────────► Insight Artifact
                              │
                              │ 作为研究证据
                              ▼
/research start/resume ─► Research Project
                              │
              普通追问 ───────┤ 保存 Research Input
                              │
              /research run ──┤ 创建异步 Research Run
                              ▼
                       Report Version N
```

CLI 只负责：

- 收集输入、展示状态和显式确认；
- 持有本地 Session；
- 保存服务端结果的 Artifact digest；
- 通过 `researchId` 和 `runId` 恢复。

服务端负责：

- Insight 判断与证据；
- Research 项目、输入、运行和报告版本；
- 用户所有权与跨端恢复；
- 执行路径、计费、幂等、缓存和退款；
- 数据时点、来源和质量状态。

### 领域层与执行层分离

后端已有 `/v1/agent-runs`、durable event、result 与 cancel，证明执行控制面可以复用。但当前创建链同时生成 `report_tasks`，且请求、worker、结果均限制为 `panorama/deep`。因此目标结构分成两层：

```text
领域层
  Insight Service ───────► Insight Run / Insight Result
  Research Service ──────► Project / Input / Report Version
            │
            ▼
执行层
  Agent Runtime ─────────► Run / Event / Result / Cancel
            │
            ▼
  Capability Skill + Data Tools + Judge
```

规则：

- 领域 endpoint 创建和读取 Insight/Research 资源。
- Agent Runtime 只负责一次可恢复执行，不承担 Research 项目语义。
- Insight/Research 可以复用现有 Run 事件协议，但不能通过伪造 `report_type` 进入 worker。
- `report_tasks` 继续只保存现有报告；是否把 `agent_harness_runs` 从 `report_tasks` 解耦，由 Backend 姊妹 RFC 定义迁移。
- CLI 不直接拼装 Agent Contract，也不选择分析角色；它只发送用户问题、研究资源 ID 和幂等键。

### Insight 概念契约

```typescript
interface InsightRequest {
  symbol?: string;
  question: string;
  asOf?: string;
  context?: {
    sessionId?: string;
    artifactIds?: string[];
    summary?: string;
  };
}

interface InsightResult {
  insightId: string;
  runId: string;
  status: "completed" | "completed_with_gaps";
  subject: {
    symbol?: string;
    name?: string;
  };
  question: string;
  asOf: string;
  verdict: {
    summary: string;
    rating?: string;
    confidence: "high" | "medium" | "low" | "insufficient";
    aiJudgmentId?: string;
  };
  evidence: Array<{
    claim: string;
    sourceId?: string;
    observedAt?: string;
  }>;
  counterEvidence: string[];
  risks: string[];
  unresolvedQuestions: string[];
  sources: Array<{
    id: string;
    title: string;
    url?: string;
    publishedAt?: string;
  }>;
}
```

`aiJudgmentId` 只在结果满足统一判断层的 symbol、价格、期限和方向性要求时出现。完整 Insight 不能塞进 `ai_judgment`：事件影响、风险评估或行业问题未必包含可结算目标价，而 Insight 仍需要保存证据、反证与未决问题。

创建 Insight 的 API 返回 `202 + insightId + runId`。CLI 随后读取 Run 事件并在前台等待，所以用户体验仍是“同步分析”；网络断开不会丢失任务。

### Research 概念模型

```typescript
interface ResearchProject {
  id: string;
  title: string;
  objective: string;
  scope?: string;
  constraints: string[];
  activeSymbols: string[];
  status: "active" | "archived";
  currentVersion: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ResearchInput {
  id: string;
  researchId: string;
  content: string;
  artifactIds: string[];
  createdAt: string;
}

interface ResearchRun {
  id: string;
  researchId: string;
  agentRunId: string;
  baseVersion: number | null;
  inputIds: string[];
  status:
    | "queued"
    | "running"
    | "completed"
    | "completed_with_gaps"
    | "failed"
    | "cancelled";
  createdAt: string;
  completedAt?: string;
}

interface ResearchReportVersion {
  researchId: string;
  version: number;
  parentVersion: number | null;
  runId: string;
  artifactId: string;
  changeSummary: string;
  evidenceAdded: string[];
  conclusionsChanged: string[];
  unresolvedQuestions: string[];
  createdAt: string;
}
```

现有 `report_tasks` 不能直接充当这些表：

- 它没有 objective、constraints、input、baseVersion 与 parentVersion。
- 其缓存和在途去重键是 `user + symbol + report_type + execution_path`，无法区分两次不同研究修订。
- 其 result 会被规范化为 panorama/deep 股票报告，无法表达非股票主题和版本差异。
- Research Run 可以引用一次通用 Agent Run，但 Project 与 Report Version 必须有独立真源。

### CLI 交互

```text
arti> 腾讯最近怎么样
      # Chat

arti> /insight 00700.HK 微信商业化是否重新加速？
      # 单次结构化判断

arti> /research start 腾讯游戏与 AI 的三年增长逻辑
      # 创建 Research Project，并进入 Research 模式

arti[research:腾讯游戏与AI]> 加入 Meta 广告 AI 作为对照
      # 保存 Research Input，不自动发起昂贵运行

arti[research:腾讯游戏与AI]> /research run
      # 展示服务端报价并显式创建 Research Run

arti[research:腾讯游戏与AI]> /research report
      # 查看当前版本
```

建议的会话内命令：

| 命令 | 语义 |
|---|---|
| `/insight <subject> <question...>` | 创建一次 Insight |
| `/research start <topic...>` | 新建并进入 Research |
| `/research resume [researchId]` | 列出或恢复 Research |
| `/research status` | 查看目标、当前版本和运行状态 |
| `/research run [focus...]` | 基于未处理输入创建新运行 |
| `/research report [version]` | 查看指定报告版本 |
| `/research history` | 查看版本与修订摘要 |
| `/research leave` | 退出 Research 模式，返回普通 Chat |

建议的外层自动化命令：

```bash
arti insight <subject> <question...> --json
arti research start <topic...> --json
arti research ask <researchId> <message...> --json
arti research run <researchId> [focus...] --json
arti research status <researchId> --json
arti research report <researchId> [--version N] --json
arti research list --json
```

### 服务端 API 形状

以下定义领域资源边界。执行状态、事件与取消复用 Agent Runtime 控制面：

```text
POST /v1/insights
GET  /v1/insights/{insightId}

POST /v1/research-projects
GET  /v1/research-projects
GET  /v1/research-projects/{researchId}
POST /v1/research-projects/{researchId}/inputs
POST /v1/research-projects/{researchId}/runs
GET  /v1/research-projects/{researchId}/runs/{runId}
GET  /v1/research-projects/{researchId}/reports
GET  /v1/research-projects/{researchId}/reports/{version}

GET  /v1/agent-runs/{runId}
GET  /v1/agent-runs/{runId}/events
GET  /v1/agent-runs/{runId}/result
POST /v1/agent-runs/{runId}/cancel
```

不建议让 CLI 直接调用一个扩展成“万能请求体”的 `POST /v1/agent-runs`。领域 create endpoint 更容易校验 Insight 问题、Research 版本和所有权，并在同一事务中建立领域资源、Run、队列与扣费。

创建 Insight、Research Run 等可能产生副作用的请求必须要求 `Idempotency-Key`。所有查询必须按当前用户验证所有权，不能只凭资源 ID 读取。领域响应应返回 `runId` 与标准 `statusUrl/eventsUrl/resultUrl`，避免 CLI 猜路径。

### Research 模式状态机

```text
ordinary_chat
  └─ research start/resume ─► research_idle
                                  ├─ 普通文本 ─► input_saved ─► research_idle
                                  ├─ run ─► awaiting_confirmation
                                  │             ├─ reject ─► research_idle
                                  │             └─ accept ─► running
                                  │                            ├─ completed ─► version_saved
                                  │                            └─ failed
                                  └─ leave ─► ordinary_chat
```

CLI 退出或网络断开不能取消服务端运行。恢复时使用 `researchId` 与 `runId` 查询，不重新创建任务。

## 后端代码验证结果

验证基线：

- 产品仓 `origin/dev@5f54bc581852`
- ARTI_backend `origin/dev@7d71f3c8163f`
- 验证日期：2026-07-29

### 1. 产品定义已确认，生产契约尚未建立

`src/lib/enterprise-api-product.ts` 与本 RFC 的三分法一致：

- Chat：同步流式自然语言回答；
- Insight：标的、问题与分析时点输入，分钟内形成结构化判断；
- Research：保存目标与历史，由追问触发新一轮多视角研究并形成报告版本。

但 `src/lib/internal-api-contract.ts` 没有 Insight/Research endpoint，`src/lib/answer-kind.ts` 也没有对应种类。产品页当前是能力定义，不是可直接消费的 API 文档。

结论：

- 增加 `insight` AnswerKind。
- 增加 `research` AnswerKind 表示一次 Research Run 的产出；Research Project 本身不是 AnswerKind。
- 不映射为 `panorama` 或 `deep`。

### 2. 统一判断层只能成为 Insight 的可选投影

`src/lib/ai-judgment-contract.ts` 当前来源仅包括 predict、quick scan、panorama 与 deep，且判断快照围绕 symbol、价格、期限和方向性预测设计。

结论：

- Insight 必须有独立 Result typed SoT。
- 当一次 Insight 产生符合统一判断契约的评级或目标价时，再写入 `ai_judgment` 并由 `aiJudgmentId` 关联。
- 非方向性的事件影响、风险或主题判断不得伪造价格预测来满足 schema。

### 3. 通用 Agent Runtime 可复用

Backend 已有：

- `AgentRunContract`：objective、input context、工具白名单、deliverable schema 与预算；
- `AgentLoop`、ToolBroker、subagent、Judge 与 retry；
- `AgentRunStore`：所有者查询、幂等、结果、事件、取消；
- `/v1/agent-runs/{runId}`、`events`、`result`、`cancel`；
- 公共事件 `run/agent/tool/judge/refine/output` 与 SSE cursor 恢复。

这些能力足以作为 Insight/Research 的执行底座，无需再造第二套 Agent Runtime。

### 4. 当前 Agent Run 创建与研报管线强绑定

`POST /v1/agent-runs` 当前：

- 必须提供 symbol；
- 只接受 panorama/deep；
- 仅对已分配 `agent_harness` rollout 的用户开放；
- 原子创建 `report_tasks + procrastinate job + credits + agent_harness_run`；
- 返回的 `taskId` 是 report task。

`ReportGenerationService` 与 worker registry 也只注册 flash、panorama、deep、premarket、postmarket。未知类型会显式报错。

结论：读取/事件/取消控制面可以复用；创建和 worker dispatch 必须先从 report domain 解耦，不能只往 report type 枚举追加两个字符串。

### 5. 当前 Harness 只能把用户输入当股票研报关注点

`agent_report_generation_service.py` 会读取 `raw_user_input`，但仍：

- 要求 symbol；
- 根据 panorama/deep 固定选择 level2/level3；
- 使用股票大师圆桌；
- 强制覆盖 panorama/deep 产品章节；
- 把结果装配为 `PanoramaReportResult` 或 `StockReportResult`。

结论：底层 runtime 可用，当前 roundtable/report adapter 不可直接作为 Insight/Research 产品实现。需要独立：

- Insight Skill、deliverable schema 与质量门；
- Research Planner/Synthesizer Skill；
- 读取上一版本、未处理输入与证据差异的 context builder；
- Insight Result 与 Research Report Version assembler。

### 6. Research 服务端资源不存在

产品仓 RFC-0043 仍是 Draft，且其 `research_threads` 设计偏向按用户和 symbol 归档报告，不包含本 RFC 所需的 objective、constraints、follow-up 与 parent version；代码与 migration 中也没有实现。RFC-0057 的服务端 Conversation Memory 同样未落地。

现有 `report_tasks` 没有 Research 关联和版本字段，本地 CLI Session 也不能成为跨端真源。

结论：产品姊妹 RFC 应修订或取代 RFC-0043 的资源模型，不能把“报告收藏夹”直接宣称为 ARTI Research。

### 7. 现有计费事务可复用其规则，不可复用其 report 表假设

当前 Backend 在同一数据库事务中创建 report task、队列任务、扣费和 agent run；余额不足会整体回滚，幂等 replay 在扣费前返回已有 Run。这是新能力应保留的资损边界。

但当前价格 action 由 report type 映射，Research 的缓存/去重也不能继续只按 symbol 和 report type。

结论：

- 新能力 action 与价格继续由服务端 SoT 决定。
- Research Run 幂等请求必须包含 `researchId + baseVersion + inputIds + focus` 的稳定请求哈希。
- 只有真正创建新 Run 才扣费；状态、事件、报告读取和重复幂等请求不扣费。
- 失败退款沿用后端规则，但必须关联新的 Run，而不是要求伪造 report task。

### 8. 发现两处现有漂移

- Backend `apps/api/API_MAP.md` 未列出代码中已存在的 `/v1/agent-runs` 路由。
- CLI 存在未注册的旧 `src/commands/research.ts` 与相关测试；用户当前不能通过 CommandDef 调用它，但它会与新 ARTI Research 的源码命名冲突。

实施前应先明确：

- 更新 Backend API Map；
- 新 CLI 实现使用 `commands/insight.ts` 与 `commands/research-project.ts`，避免把旧一次性研报实现误当成新 Research；旧模块清理由独立、可验证的兼容任务处理。

## 实现计划

### Phase 0：跨仓 RFC 与 typed SoT

- [ ] 完成 CLI、产品和 ARTI_backend 姊妹 RFC。
- [ ] 在产品仓库定义 Insight/Research endpoint、结果、错误和状态 typed SoT。
- [ ] 定义 AnswerKind、判断与报告版本的 canonical 映射。
- [ ] 在 Backend 定义领域资源与 Agent Runtime 的关联方式，解除 Run 创建对 `report_tasks` 的强依赖。
- [ ] 把 `/v1/agent-runs` 补入 Backend API Map，并确认其数据库 RPC/migration 的仓库真源。
- [ ] 增加跨仓契约 drift test。

验收：三个仓库对资源 ID、状态、错误、计费和幂等语义没有分歧。

### Phase 1：ARTI Insight

- [ ] 实现服务端 Insight Domain Service、Skill、质量门与结构化结果。
- [ ] 领域 create endpoint 原子创建 Insight、Agent Run、队列与后端计费记录。
- [ ] 增加 `arti insight` 和 `/insight`。
- [ ] CLI 消费 Run 事件；断线后按 `insightId/runId` 恢复。
- [ ] Insight 结果保存为当前 Session Artifact。
- [ ] 后续 Chat 只注入 Insight digest。

验收：同一请求稳定输出结论、证据、反证、风险、时点和来源；TTY、非 TTY 与 `--json` 行为清晰。

### Phase 2：Research Project 与持续输入

- [ ] 新增服务端 Research Project、Input 和列表/恢复 API。
- [ ] 建立 owner-only RLS、分页、并发版本检查与软归档。
- [ ] CLI 增加 `/research start/resume/status/leave`。
- [ ] Research 模式的普通文本保存为项目输入。
- [ ] Web、CLI 和外部 Agent 可以读取同一 Research。

验收：CLI 重启或换设备后，可恢复目标、约束、输入和当前版本。

### Phase 3：Research Run 与版本化报告

- [ ] 基于 Research 目标、base version、未处理输入与 focus 创建异步运行。
- [ ] 新增 Research Planner/Synthesizer Skill 与版本差异质量门。
- [ ] 产出不可覆盖的 Report Version。
- [ ] 提供状态、恢复、历史与指定版本读取。
- [ ] 记录版本差异、证据变化和未解决问题。

验收：围绕同一项目完成两轮研究，第二版引用第一版并明确变化；重试不重复建任务或扣费。

### Phase 4：Chat 能力升级

- [ ] Chat 可以提出 Insight 或 Research 升级建议。
- [ ] 复用服务端报价、确认与幂等协议。
- [ ] CLI 与非交互 Agent 都能处理 confirmation-required。

验收：普通问题不会自动触发付费能力；显式确认后任务可恢复并落成 Artifact。

## 测试策略

### 契约测试

- Insight/Research 请求、结果、状态和错误枚举跨仓一致。
- 未知字段向前兼容；必填字段缺失时显式失败。
- CLI 不复制服务端价格或评级枚举。

### 行为测试

- 普通文本默认 Chat。
- `/insight` 只创建一次 Insight。
- Research 模式普通文本只保存输入，不自动创建运行。
- `/research run` 显式创建任务。
- 中断后按同一 ID 恢复，不产生重复副作用。
- 新版本不覆盖旧版本。

### 权限与资损测试

- 用户不能读取、追加或运行其他用户的 Research。
- 重复幂等键只返回同一资源。
- Credits 不足不创建运行。
- worker 失败按服务端规则退款。

### 生产 Smoke Test

- Insight：美股、港股、A 股各验证一个标的和一个事件问题。
- Research：创建项目、追加两次输入、生成 v1、继续追问、生成 v2。
- 跨端：Web 创建，CLI 恢复；CLI 创建，外部 Agent 读取。
- 计费：确认创建、重复请求、失败退款和只读查询分别核对余额。

## 权衡与替代方案

### 方案 A：正式建立 Insight 与 Research 资源（选中）

优点：

- 语义与产品页一致；
- Web、CLI、外部 Agent 共用契约；
- Research 可以跨设备、版本化和长期演进；
- 不把本地 Session 误当生产数据库。

缺点：

- 需要产品与 Backend 跨仓改造；
- 必须新增数据模型、API、权限和版本治理；
- Research 需要更完整的成本与质量观测。

### 方案 B：把 `full/deep` 改名

优点：

- CLI 改动很小；
- 可以快速出现新命令。

缺点：

- 一次性报告不等于持续 Research；
- Insight 的输入输出也不等于现有 full；
- 名称升级但能力没有升级，会伤害用户信任。

结论：不选。

### 方案 C：只在 CLI 本地实现 Research

优点：

- 不需要后端数据库；
- 可以复用当前 Session 和 Artifact。

缺点：

- 无法跨设备；
- 本地损坏或清理会丢失研究真源；
- Web 和外部 Agent 无法共享；
- 计费、权限和版本容易漂移。

结论：不选。

### 方案 D：让 Chat 自动决定一切

优点：

- 表面交互最简单。

缺点：

- 用户不知道何时创建付费或长期任务；
- 一次回答、一次判断和长期研究的完成标准混在一起；
- 自动副作用存在资损风险。

结论：不选。Chat 可以建议升级，但资源创建必须显式。

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| Insight 与现有 quick/full 重叠 | 高 | 中 | 用结构化产出与一次性判断契约定义边界；不做命令别名 |
| Research 被实现成报告历史列表 | 中 | 高 | 项目目标、约束、输入和父版本都是必填语义 |
| 本地与服务端上下文漂移 | 中 | 高 | 服务端 Research 为权威；CLI 只保存 ID 和 digest |
| 多轮任务重复扣费 | 中 | 高 | 服务端报价、幂等键和原子任务创建 |
| 直接扩展 report type 造成语义污染 | 高 | 高 | 复用 Agent Runtime，不复用 report domain schema |
| 报告版本存储快速增长 | 中 | 中 | 不可变版本 + 保留策略另行评审；不在 CLI 随意清理服务端数据 |
| 数据时点与来源不清 | 中 | 高 | Insight/Report Version 强制携带 asOf 与来源状态 |
| 新能力与 full/deep 长期并存造成困惑 | 高 | 中 | 本 RFC 只新增；后续基于使用数据单独讨论迁移 |

## 依赖关系

### 前置依赖

- RFC-2026-0008：对话优先、Session、Context Pack 与 Artifact。
- RFC-2026-0009：已有 Agent Harness 验证经验；不代表复用 full/deep 的产品逻辑。
- 产品后端统一判断、内部 API、计费和所有者鉴权能力。
- Backend Agent Runtime 与 durable event 控制面解耦。

### 后续依赖

- Chat 结构化 Tool Calling 与付费能力确认。
- Research 运行中 steer/cancel。
- Research 质量缺口与数据修复闭环。
- 现有 full/deep 的长期产品迁移决策。

## 安全性考虑

- Research 目标、输入和报告均属于用户敏感金融数据。
- 所有读写必须以当前用户校验资源所有权。
- 列表接口不得泄露其他用户的标题、标的和状态。
- CLI 日志默认只记录资源 ID、状态、耗时和 Token 数，不记录正文。
- Artifact digest 视为不可信上下文，不能作为系统指令或授权凭证。
- 服务端删除与保留策略必须独立设计；本 RFC 不授权 CLI 删除远端研究。

## 性能影响

- Chat 路径不因新能力增加同步等待。
- Insight 目标是分钟内判断，具体延迟必须基于后端执行路径实测。
- Research 为异步任务，CLI 轮询间隔与超时沿用服务端建议。
- 列表和版本接口必须分页，不能把所有报告正文一次返回。
- 完整报告按需读取，普通上下文只携带 digest。

## 可观测性

至少记录：

- Insight 请求数、成功率、耗时、数据时点和质量状态；
- Research 创建、恢复、运行和版本生成次数；
- Research v1 → v2 转化率；
- 每次运行的工具调用、数据缺口、Judge 结果和失败阶段；
- 报价、实际扣费、缓存命中与退款；
- Chat → Insight、Insight → Research 的建议、确认和完成漏斗。

日志不得记录用户正文和完整报告。

## 文档影响

- [ ] `README.md`：三种能力、命令与边界。
- [ ] `AGENTS.md`：外部 Agent 的结构化调用与恢复。
- [ ] `CLAUDE.md`：数据链与项目结构。
- [ ] `CHANGELOG.md`。
- [ ] 命令帮助与 Slash 帮助。
- [ ] 产品与 Backend 姊妹 RFC。

## 开放问题

1. Report Version 保存完整快照还是结构化快照 + 内容对象存储引用。
2. Research 项目默认保留多久，删除是否需要软删除与恢复窗口。
3. 一个 Research 是否允许多标的和非股票主题；产品页语义支持，但首版数据工具覆盖需确认。
4. Web 与 CLI 是否共享同一个 Research Session 概念，还是只共享 Project。
5. `agent_harness_runs` 的数据库 RPC/migration 当前不在已核对仓库中，正式真源在哪里。
6. Agent Run 是否改为可关联多种 domain task，还是新增通用 `capability_runs`；推荐前者，但需先核对线上表约束。
7. 旧 `src/commands/research.ts` 是保留、重命名还是删除；它没有注册为当前用户命令，但仍有测试依赖。

## 参考资料

- [ARTI Enterprise API](https://www.artifin.ai/enterprise-api)
- RFC-2026-0008：对话优先 CLI、Slash Command 与 Token 感知会话
- RFC-2026-0009：CLI 接入 Backend Agent Harness
- 产品仓 RFC-0043：Research Artifact 与 Agent API（Draft）
- 产品仓 RFC-0057：Conversation Context 与 Memory Continuity（Draft）
- 产品仓 RFC-0061：AI Judgment Source of Truth
- Backend：`apps/api/handlers/agent_run_handler.py`、`modules/agent_runtime/`、`modules/reporting/`

---

## 讨论记录

### 2026-07-29 - zhe / Codex

确认暂不考虑用户自带模型。CLI 目标是同时提供简单对话、一次性结构化 Insight 和可持续追问、版本化产出的 Research；现有 full/deep 暂不纳入本轮讨论。

**决策**：先建立 Insight/Research 独立契约并阅读后端真实代码，再决定实现与复用边界。

### 2026-07-29 - Backend 代码核对

已核对产品仓与 ARTI_backend 的 `origin/dev`：

- 产品页定义支持 Chat / Insight / Research 三种独立执行契约；
- Agent Runtime 的 Contract、事件、Judge、幂等、取消与恢复可复用；
- 当前 Agent Run 创建、report task、worker 和结果 assembler 均强绑定 panorama/deep；
- Research Project 与版本资源尚不存在；
- `ai_judgment` 只能作为部分 Insight 的可选方向性投影。

**结论**：后续实现复用底层 Agent Runtime，不修改现有 Harness 的 full/deep 逻辑，不把 Insight/Research 做成 report type 别名。

## 实施记录

尚未开始实施。

## 变更历史

| 日期 | 作者 | 变更内容 |
|---|---|---|
| 2026-07-29 | zhe / Codex | 创建 Insight/Research 产品定义与 CLI 交互初稿 |
| 2026-07-29 | zhe / Codex | 核对产品仓与 Backend 代码，收紧 Runtime 复用、领域资源和分阶段实施边界 |
