# ARTI Backend → CLI 同步完成报告

**日期**: 2026-05-13  
**状态**: ✅ Phase 1-3 完成，Phase 4 待测试

---

## ✅ 已完成的工作

### **Step 1: Backend API 客户端代码生成** ✅

#### 1.1 配置层扩展

**文件**: `src/config.ts`

新增配置项：
```typescript
backend: {
  enabled: boolean;      // 是否启用 Backend
  url: string;           // Railway Backend URL
  timeout: number;       // 请求超时（默认 60s）
}
```

环境变量支持：
- `ARTI_BACKEND_URL` — Backend 地址
- `ARTI_BACKEND_ENABLED` — 是否启用（默认 true）
- `ARTI_BACKEND_TIMEOUT` — 超时时间

#### 1.2 API 客户端函数

**文件**: `src/api.ts`

新增函数：
- `callBackend<T>(endpoint, body, options?)` — 通用 Backend 调用
- `scanStockBackend(symbol)` — `/v1/scan-stock`
- `generateReport(req)` — `/v1/generate-report`
- `streamOrchestratorBackend(symbol, opts?)` — `/v1/orchestrator` SSE
- `routeIntent(input, chatHistory?, watchlistSymbols?)` — `/v1/route`
- `fetchQuotesBackend(symbols)` — `/v1/stock-quotes` (可选)
- `resolveStockBackend(text, watchlistSymbols?)` — `/v1/resolve-stock`

特性：
- 自动重试（最多 2 次）
- 超时控制
- JWT 鉴权自动附加
- FastAPI 错误格式兼容

---

### **Step 2: 配置文件更新** ✅

**文件**: `.env.example`

新增环境变量示例：
```bash
# Railway Backend (Python FastAPI) - NEW!
ARTI_BACKEND_URL=https://api-gateway-xxx.up.railway.app
ARTI_BACKEND_ENABLED=true
ARTI_BACKEND_TIMEOUT=60000
```

---

### **Step 3: Prompts 同步** ✅

**源**: `ARTI_backend/shared/arti_shared/prompts/`  
**目标**: `ARTI-CLI/prompts/`

同步内容：
- ✅ `layer1/*.yaml` — 8 位分析师 prompt (Natasha/Steve/Tony/Thor/Clint/Sam/Vision/Wanda)
- ✅ `layer2/*.yaml` — 7 位投资大师 prompt (Buffett/Lynch/Marks/Soros/Dalio/Druckenmiller/Duan)
- ✅ `panorama_synthesizer.yaml` — 全景研报综合裁定
- ✅ `synthesizer.yaml` — 深度研报综合裁定
- ✅ `_common.yaml` — 公共 prompt 片段
- ✅ `TERMINOLOGY.md` — 术语标准（新增）

变更：
- 删除了 `EXAMPLE_USAGE.md`（CLI 特有文件）
- 更新了 `README.md`（Backend 版本更新）

---

### **Step 4: scan-stock Hybrid 模式实现** ✅

**文件**: `src/data/hybrid.ts`

#### 新增功能

三级 fallback 策略：
```
1. Backend (优先) → scanStockBackend()
   ↓ 失败
2. arti-data (A 股) → fetchHistoryFromArtiData()
   ↓ 失败
3. OpenBB (兜底) → getTechnical()
```

#### 数据转换

新增 `convertBackendToTechnical()` 函数：
- Backend `StockData` → CLI `TechnicalData`
- 字段映射完整（MA/RSI/MACD/BBands/ATR）
- 信号生成逻辑

#### 使用方式

用户无需修改命令：
```bash
# 自动使用 Backend (如果配置了 ARTI_BACKEND_URL)
arti scan AAPL

# 或显式控制
ARTI_BACKEND_ENABLED=false arti scan AAPL  # 强制使用 OpenBB
```

---

### **Step 5: 主产品三档命令确认** ✅

**文件**: `src/commands/product.ts` (已存在)

三档命令：
- `arti quick-scan AAPL` — Quick Scan (5 Credits)
- `arti full AAPL` — Full 全景研报 (30 Credits)
- `arti deep AAPL` — Deep 深度研报 (100 Credits)

别名：
- `quick` / `qs` → `quick-scan`
- `panorama` / `fr` → `full`
- `dr` → `deep`

内部实现：
- `quick-scan` → `predictCommand()` (已有)
- `full` → `researchCommand(, { mode: "panorama" })`
- `deep` → `researchCommand(, { mode: "deep" })`

---

## 🔧 配置指南

### 本地开发配置

```bash
cd /Users/nicolechen/ARTI-CLI

# 1. 创建 .env.dev (如果不存在)
cp .env.example .env.dev

# 2. 配置 Backend URL
echo "ARTI_BACKEND_URL=https://api-gateway-xxx.up.railway.app" >> .env.dev
echo "ARTI_BACKEND_ENABLED=true" >> .env.dev

# 3. 配置认证 token (可选)
echo "ARTI_AUTH_TOKEN=your-jwt-token" >> .env.dev

# 4. 加载环境变量
set -a && source .env.dev && set +a
```

### 或通过 CLI 配置

