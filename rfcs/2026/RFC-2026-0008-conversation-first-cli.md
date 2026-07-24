# RFC-2026-0008: 对话优先 CLI、Slash Command 与 Token 感知会话

## 元数据

- **RFC 编号**: RFC-2026-0008
- **标题**: 对话优先 CLI、Slash Command 与 Token 感知会话
- **作者**: zhe
- **状态**: Draft
- **创建日期**: 2026-07-24
- **最后更新**: 2026-07-24
- **关联 Issue**: N/A
- **关联 PR**: N/A
- **关联 RFC**: RFC-2026-0003、RFC-2026-0005、RFC-2026-0007
- **取代**: N/A
- **被取代**: N/A

## 摘要

本 RFC 将 ARTI CLI 从“REPL 中混用裸命令和自然语言”演进为“对话优先、Slash Command 控制、外层命令兼容自动化”的交互模型。CLI 将引入可持久化会话、服务端权威 Token usage、上下文压缩和研报 Artifact，使自然语言对话、显式快捷命令与 agent/脚本调用共用同一套能力执行链。

本 RFC 不移除 `arti quick-scan AAPL --json` 等外层命令，不在第一阶段引入新的 TUI 框架或数据库，也不改变现有 Credits 定价规则。

## 动机

### 问题陈述

ARTI CLI 已经具备对话式 REPL，但交互模型仍停留在“命令行能力的交互壳”：

1. `full AAPL`、`deep TSLA` 等裸命令和普通自然语言共用同一个输入空间，命令与对话存在歧义。
2. 自由文本先经过 `classify-intent` 返回字符串意图，再由 CLI 分支调用能力；这不是可以持续扩展的对话工具调用模型。
3. 会话历史只保留内存中的最近 12 条消息，退出后无法恢复，也不按 Token 容量管理。
4. CLI 不知道真实 input/output/cache Token，也无法展示上下文占用、主动压缩或解释成本。
5. full/deep 等大结果直接面向终端输出，没有成为可追问、可引用、但又不挤占上下文的会话 Artifact。

如果只把 `full` 改名为 `/full`，只能改善外观，不能解决会话连续性、Token 管理和能力复用问题。

### 用户故事

- 作为交互用户，我希望输入 `/deep NVDA` 明确触发深度研报，不经过意图猜测。
- 作为交互用户，我希望直接问“那风险是什么”，系统能结合前一轮标的和研报继续回答。
- 作为长会话用户，我希望用 `/status` 查看上下文占用，用 `/compact` 压缩历史而不是机械丢弃旧消息。
- 作为返回用户，我希望用 `/resume` 恢复之前的投研会话。
- 作为 agent 或脚本作者，我希望现有 `arti <command> --json` 保持稳定，不需要模拟交互终端。
- 作为付费用户，我希望显式 `/deep` 视为我主动调用；如果模型准备自动调用昂贵能力，则先展示费用并请求确认。

## 数据：当前实现

以下结论以 2026-07-24 的 `main` 为准：

| 事实 | 当前实现 | 局限 |
|---|---|---|
| 无参数启动 | `arti` 进入 REPL | 已具备 conversation-first 外壳 |
| 命令注册 | `CommandDef` 同时注册 Commander 和 REPL | REPL 命令没有 `/` 命名空间 |
| 输入分发 | 首词命中命令则执行，否则走 `classify-intent` | 裸命令与自然语言可能冲突 |
| 会话历史 | `MAX_CHAT_MESSAGES = 12`，只在内存保存 | 不持久化、不按 Token 管理 |
| Session 文件 | `session.json` 只保存 `lastCommand` | 不能 `/resume` |
| Chat API | `v1-chat` 接收调用方提供的 `messages` | CLI 负责上下文，但没有上下文模型 |
| SSE usage | `billing` 和未知事件被忽略 | 无 Token、上下文和模型使用统计 |
| 研报结果 | 直接渲染或输出 JSON | 没有 Artifact 引用和摘要层 |
| 外层自动化 | `arti quick-scan/full/deep --json` | 这是应保留的稳定接口 |

关键代码位置：

