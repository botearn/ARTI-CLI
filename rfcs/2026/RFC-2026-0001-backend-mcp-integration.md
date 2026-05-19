# RFC-2026-0001: Backend MCP 集成

## 元数据

- **RFC 编号**: RFC-2026-0001
- **标题**: Backend MCP 集成 - 主链支持所有市场
- **作者**: YuqingNicole
- **状态**: Implemented
- **创建日期**: 2026-05-19
- **最后更新**: 2026-05-19
- **关联 Issue**: N/A
- **关联 PR**: #多个
- **取代**: N/A
- **被取代**: N/A

## 摘要

将 ARTI CLI 的数据源从纯 OpenBB 本地调用，扩展为优先使用 Backend MCP（生产环境），在网络不可用时自动回退到 OpenBB。同时移除了 A 股市场限制，主链现支持美股、港股、A 股三个市场。

## 动机

### 问题陈述

1. **数据质量问题**: 纯 OpenBB/yfinance 数据在 A 股市场存在局限性
2. **性能问题**: 每次调用都启动独立 Python 子进程，延迟高（120s 超时）
3. **市场限制**: 原主链仅支持美股/港股，A 股走 hybrid 链路
4. **数据一致性**: CLI 和 Backend 使用不同数据源，导致结果不一致

### 用户故事

- 作为投资者，我希望查询 A 股数据时获得与 Web 端一致的结果，避免混淆
- 作为开发者，我希望 CLI 能自动降级，在离线环境下仍可使用
- 作为用户，我希望查询速度更快，不需要等待 Python 子进程启动

### 现状分析

**Before**:
```
CLI → openbb.ts (子进程) → openbb_query.py → OpenBB SDK → yfinance
```

**Limitations**:
- Python 子进程启动慢（~1-2s）
- 120s 超时限制
- A 股数据质量差
- 无缓存机制

## 详细设计

### 方案概述

引入 Backend MCP 作为主数据源，保留 OpenBB 作为 fallback。采用 "MCP 优先 + OpenBB 降级" 策略。

### 技术方案

#### 架构设计

```
┌─────────────────────────────────────────────────┐
│  CLI Commands (quote, scan, predict, etc.)     │
└────────────────┬────────────────────────────────┘
                 ↓
        ┌────────┴─────────┐
        │  Data Layer      │
        │  (智能路由)       │
        └────────┬─────────┘
                 ↓
    ┌────────────┴──────────────┐
    │                           │
    ↓ (优先)                    ↓ (fallback)
┌────────────┐           ┌──────────────┐
│ Backend MCP│           │  OpenBB      │
│ (HTTP SSE) │           │  (子进程)     │
└────────────┘           └──────────────┘
    │                           │
    ↓                           ↓
┌────────────┐           ┌──────────────┐
│生产数据库   │           │  yfinance    │
│(A股增强)    │           │  SEC/FRED    │
└────────────┘           └──────────────┘
```

#### 数据结构

```typescript
// src/data/mcp-client.ts
interface McpOptions {
  refresh?: boolean;  // 跳过缓存
  timeout?: number;   // 超时时间
}

interface McpResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  source: 'mcp' | 'openbb';  // 数据来源标识
}
```

#### API 变更

**新增函数**

```typescript
// src/data/mcp-client.ts
async function callBackendMcp<T>(
  tool: string,
  args: Record<string, unknown>,
  opts?: McpOptions
): Promise<T>

async function getMcpQuote(symbol: string, opts?: McpOptions)
async function getMcpHistorical(symbol: string, days?: number, opts?: McpOptions)
async function getMcpTechnical(symbol: string, opts?: McpOptions)
// ... 其他 13 个 MCP 工具封装
```

**修改命令**

| 命令 | 原数据源 | 新数据源 | Fallback |
|---|---|---|---|
| `quote` | OpenBB | Backend MCP | OpenBB |
| `market` | OpenBB | Backend MCP | OpenBB |
| `scan` | OpenBB (美港) / arti-data (A股) | Backend MCP (统一) | OpenBB |
| `history` | OpenBB | Backend MCP | OpenBB |
| `news` | OpenBB | Backend MCP | OpenBB |
| `search` | OpenBB | Backend MCP | OpenBB |
| `predict` | 组合 | Backend MCP | OpenBB |

#### 配置变更

```json
{
  "mcp": {
    "backendUrl": "https://api.arti.bot/mcp",  // 生产环境
    "timeout": 30000,
    "retryAttempts": 2,
    "cacheEnabled": true
  }
}
```

环境变量：
```bash
ARTI_BACKEND_MCP_URL=https://api.arti.bot/mcp
ARTI_MCP_TIMEOUT=30000
```

### 实现计划

1. ✅ **阶段一**：MCP 客户端基础设施
   - [x] 创建 `src/data/mcp-client.ts`
   - [x] 实现 SSE 连接和重试逻辑
   - [x] 实现 13 个 MCP 工具封装

2. ✅ **阶段二**：命令迁移
   - [x] 迁移 `quote` 命令
   - [x] 迁移 `market` 命令
   - [x] 迁移 `scan` 命令（统一三市场）
   - [x] 迁移 `history`、`news`、`search`

3. ✅ **阶段三**：降级和测试
   - [x] 实现自动降级逻辑
   - [x] 添加 `arti doctor mcp` 诊断命令
   - [x] 测试离线模式
   - [x] 测试三市场数据一致性

### 测试策略

- **单元测试**: MCP 客户端连接、重试、超时逻辑
- **集成测试**: 
  - 美股、港股、A 股数据正确性
  - 网络故障时自动降级
  - MCP 超时时回退到 OpenBB
