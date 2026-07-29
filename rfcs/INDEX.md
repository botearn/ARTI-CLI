# RFC 索引

按状态分类的所有 RFC 列表。

## 📝 Draft（草稿）

| RFC | 标题 | 创建日期 |
|---|---|---|
| [RFC-2026-0010](2026/RFC-2026-0010-insight-research-capabilities.md) | CLI 引入 ARTI Insight 与 ARTI Research | 2026-07-29 |
| [RFC-2026-0008](2026/RFC-2026-0008-conversation-first-cli.md) | 对话优先 CLI、Slash Command 与 Token 感知会话 | 2026-07-24 |
| [RFC-2026-0002](2026/RFC-2026-0002-onboarding-install.md) | 新用户上手 — 一行安装 + REPL 登录态 Onboarding | 2026-06-01 |
| [RFC-2026-0003](2026/RFC-2026-0003-cli-data-chain-converge.md) | CLI 数据链收敛到生产产品函数，下线 OpenBB 第二套处理 | 2026-06-24 |
| [RFC-2026-0004](2026/RFC-2026-0004-poly-cli-integration.md) | ARTi Poly CLI 集成 — `arti poly` 子命令接入 ARTi-poly 公开 API | 2026-07-08 |
| [RFC-2026-0005](2026/RFC-2026-0005-edge-v1-migration.md) | chat / quick-scan 切换 Supabase Edge /v1 + REPL 会话历史（arti#0055 姊妹篇） | 2026-07-14 |
| [RFC-2026-0006](2026/RFC-2026-0006-cli-hardening-audit-fixes.md) | CLI 加固与审计缺陷修复计划（取代 docs/BACKLOG.md） | 2026-07-23 |
| [RFC-2026-0007](2026/RFC-2026-0007-remove-cli-local-billing.md) | 移除 CLI 本地扣费，计费一律服务端权威 | 2026-07-23 |

---

## 🔍 Proposed（已提出）

*当前无已提出的 RFC*

---

## ✅ Accepted（已接受）

*当前无已接受的 RFC*

---

## 🚧 Implementing（实施中）

*当前无实施中的 RFC*

---

## 🎉 Implemented（已实施）

| RFC | 标题 | 完成日期 | 版本 |
|---|---|---|---|
| [RFC-2026-0009](2026/RFC-2026-0009-backend-agent-harness.md) | CLI 接入 Backend Agent Harness | 2026-07-28 | v0.4.4 |
| [RFC-2026-0001](2026/RFC-2026-0001-backend-mcp-integration.md) | Backend MCP 集成 - 主链支持所有市场 | 2026-05-19 | v0.3.0 |

---

## ❌ Rejected（已拒绝）

*当前无已拒绝的 RFC*

---

## 🗑️ Deprecated（已废弃）

*当前无已废弃的 RFC*

---

## 按主题分类

### 🏗️ 架构 & 基础设施

- [RFC-2026-0010](2026/RFC-2026-0010-insight-research-capabilities.md) - Insight 一次性判断与 Research 长期资源
- [RFC-2026-0009](2026/RFC-2026-0009-backend-agent-harness.md) - CLI 接入 Backend Agent Harness
- [RFC-2026-0008](2026/RFC-2026-0008-conversation-first-cli.md) - 对话优先 CLI、Slash Command 与 Token 感知会话

### 💰 计费 & Credits

- [RFC-2026-0006](2026/RFC-2026-0006-cli-hardening-audit-fixes.md) - CLI 加固与审计缺陷修复计划（含双重扣费等待后端确认项）
- [RFC-2026-0007](2026/RFC-2026-0007-remove-cli-local-billing.md) - 移除 CLI 本地扣费，计费一律服务端权威

### 📊 数据源 & API

- [RFC-2026-0001](2026/RFC-2026-0001-backend-mcp-integration.md) - Backend MCP 集成
- [RFC-2026-0005](2026/RFC-2026-0005-edge-v1-migration.md) - chat / quick-scan 切换 Edge /v1（arti#0055 姊妹篇）
- [RFC-2026-0009](2026/RFC-2026-0009-backend-agent-harness.md) - full/deep 切换异步研报任务 API

