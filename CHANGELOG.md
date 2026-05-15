# Changelog

All notable changes to ARTI CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-05-15

### 🔄 重大重构

**CLI 数据层重构：改用 Backend HTTP API**

由于 `@modelcontextprotocol/sdk@1.29.0` 不支持 HTTP transport，CLI 改为直接通过 Backend HTTP API 获取数据，不再使用 MCP SDK。Backend MCP Server 保持独立运行，供 Claude Desktop/Code 使用。

### ✅ Added

- **一键启动脚本** (`scripts/start-dev.sh`) — 自动启动 Backend MCP Server 并配置开发环境
- **三市场自动测试** (`scripts/test-three-markets.sh`) — 验证美股/港股/A 股支持
- **完整文档体系**：
  - `docs/BACKEND_API_USAGE.md` — Backend API 使用指南
  - `docs/FEATURE_TEST_REPORT.md` — 功能测试报告（98% 通过率）
  - `docs/BACKEND_MCP_SUMMARY.md` — 架构与修改总结
  - `docs/SETUP_COMPLETE.md` — 配置完成文档
- **开发模式认证跳过** — 通过 `ARTI_BILLING_BYPASS=true` 环境变量

### 🔧 Changed

- **数据层架构**：
  - 移除 MCP 客户端（`mcp-client.ts`, `mcp-quote.ts`, `mcp-technical.ts`）
  - 简化 `src/data/index.ts` 为统一 HTTP API 入口
  - `src/api.ts` 支持开发模式无认证调用
- **CLAUDE.md** — 更新架构说明，明确 CLI 和 AI 助手的不同路径

### ✅ Fixed

- 修复 MCP SDK HTTP transport 不存在导致的导入错误
- 修复开发模式下认证失败导致功能不可用的问题
- 优化 fallback 机制：Backend API → arti-data（A 股）→ OpenBB

### 📊 Verified

**三市场支持（美股/港股/A 股）：**
- ✅ `quote` — 实时行情
- ✅ `scan` — 技术指标扫描
- ✅ `market` — 全球市场概览
- ✅ `gainers/losers` — 涨跌幅榜（美股）
- ✅ `news` — 财经新闻
- ✅ `export` — 数据导出（CSV/JSON）
- ✅ `watch` — 实时监控 Dashboard
- ⏳ `research` — AI 研报（需认证）

**通过率：98%**

---

## [0.2.1] - 2026-05-14

### Fixed

- 修正文档：MCP 是所有市场的最高优先级（非仅 A 股）

---

## [0.2.0] - 2026-05-14

### Added

- **三股市支持**：美股、港股、A 股
- **Backend MCP 集成**：数据层集成 arti-backend MCP 服务（优先级最高）
- 数据源优先级：Backend MCP → Backend API → arti-data（A 股）→ OpenBB
- 三股市支持文档和测试脚本

### Changed

- 改进登录 UX：配置初始化、验证码突出显示、更友好的错误提示
- 连接 quote/watch 命令到 Backend API

### Fixed

- 修复登录流程和 5 小时限流问题
- 改进 CLI 认证 UX

---

## [0.1.x] - 2026-04-xx

### Added

- CLI 基础命令：quote, market, scan, predict, research, news, export, watch
- OpenBB 数据源集成（yfinance）
- MCP Server（stdio transport，供 Claude Desktop/Code 使用）
- 浏览器登录流程
- AI 研报生成（多维分析师 + 投资大师）

---

## 架构演进

### v0.3.0（当前）
```
CLI → Backend HTTP API → 数据源（Tushare/yfinance）
Backend MCP Server（独立）→ Claude Desktop/Code
```

### v0.2.0
```
CLI → Backend MCP → 数据源  ❌ MCP SDK 不支持 HTTP
```

### v0.1.x
```
CLI → OpenBB (yfinance) → 数据源
```

---

## Breaking Changes

### v0.2.x → v0.3.0

**无 Breaking Changes** — 所有用户可见的 CLI 命令保持不变

**内部变更：**
- 移除了不可用的 MCP 客户端代码
- 数据层从 MCP SDK 改为 HTTP API（对用户透明）

**迁移指南：**

开发环境无需修改，继续使用：
```bash
./scripts/start-dev.sh
```

生产环境需要确保：
```bash
arti config set backend.enabled true
arti login  # 获取有效 token
```

---

## Roadmap

### v0.4.0（计划中）
- [ ] 港股/A 股涨跌幅榜
- [ ] Backend MCP 的 A 股特色工具（盘口、资金流、分时 K 线）
- [ ] 批量查询并发优化
- [ ] 更多新闻数据源

### v0.5.0（计划中）
- [ ] 研报导出（PDF）
- [ ] 自定义技术指标
- [ ] 实时提醒功能

---

## Links

- **GitHub**: https://github.com/YuqingNicole/ARTI-CLI
- **Documentation**: [docs/](./docs/)
- **Backend API**: https://api-gateway-production-b656.up.railway.app
- **Backend MCP**: [ARTI_backend/mcp-market](../ARTI_backend/mcp-market)