- **回归测试**: 确保所有原有命令仍可用
- **性能测试**: 
  - MCP 响应时间 < 2s (vs OpenBB ~3-5s)
  - 离线降级时间 < 5s

### 迁移策略

**向后兼容**:
- 保留 OpenBB 完整实现
- 用户无感知切换
- 配置项可选（默认启用 MCP）

**回滚方案**:
```bash
# 临时禁用 MCP
export ARTI_BACKEND_MCP_URL=""

# 或修改配置
arti config set mcp.backendUrl ""
```

## 权衡与替代方案

### 方案 A：MCP 优先 + OpenBB Fallback（✅ 选中）

**优点**:
- 数据质量高（Backend 统一数据源）
- 性能好（无 Python 子进程开销）
- 三市场统一（移除 A 股限制）
- 离线可用（自动降级）

**缺点**:
- 依赖网络
- 需要维护两套数据层

### 方案 B：完全移除 OpenBB（❌ 未选中）

**优点**:
- 代码更简洁
- 减少依赖

**缺点**:
- 离线完全不可用
- 用户体验差

**为何不选**: 离线场景仍有价值，不应强制依赖网络

### 方案 C：保持纯 OpenBB（❌ 未选中）

**优点**:
- 无需修改
- 完全离线

**缺点**:
- A 股数据质量差
- 性能差
- 与 Web 端不一致

**为何不选**: 无法解决核心问题（数据质量、一致性）

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| Backend MCP 服务不稳定 | 中 | 高 | 自动降级到 OpenBB |
| 网络延迟导致超时 | 中 | 中 | 可配置超时 + 重试 |
| 两套数据源结果不一致 | 低 | 中 | 统一数据规范，添加测试 |
| OpenBB 降级逻辑失效 | 低 | 高 | 添加集成测试 |

## 依赖关系

### 前置依赖

- [x] Backend MCP Server 部署（生产环境）
- [x] MCP 协议实现（SSE 传输）
- [x] A 股数据增强（Backend 侧）

### 后续依赖

- RFC-2026-0002: Credit 计费系统 V2（需要统计 MCP 调用）
- 未来可能移除 OpenBB Python 依赖（当 MCP 足够稳定）

## 安全性考虑

- ✅ Backend MCP 使用 HTTPS
- ✅ 无敏感数据在 fallback 日志中泄露
- ⚠️ 未来需要考虑 MCP 请求认证（目前无 auth）

## 性能影响

| 指标 | Before (OpenBB) | After (MCP) | 提升 |
|---|---|---|---|
| 首次查询延迟 | 3-5s | 1-2s | **50-60%** |
| 缓存命中延迟 | N/A | 200-500ms | N/A |
| A 股查询成功率 | ~60% | ~95% | **+35%** |
| 内存占用 | 子进程 ~50MB | HTTP 连接 ~5MB | **-90%** |

## 可观测性

- **日志**: 
  - MCP 调用成功/失败
  - 降级事件
  - 超时和重试
- **指标**: 
  - `mcp.request.count`
  - `mcp.request.latency`
  - `mcp.fallback.count`
- **追踪**: `arti doctor mcp` 诊断命令

## 文档影响

- [x] README.md - 更新架构图
- [x] CLAUDE.md - 更新数据源说明
- [x] docs/BACKEND_API_USAGE.md - 新增文档
- [x] 命令行帮助文本 - 添加 `doctor mcp`

## 开放问题

- [x] ~~Backend MCP 是否需要认证？~~ → 暂不需要，公开 API
- [x] ~~缓存策略？~~ → Backend 侧实现，CLI 依赖 `refresh` 参数
- [ ] 未来是否完全移除 OpenBB？→ 待观察 MCP 稳定性

## 未来展望

1. **完全移除 OpenBB 依赖**：当 MCP 稳定性达到 99.9% 后考虑
2. **MCP 请求认证**：防止滥用
3. **客户端缓存**：减少网络请求
4. **离线模式优化**：预加载常用数据

## 参考资料

- [MCP 协议规范](https://github.com/modelcontextprotocol/specification)
- [Backend MCP 实现](https://github.com/botearn/ARTI-backend)
- [OpenBB 文档](https://docs.openbb.co/)

---

## 讨论记录

### 2026-05-15 - YuqingNicole

讨论了是否需要在 CLI 侧实现缓存。

**决策**: 暂不实现，依赖 Backend 侧缓存 + `--refresh` 参数强制刷新。原因：
1. 避免 CLI 和 Backend 双重缓存不一致
2. Backend 侧已有 Redis 缓存
3. CLI 主要用于即时查询，缓存收益有限

---

## 实施记录

### 实施开始

- **日期**: 2026-05-12
- **负责人**: YuqingNicole
- **分支**: master (直接提交)

### 实施完成

- **日期**: 2026-05-19
- **合并 PR**: 多个提交
- **发布版本**: v0.3.0

### 实际偏差

| 原方案 | 实际实施 | 原因 |
|---|---|---|
| 使用 WebSocket | 使用 HTTP SSE | SSE 更简单，无需双向通信 |
| 客户端缓存 | 无缓存 | 依赖 Backend 缓存足够 |

### 遗留问题

- [ ] MCP 请求认证机制（未来考虑）
- [ ] 客户端缓存优化（待评估必要性）

---

## 变更历史

| 日期 | 作者 | 变更内容 |
|---|---|---|
| 2026-05-19 | YuqingNicole | 创建 RFC（回溯记录已完成的功能）|