- `src/index.ts`：统一 `CommandDef` 和外层 CLI 入口。
- `src/core/registry.ts`：Commander/REPL 共用注册。
- `src/core/repl.ts`：输入解析、内存聊天历史、`/clear`。
- `src/core/session.ts`：只持久化最后命令。
- `src/core/natural-dispatch.ts`：字符串意图分发。
- `src/api.ts`：`v1-chat` SSE 解析。
- `src/commands/research.ts`：full/deep 流式研报与终端渲染。

## 规则：从需求推导出的设计约束

### R1：交互控制面与自动化接口分离

- 会话内快捷动作统一使用行首 `/command`。
- 外层 `arti <command> --json` 保留，继续服务 agent、脚本和 CI。
- 两个入口调用同一个能力执行器，不能复制业务实现。

### R2：Slash Command 不进入模型上下文

- `/help`、`/status`、`/usage`、`/clear`、`/new`、`/resume`、`/exit` 在本地执行。
- `/quick`、`/full`、`/deep`、`/poly` 直接调用对应能力，不先经过模型或 `classify-intent`。
- 只有 Slash Command 产生的结构化结果摘要可以进入后续上下文。

### R3：自然语言是对话数据面

- 非 `/` 开头输入始终视为用户消息。
- 第一阶段可继续复用 `classify-intent`，但最终目标是由对话运行时产生结构化 tool call。
- 用户文本中间出现 `/deep` 不应触发命令。

### R4：Token 与 Credits 是两个概念

- Token usage 表示模型输入、输出、缓存和上下文占用。
- Credits 表示 ARTI 产品余额和业务定价。
- `/usage` 展示 Token；`/credits` 展示 Credits。
- Token 统计以实际调用模型的服务端为权威，CLI 不引入 provider 专用 tokenizer 猜测真实用量。

### R5：原始大结果不直接进入活跃上下文

- quick/full/deep/poly 的完整结构化结果保存为 Artifact。
- 活跃上下文只注入短摘要、标的、数据时间、结论、风险和 Artifact 引用。
- 用户追问细节时再按需读取 Artifact。

### R6：付费能力必须区分显式与模型发起

- 用户输入 `/full` 或 `/deep`，视为显式授权调用。
- 自然语言触发模型准备调用需付费的 full/deep 时，必须先展示服务端报价并确认。
- 本 RFC 不在 CLI 硬编码价格，也不改变 RFC-2026-0007 的服务端权威计费原则。

### R7：第一阶段不引入重型基础设施

- 继续使用 Node.js 标准库和现有 `readline`。
- 本地会话使用 JSONL，不新增 SQLite 或 TUI 框架依赖。
- 云端会话同步、跨设备续聊和多人共享不属于第一阶段。

## 差距

| 能力 | 当前 | 目标 | 所属阶段 |
|---|---|---|---|
| Slash 解析 | 仅 `/clear` 和 `/` 帮助 | 行首 `/command` 独立控制面 | Phase 1 |
| 补全 | 补全裸命令 | 输入 `/` 展示和过滤命令 | Phase 1 |
| 会话持久化 | 仅内存 6 轮 | JSONL transcript + session index | Phase 2 |
| 新建/恢复 | 无 | `/new`、`/resume` | Phase 2 |
| Token usage | 无 | 服务端真实 usage + `/usage` | Phase 2 |
| 上下文容量 | 固定消息条数 | Token budget + `/status` | Phase 2 |
| 压缩 | 截断最旧消息 | 结构化 summary + `/compact` | Phase 3 |
| 研报引用 | 只打印结果 | Artifact + digest | Phase 3 |
| 工具调用 | 字符串意图分支 | 统一 Capability Executor | Phase 4 |
| 付费确认 | 命令直接执行 | 模型发起的昂贵能力先确认 | Phase 4 |

## 产出物

实施前需要先确定以下产出物和契约：

1. Slash Command 注册表与解析规则。
2. `ConversationSession`、JSONL 事件和 Artifact 元数据结构。
3. `v1-chat` Token usage/context SSE 契约。
4. 上下文组装与 compact summary 契约。
5. CLI/Slash/模型 tool call 共用的 Capability Executor。
6. REPL 裸命令迁移说明和用户文档。

## 详细设计

### 总体架构

