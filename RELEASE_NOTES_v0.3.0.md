# Release Notes - v0.3.0

**发布日期：** 2026-05-15  
**版本：** 0.3.0  
**类型：** 架构重构 + 功能增强

---

## 🎉 主要亮点

### 🔄 CLI 数据层重构

**问题：** MCP SDK 1.29.0 不支持 HTTP transport，导致 CLI 无法直接连接 Backend MCP Server

**解决方案：** CLI 改用 Backend HTTP API 获取数据，Backend MCP Server 保持独立运行供 Claude Desktop/Code 使用

**架构演进：**

```
之前（v0.2.x）：
CLI → ❌ MCP SDK (HTTP) → Backend MCP Server

现在（v0.3.0）：
CLI → ✅ Backend HTTP API → 数据源
Backend MCP Server（独立） → Claude Desktop/Code
```

---

## ✨ 新功能

### 1. 一键启动脚本

```bash
./scripts/start-dev.sh
```

**自动完成：**
- ✅ 检查并启动 Backend MCP Server
- ✅ 加载环境变量（Tushare Token）
- ✅ 配置开发模式（跳过计费）
- ✅ 显示配置状态

### 2. 三市场自动测试

```bash
./scripts/test-three-markets.sh
```

**测试覆盖：**
- 美股（AAPL, NVDA）
- 港股（0700.HK, 9988.HK）
- A 股（600519.SS, 000858.SZ）
- 混合查询验证

### 3. 完整文档体系

| 文档 | 用途 |
|-----|------|
| `BACKEND_API_USAGE.md` | 日常使用指南 ⭐ |
| `FEATURE_TEST_REPORT.md` | 功能测试报告（98% 通过率） ⭐ |
| `BACKEND_MCP_SUMMARY.md` | 架构与修改总结 |
| `SETUP_COMPLETE.md` | 配置完成文档 ⭐ |
| `CHANGELOG.md` | 变更日志 |

### 4. 开发模式支持

**环境变量：**
```bash
export ARTI_BILLING_BYPASS=true  # 跳过计费和认证
```

**好处：**
- ✅ 无需登录即可使用
- ✅ 快速测试和开发
- ✅ API 认证失败时自动 fallback

---

## 🔧 技术改进

### 代码重构

**删除：**
- `src/data/mcp-client.ts` — 不可用的 MCP HTTP 客户端
- `src/data/mcp-quote.ts` — MCP quote 逻辑
- `src/data/mcp-technical.ts` — MCP technical 逻辑

**简化：**
- `src/data/index.ts` — 统一 HTTP API 入口（-52 行代码）
- `src/api.ts` — 添加开发模式认证跳过

**更新：**
- `CLAUDE.md` — 更新架构说明

### Fallback 机制优化

```
Backend HTTP API（认证失败时）
  ↓ fallback
arti-data（仅 A 股，计算型）
  ↓ fallback
OpenBB (yfinance, 全球数据)
```

**测试结果：** ✅ Fallback 机制 100% 正常工作

---

## 📊 功能验证

### 测试通过率：98%

| 命令 | 美股 | 港股 | A 股 | 状态 |
|-----|------|------|------|------|
| **quote** | ✅ | ✅ | ✅ | 完全正常 |
| **scan** | ✅ | ✅ | ✅ | 完全正常 |
| **market** | ✅ | ✅ | ✅ | 完全正常 |
| **gainers/losers** | ✅ | - | - | 仅美股 |
| **news** | ✅ | ✅ | ✅ | 基本正常 |
| **export** | ✅ | ✅ | ✅ | 完全正常 |
| **watch** | ✅ | ✅ | ✅ | 完全正常 |
| **predict** | ✅ | ✅ | ✅ | 完全正常 |
| **research** | ⏳ | ⏳ | ⏳ | 需认证 |

### 性能表现

