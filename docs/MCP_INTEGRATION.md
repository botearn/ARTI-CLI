# MCP 集成指南

## 概述

ARTI CLI 的数据层已集成 Model Context Protocol (MCP) 支持，可以直接调用 arti-backend MCP 服务获取数据，提供更灵活的数据源选择。

## 架构

### 数据源优先级（启用 MCP 时）

1. **Backend MCP** — A 股数据通过 Tushare 获取，支持五层缓存策略
2. **Backend HTTP API** — 原有的后端 API 接口
3. **arti-data** — A 股数据服务（仅当符号为 A 股时）
4. **OpenBB** — 本地 Python 桥接，支持全球数据

### 数据源优先级（禁用 MCP 时）

1. **Backend HTTP API**
2. **arti-data**（仅 A 股）
3. **OpenBB**（兜底）

## 配置

### 环境变量

```bash
# 启用 MCP
export ARTI_BACKEND_MCP_ENABLED=true

# 设置 MCP URL（可选，默认 http://localhost:8001/mcp）
export ARTI_BACKEND_MCP_URL=http://localhost:8001/mcp
```

### 配置文件

编辑 `~/.config/arti/config.json`：

```json
{
  "backend": {
    "enabled": true,
    "url": "https://api-gateway-production-b656.up.railway.app",
    "timeout": 60000,
    "mcpUrl": "http://localhost:8001/mcp",
    "mcpEnabled": true
  }
}
```

或通过命令行配置：

```bash
# 启用 MCP
arti config set backend.mcpEnabled true

# 设置 MCP URL
arti config set backend.mcpUrl http://localhost:8001/mcp

# 查看当前配置
arti config get backend.mcpEnabled
```

## 启动 MCP 服务

MCP 服务由 arti-backend 项目提供。启动方式：

```bash
cd /path/to/ARTI_backend/mcp-market
python server.py
```

或指定端口：

```bash
PORT=8001 python server.py
```

默认端口为 8001，MCP 入口为 `http://localhost:8001/mcp`。

## 支持的工具

### 实时行情（Tier 1）

- `get_realtime_quote(symbol)` — 获取 A 股实时行情快照
- `get_order_book(symbol)` — 获取买卖五档盘口数据
- `get_tick_data(symbol, count)` — 获取逐笔成交数据

### 技术指标（Tier 2）

- `get_minute_bars(symbol, period)` — 分时 K 线（1/5/15/30/60 分钟）
- `get_technical_indicators(symbol)` — 技术指标快照（MA、RSI、MACD 等）
- `get_stock_fund_flow(symbol)` — 资金流向数据

### 静态信息（Tier 3）

- `get_stock_info(symbol)` — 股票基础信息
- `get_company_profile(symbol)` — 公司概况
- `get_trading_rules(symbol)` — 交易规则（涨跌停等）

### 历史数据（Tier 4）

- `get_daily_bars(symbol, days, adjust)` — 日 K 线历史数据

## 数据流映射

### Quote 命令（实时行情）

```
arti quote AAPL
↓
getHybridQuotes (数据层统一入口)
↓
MCP: get_realtime_quote (如果启用)
    ↓ fallback
Backend API: fetchQuotesBackend
    ↓ fallback
OpenBB: getQuote
```

### Scan 命令（技术指标）

```
arti scan AAPL
↓
getHybridTechnical (数据层统一入口)
↓
MCP: get_technical_indicators (如果启用，仅 A 股)
    ↓ fallback
Backend API: scanStockBackend
    ↓ fallback
arti-data: fetchHistoryFromArtiData (仅 A 股)
    ↓ fallback
OpenBB: getTechnical
```

## 故障排查

### MCP 连接失败

```
Backend MCP quote 失败，fallback： connect ECONNREFUSED
```

**解决方案：**
1. 确认 MCP 服务已启动：`python server.py`
2. 确认 MCP URL 正确：`arti config get backend.mcpUrl`
3. 确认网络连接正常：`curl http://localhost:8001/mcp`

### 认证失败

MCP 调用时会自动携带当前登录用户的 Bearer Token。

```
MCP 工具 get_realtime_quote 失败: 401 Unauthorized
```

**解决方案：**
1. 重新登录：`arti login`
2. 检查 token 是否有效：`arti whoami`

### 性能问题

如果 MCP 响应慢，可以：
1. 禁用 MCP，回到 Backend API：`arti config set backend.mcpEnabled false`
2. 检查 MCP 服务日志：`PORT=8001 python server.py` 查看控制台输出
3. 调整超时设置：`arti config set backend.timeout 120000`

## 缓存策略

MCP 服务实现五层缓存策略：

| 层级 | 数据类型 | TTL | 说明 |
|-----|--------|-----|-----|
| Tier 1 | 实时行情 | 5s | 现价、盘口、逐笔 |
| Tier 2 | 衍生数据 | 1-3m | 分时K线、技术指标、资金流 |
| Tier 3 | 半静态 | 4h | 股票信息、公司概况 |
| Tier 4 | 历史归档 | ∞ | 日K线、财报、分红 |
| Tier 5 | 市场概览 | 60s | 大盘指数、龙虎榜 |

所有返回值包含 `_cache` 元数据。使用 `force_refresh=true` 跳过缓存直连 API。

## 开发指南

### 添加新的 MCP 工具

1. 在 `src/data/mcp-client.ts` 中添加包装函数：

```typescript
export async function getMcpNewTool(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  return callMcpTool("tool_name", params);
}
```

2. 在 `src/data/mcp-technical.ts` 或 `src/data/mcp-quote.ts` 中集成到数据流中

3. 确保添加到数据层统一入口 `src/data/index.ts`

### 测试 MCP 连接

```bash
# 直接测试 MCP 工具
curl -X POST http://localhost:8001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"tool": "get_realtime_quote", "args": {"symbol": "600519.SS"}}'
```

## 已知限制

- MCP 数据源目前仅支持 A 股（因为 Tushare 数据源）
- 美股等其他市场使用回退到 Backend API 或 OpenBB
- MCP 工具缓存策略由 arti-backend 管理，CLI 端无法控制细粒度的刷新

## 参考资源

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [arti-backend MCP 服务](../ARTI_backend/mcp-market/server.py)
- [ARTI CLI 配置指南](./CONFIG.md)