```text
                        ┌──────────────────────────┐
                        │   Capability Executor    │
                        │ quick/full/deep/poly/... │
                        └────────────▲─────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           │                         │                         │
┌──────────┴──────────┐   ┌──────────┴──────────┐   ┌──────────┴──────────┐
│ 外层 CLI             │   │ Slash Control Plane │   │ Conversation Runtime │
│ arti full --json     │   │ /full /status ...   │   │ 用户消息 → tool call │
│ agent / script / CI  │   │ 人类显式控制         │   │ 模型自动选择能力      │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
```

### 输入路由

REPL 输入只分两类：

```text
trimmed.startsWith("/") ? dispatchSlashCommand() : dispatchConversationTurn()
```

规则：

- 仅行首 `/` 有特殊含义。
- `/` 单独输入时打开命令列表。
- 未知 `/command` 返回确定性错误和相近命令，不发送给模型。
- 需要发送字面量 `/` 开头文本时，使用 `//text`，解析后向模型发送 `/text`。
- Slash 参数第一阶段沿用当前空白分词，不支持 shell 展开、重定向或命令执行。

### Slash Command 目录

| 命令 | 类型 | 行为 | 上下文影响 |
|---|---|---|---|
| `/help [command]` | 本地 | 查看命令 | 无 |
| `/status` | 本地 | 会话、模型、上下文占用 | 无 |
| `/usage` | 本地 | 当前轮和累计 Token usage | 无 |
| `/credits` | 远端只读 | 查询产品余额 | 无 |
| `/quick <symbol>` | 能力 | 快速扫描 | 写入摘要 + Artifact |
| `/full <symbol>` | 能力 | 全景研报 | 写入摘要 + Artifact |
| `/deep <symbol>` | 能力 | 深度研报 | 写入摘要 + Artifact |
| `/poly <args...>` | 能力 | 预测市场查询 | 写入摘要 + Artifact |
| `/compact [focus]` | 会话 | 压缩旧上下文 | 写入 summary boundary |
| `/new [title]` | 会话 | 保存当前会话并新建 | 新上下文 |
| `/resume [session]` | 会话 | 恢复历史会话 | 加载 context pack |
| `/clear` | 会话 | 清空上下文并开始新会话 | 新上下文 |
| `/cls` | 本地 | 只清终端屏幕 | 无 |
| `/exit` | 本地 | 保存并退出 | 无 |

`/clear` 与 `/cls` 必须分开，避免“清屏”和“清上下文”语义混淆。

### 技术契约

数据结构、JSONL 事件、上下文组装、Artifact、统一能力执行器和 `v1-chat` SSE 示例集中在 [RFC-2026-0008 技术契约附录](../assets/RFC-2026-0008-contracts.md)，避免主 RFC 超过评审可读范围。

主 RFC 对附录施加以下约束：

- Session 目录 `0700`，会话与 Artifact 文件 `0600`。
- transcript 使用 append-only JSONL，索引原子更新，损坏单行可跳过恢复。
- compact 只改变活跃 context pack，不销毁原始 transcript。
- 服务端负责真实 Token 统计和请求前上下文检查，CLI 负责展示与压缩触发。
- full/deep 原文保存为 Artifact，活跃上下文只放 digest。
- 旧 `v1-chat` 请求继续有效；新增字段可选，新增 SSE 事件可忽略。
- `billing` 与 `usage` 永远分离，不能从 Token 推导 Credits。
- 模型发起付费能力先确认；用户显式 `/full`、`/deep` 视为授权。

## 实现计划

### Phase 1：Slash Control Plane

- [x] 给现有能力注册表增加 `slashName`。
- [x] 实现仅识别行首 `/` 的解析器。
- [x] 增加 `/` 补全和命令列表。
- [x] 实现 `/help`、`/quick`、`/full`、`/deep`、`/poly`、`/credits`、`/cls`、`/exit`。
- [x] 保持所有外层 Commander 命令和 `--json` 输出不变。

### Phase 2：Session 与 Usage

- [x] 增加本地 JSONL session store 和 index。
- [x] 实现 `/new`、`/resume`、`/clear`、`/status`、`/usage`。
- [x] 扩展 `v1-chat` usage SSE 客户端契约；服务端未发送时明确显示未知。
- [x] 把固定 12 条历史替换为 context pack。
- [x] 保证非 TTY 和 `--json` 不输出交互状态。