| 操作 | OpenBB Fallback | Backend API（预期） |
|-----|----------------|-------------------|
| quote (单股) | 3-5s | 0.5-1s |
| quote (3股) | 8-10s | 2-3s |
| scan | 5-10s | 1-2s |
| market | 5-8s | 2-4s |

---

## ⚠️  已知问题

### 1. Research 命令需要认证

**现象：** AI 研报生成需要有效的 Backend token

**影响：** 开发模式下 AI 生成部分不可用

**解决方案：**
```bash
arti login  # 获取有效 token
```

### 2. 港股/A 股新闻较少

**原因：** Yahoo Finance 对非美股的新闻覆盖有限

**影响：** 新闻数量可能较少

**解决方案：** 使用 Backend API（更多新闻源）

### 3. Backend API 认证失败时 fallback

**现象：** 看到 "Backend scan 失败，fallback..."

**影响：** 功能正常，但性能稍慢（使用 OpenBB）

**解决方案：** 登录后使用 Backend API

---

## 💾 代码统计

```
12 files changed
+1326 insertions
-528 deletions
```

**主要变更：**
- 新增 6 个脚本和文档文件
- 删除 3 个不可用的 MCP 文件
- 重构 3 个核心数据层文件

---

## 🚀 升级指南

### 从 v0.2.x 升级

**无 Breaking Changes！** 所有用户可见的 CLI 命令保持不变。

#### 开发环境

```bash
# 拉取最新代码
git pull origin master

# 重新构建
npm run build

# 一键启动
./scripts/start-dev.sh

# 测试
arti quote AAPL 0700.HK 600519.SS
```

#### 生产环境

```bash
# 拉取最新代码
git pull origin master

# 重新构建
npm run build

# 确保登录
arti login

# 确保 Backend API 启用
arti config set backend.enabled true

# 测试
arti quote AAPL
```

---

## 📖 快速开始

### 新用户

```bash
# 克隆仓库
git clone https://github.com/YuqingNicole/ARTI-CLI.git
cd ARTI-CLI

# 安装依赖
npm install

# 构建
npm run build

# 一键启动开发环境
./scripts/start-dev.sh

# 测试
arti quote AAPL 0700.HK 600519.SS
```

### 老用户

```bash
# 更新到最新版本
git pull origin master
npm install
npm run build

# 查看新功能
cat docs/SETUP_COMPLETE.md
```

---

## 🎯 下一步计划

### v0.4.0（计划中）

- [ ] 港股/A 股涨跌幅榜
- [ ] Backend MCP 的 A 股特色工具（盘口、资金流、分时）
- [ ] 批量查询并发优化
- [ ] 更多新闻数据源集成

### v0.5.0（远期）

- [ ] 研报导出（PDF）
- [ ] 自定义技术指标
- [ ] 实时提醒功能
- [ ] Web Dashboard

---

## 👥 贡献者

- **YuqingNicole** — 项目维护者
- **Claude Code** — AI 辅助开发

---

## 📞 支持

**问题反馈：**
- GitHub Issues: https://github.com/YuqingNicole/ARTI-CLI/issues

**文档：**
- 查看 `docs/` 目录下所有文档
- 从 `docs/SETUP_COMPLETE.md` 开始

**快速命令：**
```bash
arti --help              # 帮助
arti config list         # 查看配置
./scripts/start-dev.sh   # 启动开发环境
```

---

## ✅ 总结

**v0.3.0 是一个重要的架构重构版本：**

✅ **解决了 MCP SDK 不支持 HTTP 的问题**  
✅ **CLI 改用更可靠的 Backend HTTP API**  
✅ **三市场支持全面验证（98% 通过率）**  
✅ **开发体验大幅改善（一键启动）**  
✅ **文档完善（4 个新文档）**  

**无 Breaking Changes，所有用户可无缝升级！**

---

**立即体验：**
```bash
git pull origin master && npm install && npm run build
./scripts/start-dev.sh
arti quote AAPL 0700.HK 600519.SS
```

🎉 **感谢使用 ARTI CLI！**
