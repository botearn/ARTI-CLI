# Backend MCP 配置总结

## ✅ 已完成

### 1. 架构修正

**之前（错误）：**
```
CLI → MCP SDK (HTTP transport) → Backend MCP Server
          ❌ SDK 不支持 HTTP transport
```

**现在（正确）：**
```
CLI → Backend HTTP API → 数据源
             ↓
      Backend MCP Server（独立，供 Claude Desktop/Code 使用）
```

### 2. 关键修改

#### src/data/index.ts
- ❌ 删除 MCP 客户端逻辑（HTTP transport 不存在）
- ✅ 统一使用 Backend HTTP API

#### src/data/mcp-*.ts
- ❌ 删除 `mcp-client.ts`、`mcp-quote.ts`、`mcp-technical.ts`
- ✅ 保留标准的 `quote.ts` 和 `hybrid.ts`

#### src/api.ts
- ✅ 添加开发模式认证跳过（ARTI_BILLING_BYPASS）
- ✅ 支持无认证请求（某些端点不需要）

### 3. Backend MCP Server

**状态：** ✅ 运行中（PID 97543，端口 8001）  
**配置：** ✅ Tushare Token 已加载  
**用途：** Claude Desktop/Code 的 MCP 工具

### 4. CLI 配置

```bash
backend.enabled = true
backend.url = "https://api-gateway-production-b656.up.railway.app"
backend.mcpEnabled = false  # CLI 不用 MCP SDK
```

### 5. 开发环境

```bash
# 快速启动
./scripts/start-dev.sh

# 或手动设置
export ARTI_BILLING_BYPASS=true
```

---

## 🎯 数据流

### CLI Quote 命令

```
arti quote 600519.SS
  ↓
src/commands/quote.ts
  ↓
src/data/index.ts (getHybridQuotes)
  ↓
src/data/quote.ts (getHybridQuotes)
  ↓
src/api.ts (fetchQuotesBackend)
  ↓
Backend HTTP API: POST /quote
  ↓
Backend 数据源（Tushare/yfinance）
```

### Claude Desktop MCP 调用

```
Claude Desktop
  ↓
MCP SDK (stdio transport)
  ↓
Backend MCP Server (python server.py)
  ↓
Backend 数据源（Tushare/yfinance）
```

**关键：CLI 和 Claude Desktop 走不同的路径！**

---

## 📊 测试结果

### 三市场支持

| 市场 | 测试 | 结果 |
|-----|------|------|
| 美股 | `arti quote AAPL` | ✅ |
| 港股 | `arti quote 0700.HK` | ✅ |
| A 股 | `arti quote 600519.SS` | ✅ |
| 混合 | `arti quote AAPL 0700.HK 600519.SS` | ✅ |

### 数据源验证

- ✅ Backend API 正常响应
- ✅ OpenBB fallback 正常工作
- ✅ 无认证时正确降级

---

## 📁 文件清单

### 新增文件

- `scripts/start-dev.sh` — 一键启动开发环境
- `scripts/test-three-markets.sh` — 三市场测试脚本
- `docs/BACKEND_API_USAGE.md` — Backend API 使用指南
- `docs/BACKEND_MCP_SUMMARY.md` — 本文档

### 已删除文件

- `src/data/mcp-client.ts` — MCP HTTP 客户端（不存在的 transport）
- `src/data/mcp-quote.ts` — MCP quote 逻辑
- `src/data/mcp-technical.ts` — MCP technical 逻辑

### 修改文件

- `src/data/index.ts` — 简化为统一 HTTP API 入口
- `src/api.ts` — 添加开发模式认证跳过
- `CLAUDE.md` — 更新架构说明

---

## 🚀 使用指南

### 日常开发

```bash
# 启动环境
./scripts/start-dev.sh

# 测试
arti quote AAPL 0700.HK 600519.SS
arti scan 600519.SS
arti market

# 停止 Backend MCP
pkill -f 'python server.py'
```

### 生产部署

```bash
# 配置
arti config set backend.enabled true
arti config set backend.url <production-url>

# 登录
arti login

# 使用
arti quote AAPL
```

### Claude Desktop 配置

`~/.config/claude-desktop/config.json`:

```json
{
  "mcpServers": {
    "arti": {
      "command": "python",
      "args": ["/Users/nicolechen/ARTI_backend/mcp-market/server.py"],
      "env": {
        "TUSHARE_TOKEN": "your-token",
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

---

## 🐛 已知问题

### 1. MCP SDK 版本

- 当前：`@modelcontextprotocol/sdk@1.29.0`
- 问题：不支持 HTTP transport
- 方案：CLI 不用 MCP SDK，直接 HTTP API

### 2. 认证过期

- 问题：token 过期时 CLI 会报错
- 方案：开发模式设置 `ARTI_BILLING_BYPASS=true`

### 3. Backend MCP 日志

- 问题：stdout 重定向后看不到实时日志
- 方案：查看 `mcp-server.log` 或前台运行 `python server.py`

---

## 📖 相关文档

- [Backend API 使用指南](./BACKEND_API_USAGE.md)
- [三股市支持说明](./THREE_MARKETS_SUPPORT.md)
- [MCP 集成指南](./MCP_INTEGRATION.md)（仅供参考，CLI 已不用）

---

## ✅ 总结

**核心结论：**

1. ✅ CLI 通过 **Backend HTTP API** 获取数据（不是 MCP SDK）
2. ✅ Backend MCP Server 独立运行，供 **Claude Desktop/Code** 使用
3. ✅ 三个市场（美股/港股/A 股）全部支持
4. ✅ 开发环境配置简单（`./scripts/start-dev.sh`）

**不要做：**
- ❌ 不要尝试让 CLI 用 MCP SDK（SDK 不支持 HTTP）
- ❌ 不要删除 Backend MCP Server（AI 助手需要）
- ❌ 不要在生产环境设置 `ARTI_BILLING_BYPASS`（跳过计费）
