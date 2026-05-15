# 三股市支持说明

## 概述

ARTI CLI 支持三个主要股票市场的数据查询：**美股、港股、A 股**。通过分层优先级和智能 fallback 机制，确保在任何情况下都能获取数据。

## 数据源优先级

### 统一查询流程（三个市场共用）

```
查询流程：
1️⃣  Backend MCP (最高优先级) ⭐
    ├─ 支持：美股、港股、A 股
    ├─ 五层缓存策略
    ├─ ✓ 成功 → 返回数据
    └─ ✗ 失败 → 继续
2️⃣  Backend API
    ├─ 支持：美股、港股、A 股
    ├─ ✓ 成功 → 返回数据
    └─ ✗ 失败 → 继续
3️⃣  arti-data (仅 A 股)
    ├─ ✓ 成功 → 返回数据
    └─ ✗ 失败 → 继续
4️⃣  OpenBB (本地兜底)
    ├─ 支持：美股、港股、A 股
    ├─ ✓ 成功 → 返回数据
    └─ ✗ 失败 → 报错
```

**MCP 是所有市场的最高优先级**，不分美股/港股/A 股。

### 各市场格式

- **美股**：`AAPL`、`NVDA`、`TSLA`
- **港股**：`0700.HK`（腾讯）、`9988.HK`（阿里）、`2318.HK`（平安）
- **A 股**：`600519.SS`（茅台）、`000858.SZ`（五粮液）、`601318.SS`（平安）

---

## 命令支持矩阵

| 命令 | 美股 | 港股 | A股 | 备注 |
|-----|------|------|-----|------|
| `arti quote` | ✅ | ✅ | ✅ | 实时行情，支持三个市场 |
| `arti watch` | ✅ | ✅ | ✅ | 实时 Dashboard，持续轮询 |
| `arti scan` | ✅ | ✅ | ✅ | 技术指标扫描 |
| `arti predict` | ✅ | ✅ | ✅ | 综合预测分析 |
| `arti market` | ✅ | ✅ | ✅ | 市场概览（主要指数） |
| `arti research` | ✅ | ⚠️ | ⚠️ | 需要后端支持；港股/A股可能数据不足 |
| `arti history` | ✅ | ✅ | ✅ | 历史 K 线（各市场数据源不同） |
| `arti export` | ✅ | ✅ | ✅ | 导出到 CSV/JSON |

---

## 配置示例

### 1. 启用所有三个市场的基础配置

```bash
# 确保后端 API 启用
arti config set backend.enabled true
arti config set backend.url https://api-gateway-production-b656.up.railway.app

# 登录（获取有效 token）
arti login
```

### 2. 优化 A 股体验（启用 MCP）

```bash
# 启动 MCP 服务
cd /path/to/ARTI_backend/mcp-market
PORT=8001 python server.py

# 配置 CLI 使用 MCP
arti config set backend.mcpEnabled true
arti config set backend.mcpUrl http://localhost:8001/mcp
```

### 3. 离线模式（仅 OpenBB）

```bash
# 禁用后端 API 和 MCP
arti config set backend.enabled false
arti config set backend.mcpEnabled false

# 现在只使用本地 OpenBB（yfinance）
# ✓ 美股：正常
# ✓ 港股：正常
# ⚠️ A股：性能下降（基于 Yahoo Finance，数据可能延迟）
```

---

## 符号格式

### 美股
- **格式**：大写字母，无后缀
- **例子**：`AAPL`、`NVDA`、`TSLA`、`BRK.B`

### 港股
- **格式**：4 位数字 + `.HK`
- **自动补全**：输入 `0700` 或 `0700.HK` 都能识别
- **例子**：`0700.HK`（腾讯）、`9988.HK`（阿里）

### A 股
- **格式**：6 位数字 + `.SS`（上海）或 `.SZ`（深圳）
- **自动补全**：输入 `600519` 或 `600519.SS` 都能识别
- **例子**：
  - 上海：`600519.SS`（茅台）、`601318.SS`（平安）
  - 深圳：`000858.SZ`（五粮液）、`002594.SZ`（比亚迪）

---

## 性能参考

### 响应时间（一般情况）

| 数据源 | 美股 | 港股 | A股 | 备注 |
|--------|------|------|-----|------|
| Backend API | 500ms-1s | 500ms-1s | 500ms-1s | 依赖网络和后端负载 |
| Backend MCP | — | — | 200-500ms | 带五层缓存，第二次查询 <50ms |
| arti-data | — | — | 300-800ms | 计算型，首次较慢 |
| OpenBB | 1-3s | 2-5s | 3-10s | 本地离线，但 yfinance 可能超时 |

### 缓存策略

**Backend MCP（仅 A 股）：**
- 实时行情（Tier 1）：5 秒 TTL
- 技术指标（Tier 2）：2 分钟 TTL
- 历史数据（Tier 4）：永久缓存

**Backend API：** 
- 无缓存（实时）

**arti-data：**
- 日 K 线（永久）

**OpenBB：**
- 本地内存缓存（会话级别）

---

## 故障排查

### 查询美股失败

```bash
arti quote AAPL
# ✗ 错误：Backend API 超时

→ 解决方案：
  1. 检查网络连接
  2. 确认后端 API 在线
  3. 禁用后端，使用本地 OpenBB：arti config set backend.enabled false
```

### 查询港股失败

```bash
arti quote 0700.HK
# ✗ 错误：后端 API 不支持港股

→ 解决方案：
  1. 后端可能未完全部署
  2. 升级到最新版本
  3. 使用 OpenBB 作为兜底
```

### A 股数据不准确

```bash
arti scan 600519.SS
# ✓ 成功，但数据来自 OpenBB（yfinance）

→ 优化建议：
  1. 启用 Backend MCP：arti config set backend.mcpEnabled true
  2. 或使用 Backend API（质量更好）
  3. MCP 使用 Tushare Pro（最准确）
```

---

## 测试三个市场

```bash
# 运行测试脚本
npm run test:three-markets

# 手动测试
arti quote AAPL 0700.HK 600519.SS
arti scan AAPL 0700.HK 600519.SS
arti market  # 显示三个市场的主要指数
```

---

## 总结

✅ **三个市场都支持**
- 美股：最稳定，数据源最多
- 港股：支持完整，数据来自 Yahoo Finance
- A 股：最丰富，可选择 MCP 或 Backend API

🎯 **推荐配置**
1. **日常使用**：启用 Backend API，可选启用 MCP（A 股最优）
2. **开发测试**：后端 API 不可用时，本地 OpenBB 兜底
3. **生产部署**：启用 MCP（A 股）+ Backend API（全市场）+ OpenBB（兜底）

⚡ **性能优化**
- A 股首选 MCP（Tushare 数据 + 五层缓存）
- 美股/港股首选 Backend API
- 离线模式使用 OpenBB