### Phase 3：Compact 与 Artifact

- [x] 实现结构化 `ConversationSummary`。
- [x] 实现手动 `/compact [focus]`；第一版不自动压缩。
- [x] 将 Slash quick/full/deep/poly 结果保存为 Artifact。
- [x] 上下文只注入 digest，并提供原始 Artifact 读取能力。

### Phase 4：Conversation Tool Calling

- [ ] 引入统一 `CapabilityDef/Executor`。
- [ ] 将自然语言分发从字符串意图迁移为结构化 tool call。
- [ ] 实现模型发起付费能力时的确认流程。
- [ ] 保留明确的错误、取消和 tool result 事件。
- [ ] 评估并退役不再需要的 `classify-intent` CLI 分支。

每个 Phase 独立提交、独立验收；不得把完整 agent runtime 与 Slash UI 一次性落地。

## 验收标准

1. 进入 `arti` 后，输入 `/` 能看到当前可用快捷命令。
2. `/deep NVDA` 确定性调用深度研报，不经过自然语言意图识别。
3. 输入“解释 `/deep` 是什么”仍作为普通问题回答。
4. 外层 `arti deep NVDA --json` 行为和 JSON 契约不变。
5. 执行研报后追问“主要风险是什么”，系统能引用研报摘要和 NVDA 上下文。
6. 重启 CLI 后可通过 `/resume` 恢复同一会话。
7. `/status` 显示当前 session、模型、上下文容量和最近 usage。
8. `/usage` 与 `/credits` 分别展示 Token 和产品余额，不混用。
9. `/compact` 后旧对话仍在 transcript 中，活跃上下文缩小且关键投资信息保留。
10. full/deep 原文不直接进入活跃上下文，只通过 Artifact 按需读取。
11. 模型准备自动调用付费 full/deep 时必须先确认；显式 Slash 调用无需重复确认。
12. `--json` stdout 保持单一、可解析，不被 Slash 状态和进度信息污染。

## 测试策略

### 单元测试

- Slash 只在行首识别，`//` 转义正确。
- 未知 Slash 不进入模型。
- CLI/Slash 共用同一能力执行器。
- Session JSONL 追加、索引原子更新、损坏行恢复。
- Context pack 选择 summary、最近消息和相关 Artifact。
- Token usage 累加和 `/status` 展示。
- 付费确认区分显式 Slash 与模型发起。

### 集成测试

- `v1-chat` 同时兼容旧请求和 conversation context 请求。
- SSE `tool.call/tool.result/usage` 顺序和中断恢复。
- `/compact` 前后 Token 占用下降且业务事实保留。
- full/deep Artifact 可在后续问题中按需读取。

### 回归测试

- 现有 chat、quick-scan、full、deep、poly 外层命令。
- REPL 非 TTY 输入队列。
- `--json` stdout 纯净。
- 登录刷新、Credits 查询和服务端错误分类。

### 生产 Smoke Test

- 美股、港股、A 股各验证一次 quick-scan 会话连续追问。
- full/deep 计费后端就绪后验证显式调用和模型发起确认。
- 长会话验证 usage、软阈值提示和 compact。

## 迁移策略

### 外层 CLI

完全向后兼容：

```bash
arti chat "美股今天怎么样"
arti quick-scan AAPL --json
arti full NVDA --json
arti deep TSLA --json
```

### REPL 裸命令

自 Phase 1 起直接进入目标状态：

- `/full AAPL`：命令。
- `full AAPL`：自然语言。

不设置 REPL 裸命令迁移窗口。外层 `arti full AAPL` 等 Commander 命令不受影响。

### Session

- 现有 `repl_history` 继续作为输入历史，不自动转换为对话 transcript。
- 现有 `session.json` 的 `lastCommand` 不迁移为 conversation。
- 新功能启用后创建新的 session index，不读取历史敏感输入。

## 权衡与替代方案

### 方案 A：只增加 Slash 别名

**优点**：

- 改动最小。
- 可以快速获得类似 Claude/Codex 的外观。

**缺点**：

- 仍然没有 session、Token、compact 和 Artifact。
- 自然语言仍依赖字符串意图分支。
- Slash 与外层命令容易形成两套行为。

