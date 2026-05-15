# Backend API 使用指南

ARTI CLI 通过 Backend HTTP API 获取金融数据，支持美股、港股、A 股三个市场。

## 架构说明

```
CLI → Backend HTTP API → 数据源（Tushare/yfinance/...）
                ↓
         Backend MCP Server (供 Claude Desktop/Code 使用)
```

**关键点：**
- CLI **不直接**使用 MCP SDK（因为 SDK 缺少 HTTP transport）
- CLI 通过标准的 HTTP API 调用 Backend
- Backend MCP Server 独立运行，供 AI 助手（Claude Desktop/Code）使用

## 快速开始

### 1. 启动开发环境

```bash
# 自动启动 Backend MCP + 配置环境
./scripts/start-dev.sh
```

### 2. 手动启动（可选）

```bash
# 启动 Backend MCP 服务
cd /Users/nicolechen/ARTI_backend/mcp-market
export $(grep -v '^#' ../.env | xargs)
python server.py

# 配置 CLI
arti config set backend.enabled true
arti config set backend.url https://api-gateway-production-b656.up.railway.app

# 开发模式（跳过计费）
export ARTI_BILLING_BYPASS=true
```

### 3. 测试三个市场

```bash
# 美股
arti quote AAPL NVDA

# 港股
arti quote 0700.HK 9988.HK

# A 股
arti quote 600519.SS 000858.SZ

# 混合查询
arti quote AAPL 0700.HK 600519.SS
```

## 数据源优先级

### Quote（实时行情）

```
1. Backend API（所有市场）
   ↓ fallback
2. OpenBB (yfinance)
```

### Scan（技术指标）

```
1. Backend API（所有市场）
   ↓ fallback
2. arti-data（仅 A 股，计算型）
   ↓ fallback
3. OpenBB (yfinance)
```

## 配置选项

### Backend API

```bash
# 启用/禁用 Backend API
arti config set backend.enabled true/false

# 设置 Backend URL
arti config set backend.url <url>

# 设置超时（毫秒）
arti config set backend.timeout 60000
```

### 开发模式

```bash
# 跳过计费检查（开发/测试）
export ARTI_BILLING_BYPASS=true

# 允许无认证调用（本地测试）
export NODE_ENV=development
```

## 认证

### 生产环境

```bash
# 需要登录
arti login

# 检查登录状态
arti whoami
```

### 开发环境

```bash
# 设置 BILLING_BYPASS 后无需登录
export ARTI_BILLING_BYPASS=true
```

## Backend MCP Server

### 查看服务状态

```bash
# 检查端口
lsof -i :8001

# 查看日志
tail -f /Users/nicolechen/ARTI_backend/mcp-market/mcp-server.log

# 停止服务
pkill -f 'python server.py'
```

### MCP Server 配置

Backend MCP Server 用于 Claude Desktop/Code，**不是**给 CLI 直接调用的。

Claude Desktop 配置示例：

```json
{
  "mcpServers": {
    "arti": {
      "command": "python",
      "args": ["/Users/nicolechen/ARTI_backend/mcp-market/server.py"],
      "env": {
        "TUSHARE_TOKEN": "your-token-here",
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

## 故障排查

### 1. Backend API 超时

```bash
# 检查网络
curl -I https://api-gateway-production-b656.up.railway.app

# 增加超时
arti config set backend.timeout 120000
```

### 2. 认证失败

```bash
# 开发模式：跳过认证
export ARTI_BILLING_BYPASS=true

# 生产模式：重新登录
arti login
```

### 3. A 股数据不准确

```bash
# 确保 Backend 有 Tushare Token
cd /Users/nicolechen/ARTI_backend
grep TUSHARE_TOKEN .env

# 重启 MCP 服务加载环境变量
pkill -f 'python server.py'
./scripts/start-dev.sh
```

### 4. MCP Server 无法启动

```bash
# 检查端口占用
lsof -i :8001 | grep LISTEN

# 查看启动日志
tail -30 /Users/nicolechen/ARTI_backend/mcp-market/mcp-server.log

# 手动启动查看错误
cd /Users/nicolechen/ARTI_backend/mcp-market
python server.py
```

## API 端点

Backend API 主要端点：

| 端点 | 方法 | 功能 | 市场 |
|-----|------|------|------|
| `/quote` | POST | 实时行情 | 全部 |
| `/scan` | POST | 技术指标 | 全部 |
| `/history` | POST | 历史数据 | 全部 |
| `/market` | GET | 市场概览 | 全部 |

请求示例：

```bash
curl -X POST https://api-gateway-production-b656.up.railway.app/quote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"symbols": ["AAPL", "600519.SS"]}'
```

## 性能参考

| 操作 | Backend API | OpenBB | 备注 |
|-----|------------|--------|------|
| quote AAPL | 500ms-1s | 2-5s | Backend 快 4-10x |
| quote 600519.SS | 500ms-1s | 5-10s | A 股优势明显 |
| scan AAPL | 1-2s | 3-8s | 技术指标计算 |

## 总结

✅ **推荐配置**（开发）：
```bash
backend.enabled=true + ARTI_BILLING_BYPASS=true
```

✅ **推荐配置**（生产）：
```bash
backend.enabled=true + 已登录
```

⚠️ **不推荐**：
```bash
backend.enabled=false  # 性能差，数据可能延迟
```
