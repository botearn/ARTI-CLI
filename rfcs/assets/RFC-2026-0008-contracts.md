# RFC-2026-0008 技术契约附录

本文是 [RFC-2026-0008](../2026/RFC-2026-0008-conversation-first-cli.md) 的技术附录，只描述候选数据结构和协议形状。主 RFC 的规则、阶段、开放问题和最终评审结论优先。

## 会话存储

第一阶段使用本地文件：

```text
~/.config/arti/sessions/
├── index.json
├── <session-id>.jsonl
└── artifacts/
    └── <artifact-id>.json
```

要求：

- 目录权限 `0700`，会话与 Artifact 文件权限 `0600`。
- `index.json` 使用临时文件 + rename 原子更新。
- transcript 使用 append-only JSONL。
- 不记录 access token、refresh token、密码或完整请求头。
- 读取时跳过损坏行并显示告警，不能因单行损坏丢失整个会话。

```typescript
interface SessionIndexEntry {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastModel?: string;
  activeSymbols: string[];
  totalUsage: TokenUsage;
}

type SessionEvent =
  | { type: "message"; role: "user" | "assistant"; content: string; at: string }
  | { type: "tool_call"; callId: string; capability: string; args: unknown; at: string }
  | { type: "tool_result"; callId: string; digest: string; artifactId?: string; at: string }
  | { type: "usage"; requestId: string; usage: TokenUsage; at: string }
  | { type: "summary"; summary: ConversationSummary; throughEvent: number; at: string };

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  totalTokens: number;
  contextWindow?: number;
}

interface ConversationSummary {
  goal?: string;
  activeSymbols: string[];
  facts: Array<{ text: string; asOf?: string; source?: string }>;
  conclusions: string[];
  risks: string[];
  assumptions: string[];
  unresolvedQuestions: string[];
  artifactIds: string[];
}
```

## 上下文组装

每轮请求按以下优先级构造 context pack：

1. 服务端系统规则和产品安全规则。
2. 最近一次结构化 `ConversationSummary`。
3. 当前标的、数据时间和用户显式固定的信息。
4. summary boundary 之后的最近消息。
5. 与当前问题相关的 Artifact digest。
6. 当前用户消息。

不自动注入 full/deep 原文、终端渲染文本、无关工具输出、登录信息、配置密钥或调试日志。

## Token budget 与压缩

服务端负责：

- 使用实际模型 tokenizer 做请求前检查。
- 返回模型、context window 和真实 usage。
- 在硬上限前返回可识别的 `context_overflow` 错误。

CLI 负责：

- 展示最近一次和会话累计 usage。
- 达到软阈值时提示 `/compact`。
- 第一版只响应用户显式 `/compact`，不根据服务端信号自动执行。
- 保留原始 transcript；compact 只改变活跃 context pack。

初始建议：

- 软阈值：已用上下文达到 70%。
- 硬阈值：预留模型输出后达到 85%。
- 阈值由服务端返回，CLI 不写死模型常量。

`/compact [focus]` 生成结构化 `ConversationSummary`，必须保留标的、带时间的数据事实、结论、风险、用户约束、未决问题和 Artifact 引用。

## Artifact

```typescript
interface ConversationArtifact {
  id: string;
  sessionId: string;
  type: "quick_scan" | "full_report" | "deep_report" | "poly_result";
  symbol?: string;
  createdAt: string;
  dataAsOf?: string;
  digest: string;
  payload: unknown;
}
```

能力完成后：

1. 原始结构化结果写入 Artifact。
2. 终端继续按现有方式渲染。
3. transcript 只追加 `tool_result.digest + artifactId`。
4. 后续问题需要细节时按需读取 Artifact。

第一版仅为交互终端内显式 Slash 能力创建 Artifact；外层 `arti <command> --json` 不创建本地会话文件。Artifact 只允许由所属 Session 引用，并随该 Session 使用相同的保留期清理。

## 统一能力执行器

当前 `CommandDef` 已同时服务 Commander 和 REPL。实施时优先扩展现有定义，不新建平行框架：

```typescript
interface CapabilityDef {
  name: string;
  cliName: string;
  slashName?: string;
  aliases: string[];
  confirmation: "never" | "when_model_initiated" | "always";
  execute(input: CapabilityInput, context: ExecutionContext): Promise<CapabilityResult>;
}

interface CapabilityResult {
  json: unknown;
  digest?: string;
  artifact?: ConversationArtifact;
}
```

- Commander 解析外层参数后调用 `execute()`。
- Slash 解析 `/command` 后调用 `execute()`。
- 模型 tool call 校验参数和确认策略后调用 `execute()`。

## `v1-chat` 请求契约

在保留现有 `messages` 的基础上增加可选 conversation context：

```json
{
  "messages": [
    { "role": "user", "content": "那主要风险是什么？" }
  ],
  "conversation": {
    "schemaVersion": 1,
    "mode": "client-managed",
    "sessionId": "session_...",
    "summary": {},
    "activeSymbols": ["NVDA"],
    "artifacts": [
      {
        "id": "artifact_...",
        "type": "deep_report",
        "digest": "..."
      }
    ]
  },
  "clientCapabilities": {
    "toolCalling": true,
    "usageEvents": true
  }
}
```

新增字段必须可选，旧版 CLI 继续只传 `messages`。

## SSE 事件

在现有 `message.delta`、`message.done`、`billing`、`error` 基础上增加：

```text
event: tool.call
data: {"callId":"...","capability":"quick-scan","arguments":{"symbol":"NVDA"}}

event: tool.result
data: {"callId":"...","digest":"...","artifactId":"..."}

event: usage
data: {
  "requestId":"...",
  "model":"...",
  "inputTokens":1200,
  "outputTokens":320,
  "cachedInputTokens":400,
  "totalTokens":1520,
  "contextWindow":128000
}
```

兼容规则：

- 新 CLI 忽略未知事件。
- 旧 CLI 忽略新增事件，只消费正文。
- `message.done` 仍表示当前轮正文结束。
- `billing` 与 `usage` 分离，不能用 Token usage 推导 Credits。

## 付费确认

模型发起 `confirmation = "when_model_initiated"` 的能力时：

1. 暂停 tool call。
2. 从服务端读取当前动作报价和余额。
3. 展示能力、标的、预计 Credits。
4. 用户确认后执行；拒绝则把拒绝结果返回对话运行时。

用户显式输入 `/full` 或 `/deep` 时跳过二次确认，但服务端仍负责余额校验和最终扣费。