```bash
arti config set backend.url https://api-gateway-xxx.up.railway.app
arti config set backend.enabled true
arti config list
```

---

## 🧪 测试清单

### 基础功能测试

```bash
# 1. 验证构建
npm run build
# ✅ 成功 (已验证)

# 2. 测试配置读取
arti config get backend.url
# 预期: 返回配置的 Backend URL 或空

# 3. 测试 scan hybrid 模式
ARTI_BACKEND_URL=https://api-gateway-xxx.up.railway.app \
  arti scan AAPL
# 预期: 优先调用 Backend，失败则 fallback 到 OpenBB

# 4. 测试三档主产品命令
arti quick-scan AAPL  # 应该工作
arti full AAPL        # 需要 Backend orchestrator
arti deep AAPL        # 需要 Backend orchestrator
```

### Backend 集成测试

**前置条件**: Backend 已部署到 Railway 并可访问

```bash
# 1. 健康检查
curl $ARTI_BACKEND_URL/health
# 预期: {"status":"ok","service":"api-gateway",...}

# 2. 测试 scan-stock
curl -X POST $ARTI_BACKEND_URL/v1/scan-stock \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARTI_AUTH_TOKEN" \
  -d '{"symbol":"AAPL"}'
# 预期: 返回完整的 StockData JSON

# 3. CLI 集成测试
export ARTI_BACKEND_URL=<backend-url>
export ARTI_AUTH_TOKEN=<jwt-token>
arti scan AAPL --json
# 预期: 返回技术指标 JSON，source 字段为 "backend"
```

---

## 📊 架构变更总结

### 数据流向变化

#### Before (纯 OpenBB)
```
CLI → openbb.ts → Python OpenBB → yfinance/SEC/FRED
```

#### After (Hybrid 模式)
```
CLI → hybrid.ts → [1] Backend (优先)
                  ↓
                  [2] arti-data (A 股)
                  ↓
                  [3] OpenBB (兜底)
```

### 配置优先级

```
环境变量 > 配置文件 > 默认值

ARTI_BACKEND_URL > ~/.config/arti/config.json > ""
```

---

## ⚠️ 已知限制

### 1. Backend 数据字段不完整

Backend `scan-stock` 返回的技术指标比 OpenBB 少：
- ❌ 缺少 ADX (趋势强度)
- ❌ 缺少 Stochastic (KDJ)
- ❌ 缺少 OBV (能量潮)

**解决方案**: `convertBackendToTechnical()` 中这些字段设为 `null`，CLI 会跳过显示。

### 2. MACD 字段简化

Backend 只返回 `macd` 单值，缺少 `signal` 和 `histogram`。

**解决方案**: 用 0 占位，后续 Backend 可补全这些字段。

### 3. Backend URL 必须手动配置

首次使用需要用户配置 `ARTI_BACKEND_URL`。

**改进方向**: 
- 在 CLI 安装时检测并提示配置
- 提供默认的 Backend URL（如果有公开实例）

---

## 🚀 下一步工作

### Phase 4: 端到端测试 (待做)

1. **Backend 联调**
   - [ ] 部署最新 Backend 到 Railway
   - [ ] 获取 Backend URL 和 JWT token
   - [ ] 配置 CLI 的 `.env.dev`
   - [ ] 运行完整测试套件

2. **Orchestrator SSE 测试**
   - [ ] 测试 `arti full AAPL`
   - [ ] 测试 `arti deep AAPL`
   - [ ] 验证 SSE 事件流格式一致性
   - [ ] 验证 Layer 1/2/3 输出完整性

3. **Hybrid Fallback 验证**
   - [ ] Backend 可达 → 验证 source="backend"
   - [ ] Backend 不可达 → 验证 fallback 到 "openbb"
   - [ ] 测试 A 股走 arti-data 路径

4. **Credit 扣费对齐**
   - [ ] 验证三档命令的 Credit 扣费
   - [ ] Quick Scan: 5 Credits
   - [ ] Full: 30 Credits
   - [ ] Deep: 100 Credits

---

## 📚 文档更新清单

- [x] 创建 `BACKEND_SYNC_COMPLETED.md` (本文档)
- [ ] 更新 `README.md` 添加 Backend 配置说明
- [ ] 更新 `docs/CLI_FEATURES.md` 标记 Backend 集成状态
- [ ] 创建 `docs/CLI_BACKEND_INTEGRATION.md` 详细集成指南

---

## 🎯 成功标准

当以下所有项都完成时，Backend 同步视为**完整交付**：

- [x] Backend API 客户端代码生成
- [x] Prompts 同步完成
- [x] scan-stock Hybrid 模式实现
- [x] 三档主产品命令确认
- [x] 构建通过无错误
- [ ] 端到端测试通过（需 Backend 部署）
- [ ] 文档更新完成
- [ ] 用户可用性验证

---

## 👥 贡献者

- **Backend**: Python FastAPI (ARTI_backend)
- **CLI**: TypeScript (ARTI-CLI)
- **同步实施**: Claude Code
- **验收**: @nicolechen

---

**最后更新**: 2026-05-13 16:45  
**版本**: v0.2.0-beta + Backend Integration