**结论**：不选。它只解决表面交互。

### 方案 B：会话内核优先，再逐步工具化（选中）

**优点**：

- 每个 Phase 可独立交付。
- 保留现有生产能力，风险可控。
- Token、session 和 Artifact 为未来 agent runtime 提供稳定基础。
- 不破坏 agent/脚本自动化接口。

**缺点**：

- 需要 CLI 与 `v1-chat` 后端协同修改。
- 过渡期同时存在 `classify-intent` 和新 tool calling。

### 方案 C：一次性引入完整 Agent SDK/TUI 框架

**优点**：

- 可以直接获得工具调用、多 agent 和复杂终端 UI。

**缺点**：

- 引入新依赖和新的运行时抽象。
- 无法证明 Slash、session、Token、Artifact 中哪一层真正解决了问题。
- 改动面过大，难以按现有能力逐项回归。

**结论**：当前不选；等 Phase 1–3 稳定后再评估。

### 方案 D：会话全部存服务端

**优点**：

- 天然支持跨设备、云端同步和多端续聊。

**缺点**：

- 需要数据库、RLS、保留策略、删除协议和隐私审查。
- CLI 离线查看历史依赖网络。
- 超出当前本地 CLI 的最小闭环。

**结论**：第一阶段不选，保留未来迁移接口。

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| 本地 transcript 包含敏感投研信息 | 中 | 高 | 0700/0600、可删除、默认保留期、日志不含密钥 |
| compact 丢失关键约束或时间信息 | 中 | 高 | 结构化 summary、验收固定字段、保留原始 transcript |
| 大 Artifact 再次撑满上下文 | 中 | 中 | 默认只注入 digest，按需读取 |
| 新旧事件契约不兼容 | 低 | 高 | 所有新增请求字段可选、未知 SSE 事件可忽略 |
| 模型误触发昂贵能力 | 中 | 高 | `when_model_initiated` 确认策略 + 服务端报价 |
| Token usage 与 Credits 被用户混淆 | 中 | 中 | `/usage` 和 `/credits` 分离，文案明确 |
| REPL 裸命令迁移导致习惯中断 | 高 | 低 | 明确迁移窗口和提示，外层命令不变 |
| Phase 4 演变为通用 agent 框架 | 中 | 中 | 只抽象当前已有的真实能力，不加入推测功能 |

## 安全性考虑

- Session、summary 和 Artifact 都视为用户敏感数据。
- 不记录认证 token、密码、完整 HTTP header 和后端内部 prompt。
- `/resume` 只读取当前系统用户目录下的会话。
- Artifact ID 不允许路径穿越，文件路径由内部生成。
- 模型 tool call 的参数必须经过与显式命令相同的 schema 校验。
- 模型不能绕过服务端鉴权、Credits 校验和付费确认。
- 诊断日志默认只记录 sessionId/requestId/Token 数量，不记录消息正文。

## 性能影响

- **启动延迟**：本地读取 session index，目标不增加可感知网络等待。
- **请求延迟**：普通短会话无额外模型调用；compact 会增加一次摘要调用。
- **内存占用**：不再把完整 transcript 和完整研报常驻内存。
- **磁盘占用**：JSONL 和 Artifact 会增长，需要保留与清理策略。
- **Token 成本**：summary 和 digest 预期降低长会话输入 Token；必须通过 usage 数据验证。

## 可观测性

### 本地可见

- `/status`：sessionId、模型、最近 context ratio、活动标的、Artifact 数量。
- `/usage`：最近一轮和当前会话累计 Token。
- `/compact`：本次压缩的活跃消息数；summary boundary 保存在 transcript。

### 服务端指标

- `chat_input_tokens`、`chat_output_tokens`、`chat_cached_input_tokens`。
- `context_ratio`、`compact_trigger`、`compact_tokens_saved`。
- `tool_call_count{capability,source=slash|model}`。
- `tool_confirmation{capability,result}`。
- `artifact_read_count{type}`。

所有指标禁止包含消息正文、股票持仓数量等可识别用户内容。

## 依赖关系

### 前置依赖