### 🔧 CLI 命令

- [RFC-2026-0010](2026/RFC-2026-0010-insight-research-capabilities.md) - `/insight` 与 `/research` 能力边界
- [RFC-2026-0004](2026/RFC-2026-0004-poly-cli-integration.md) - ARTi Poly CLI 集成（`arti poly` 子命令组）
- [RFC-2026-0008](2026/RFC-2026-0008-conversation-first-cli.md) - 会话内 Slash Command 与外层自动化接口分层
- [RFC-2026-0009](2026/RFC-2026-0009-backend-agent-harness.md) - full/deep 异步任务与 report 恢复命令

### 🤖 AI & Research

- [RFC-2026-0010](2026/RFC-2026-0010-insight-research-capabilities.md) - 结构化 Insight 与版本化 Research
- [RFC-2026-0008](2026/RFC-2026-0008-conversation-first-cli.md) - Token 感知会话、Artifact 与对话工具调用
- [RFC-2026-0009](2026/RFC-2026-0009-backend-agent-harness.md) - Backend Agent Harness 接入

### 🔌 MCP Server

- *待添加*

### 📱 用户体验

- [RFC-2026-0002](2026/RFC-2026-0002-onboarding-install.md) - 新用户上手（一行安装 + REPL onboarding）
- [RFC-2026-0008](2026/RFC-2026-0008-conversation-first-cli.md) - 对话优先 REPL、Slash、Session 与 Compact

### 🔐 安全 & 认证

- [RFC-2026-0006](2026/RFC-2026-0006-cli-hardening-audit-fixes.md) - CLI 加固与审计缺陷修复计划（超时/token 刷新/scheme 校验等）

---

## 按时间线

### 2026

- **2026-07-29** - [RFC-2026-0010](2026/RFC-2026-0010-insight-research-capabilities.md) - CLI 引入 ARTI Insight 与 ARTI Research (Draft)
- **2026-07-28** - [RFC-2026-0009](2026/RFC-2026-0009-backend-agent-harness.md) - 生产 Agent Harness smoke test 完成并随 v0.4.4 发布 (Implemented)
- **2026-07-26** - [RFC-2026-0009](2026/RFC-2026-0009-backend-agent-harness.md) - CLI 第一版完成，等待生产 smoke test (Implementing)
- **2026-07-25** - [RFC-2026-0009](2026/RFC-2026-0009-backend-agent-harness.md) - CLI 接入 Backend Agent Harness (Draft)
- **2026-07-24** - [RFC-2026-0008](2026/RFC-2026-0008-conversation-first-cli.md) - 对话优先 CLI、Slash Command 与 Token 感知会话 (Draft)
- **2026-07-23** - [RFC-2026-0006](2026/RFC-2026-0006-cli-hardening-audit-fixes.md) - CLI 加固与审计缺陷修复计划 (Draft, 取代 BACKLOG.md)
- **2026-07-14** - [RFC-2026-0005](2026/RFC-2026-0005-edge-v1-migration.md) - chat / quick-scan 切换 Edge /v1 (Draft, arti#0055 姊妹篇)
- **2026-07-08** - [RFC-2026-0004](2026/RFC-2026-0004-poly-cli-integration.md) - ARTi Poly CLI 集成 (Draft)
- **2026-06-24** - [RFC-2026-0003](2026/RFC-2026-0003-cli-data-chain-converge.md) - CLI 数据链收敛 (Draft)
- **2026-06-01** - [RFC-2026-0002](2026/RFC-2026-0002-onboarding-install.md) - 新用户上手 / 一行安装 + Onboarding (Draft)
- **2026-05-19** - [RFC-2026-0001](2026/RFC-2026-0001-backend-mcp-integration.md) - Backend MCP 集成 (Implemented)

### 2025

*待添加*

---

## 统计信息

| 状态 | 数量 |
|---|---|
| Draft | 8 |
| Proposed | 0 |
| Accepted | 0 |
| Implementing | 0 |
| Implemented | 2 |
| Rejected | 0 |
| Deprecated | 0 |
| **总计** | **10** |

**最后更新**: 2026-07-29