- RFC-2026-0003：CLI 已收敛为生产后端瘦客户端。
- RFC-2026-0005：chat 已切换到调用方传递 `messages` 的 Edge v1 契约。
- RFC-2026-0007：计费保持服务端权威。
- 后端 `v1-chat` 支持 usage/context 事件和可选 conversation context。

### 非依赖

- 不依赖本地 MCP Server。
- 不依赖 SQLite、Python 或 Docker。
- 不依赖完整 Agent SDK。

## 文档影响

实施时需要更新：

- [x] `README.md`：交互模式、Slash、session 和自动化边界。
- [x] `AGENTS.md`：agent 继续使用外层命令和 `--json`，不模拟 Slash。
- [x] `CLAUDE.md`：架构与项目结构。
- [x] `docs/README.md`：新增会话设计入口。
- [x] `docs/BILLING_FLOW.md`：Token usage 与 Credits 区分。
- [x] 命令帮助和 Slash 补全。
- [x] `CHANGELOG.md`：REPL 裸命令迁移说明。

## 开放问题

1. **Phase 4 的运行位置**：tool call 编排放在 Edge `v1-chat`，还是独立 conversation orchestrator？需要结合后端现状另行设计。

## 参考资料

- [Codex CLI Slash commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
- [Claude Code Commands](https://code.claude.com/docs/en/commands)
- [Claude Code Sessions](https://code.claude.com/docs/en/sessions)
- [Claude Code Context Window](https://code.claude.com/docs/en/how-claude-code-works)
- [RFC-2026-0003: CLI 数据链收敛](RFC-2026-0003-cli-data-chain-converge.md)
- [RFC-2026-0005: Edge v1 与 REPL 会话历史](RFC-2026-0005-edge-v1-migration.md)
- [RFC-2026-0007: 服务端权威计费](RFC-2026-0007-remove-cli-local-billing.md)

---

## 讨论记录

### 2026-07-24 - zhe / Codex

讨论确认 ARTI CLI 的目标不是简单模仿 Slash Command 外观，而是建立三层入口：

1. 外层 CLI 服务 agent、脚本和 CI。
2. 会话内 Slash Command 提供确定性控制。
3. 自然语言对话最终通过结构化 tool call 使用同一能力执行器。

同时确认第一阶段采用本地 JSONL 会话、服务端权威 Token usage、Artifact 摘要进入上下文，不新增 SQLite 或 TUI 框架依赖。

**决策**：采用方案 B“会话内核优先，再逐步工具化”；RFC 保持 Draft，开放问题评审后再进入 Accepted。

### 2026-07-24 - zhe

确认 Phase 1 采用严格切换：REPL 裸命令立即作为普通对话，不设置迁移窗口；只有行首 Slash Command 调用显式能力。外层 Commander 命令保持兼容。

### 2026-07-24 - zhe（Phase 2）

确认本地 Session 默认保留 30 天并允许配置；`/resume` 无参数时列出最近会话，不自动选择。服务端未发送真实 Token usage 时，CLI 显示未知且不做本地估算。

### 2026-07-24 - zhe（Phase 3）

确认 Compact 采用方案 A：只通过显式 `/compact [focus]` 调用普通 `v1-chat`，按现有聊天规则计费，第一版不自动压缩。确认 Artifact 采用方案 A：仅属于当前 Session，不跨 Session 引用，并随 Session 使用相同的 30 天可配置保留期清理。

### 2026-07-24 - zhe（Phase 4 / 服务端 Phase 1）

确认 `/v1/chat` 作为唯一对话编排边界：CLI 固定发送 `schemaVersion: 1`、`mode: client-managed`，只消费服务端真实 usage。Credits 定价与扣费继续由后端决定，CLI 不估算 Token、不计算价格。

---

## 变更历史

| 日期 | 作者 | 变更内容 |
|---|---|---|
| 2026-07-24 | zhe | 创建 RFC，定义对话优先、Slash、Session、Token 和 Artifact 方案 |
| 2026-07-24 | zhe / Codex | 实施 Phase 3，并记录 Compact A、Artifact A 决策 |
| 2026-07-24 | zhe / Codex | 对齐服务端 Context Pack 与 Usage 契约（[#43](https://github.com/botearn/ARTI-CLI/pull/43)） |
