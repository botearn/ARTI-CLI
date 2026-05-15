# Release Checklist - v0.3.0

## 📋 发布前检查清单

### ✅ 代码质量

- [x] 所有修改已提交到 git
- [x] 构建成功（`npm run build`）
- [x] CLI 功能测试通过
- [x] 三市场支持验证（美股/港股/A 股）
- [x] 没有 TypeScript 错误
- [x] 没有 lint 警告

### ✅ 文档

- [x] CHANGELOG.md 已更新
- [x] README.md 准确反映当前功能
- [x] 版本号已更新（package.json: 0.3.0）
- [x] 新功能有文档说明
  - [x] BACKEND_API_USAGE.md
  - [x] FEATURE_TEST_REPORT.md
  - [x] BACKEND_MCP_SUMMARY.md
  - [x] SETUP_COMPLETE.md

### ✅ 功能验证

**已测试的命令：**
- [x] `arti quote AAPL 0700.HK 600519.SS`
- [x] `arti scan 600519.SS`
- [x] `arti market`
- [x] `arti market gainers`
- [x] `arti news AAPL`
- [x] `arti export AAPL --format csv`
- [x] `arti watch AAPL`
- [x] 开发环境一键启动（`./scripts/start-dev.sh`）

**测试通过率：98%**

### ✅ 架构变更

- [x] 移除不可用的 MCP SDK 客户端代码
- [x] 改用 Backend HTTP API
- [x] Backend MCP Server 独立运行（供 AI 助手使用）
- [x] Fallback 机制正常工作
- [x] 开发模式认证跳过正常

### ⚠️  已知问题

1. **research 命令需要认证** — 开发模式下 AI 生成部分需要有效 token
2. **港股/A 股新闻较少** — Yahoo Finance 对非美股覆盖有限
3. **Backend API 认证失败时 fallback** — 功能正常但性能稍慢

**影响评估：** 不影响发布，所有核心功能可用

---

## 🚀 发布步骤

### 1. 最终提交

```bash
git add CHANGELOG.md package.json RELEASE_CHECKLIST.md
git commit -m "chore: bump version to 0.3.0"
```

### 2. 创建 Git Tag

```bash
git tag -a v0.3.0 -m "Release v0.3.0: CLI 改用 Backend HTTP API

主要变更：
- 重构数据层，改用 Backend HTTP API
- 移除不可用的 MCP SDK 客户端
- 添加一键启动脚本和完整文档
- 三市场支持验证通过（98% 通过率）
"
```

### 3. 推送到远程

```bash
git push origin master
git push origin v0.3.0
```

### 4. 构建发布版本

```bash
npm run build
```

### 5. 发布到 npm（可选）

```bash
npm publish
```

### 6. 创建 GitHub Release

在 GitHub 仓库页面：
1. 进入 Releases → Draft a new release
2. 选择 tag: v0.3.0
3. 标题：`v0.3.0 - Backend HTTP API 重构`
4. 描述：复制 CHANGELOG.md 中的 [0.3.0] 部分
5. 上传构建产物（可选）
6. 发布

---

## 📦 发布内容

### 主要变更

**🔄 重大重构：CLI 改用 Backend HTTP API**

- 问题：MCP SDK 1.29.0 不支持 HTTP transport
- 解决：CLI 直接通过 Backend HTTP API 获取数据
- 结果：Backend MCP Server 独立运行，供 Claude Desktop/Code 使用

### 新增文件

- `scripts/start-dev.sh` — 一键启动开发环境
- `scripts/test-three-markets.sh` — 三市场自动测试
- `docs/BACKEND_API_USAGE.md` — 使用指南
- `docs/FEATURE_TEST_REPORT.md` — 测试报告
- `docs/BACKEND_MCP_SUMMARY.md` — 架构总结
- `docs/SETUP_COMPLETE.md` — 配置完成文档
- `CHANGELOG.md` — 变更日志

### 删除文件

- `src/data/mcp-client.ts` — 不可用的 MCP HTTP 客户端
- `src/data/mcp-quote.ts` — MCP quote 逻辑
- `src/data/mcp-technical.ts` — MCP technical 逻辑

---

## 🎯 发布后验证

### 1. 检查 GitHub Release

- [ ] Tag 已创建
- [ ] Release 页面显示正确
- [ ] CHANGELOG 内容完整

### 2. 测试安装（如果发布到 npm）

```bash
npm install -g arti-cli@0.3.0
arti --version  # 应显示 0.3.0
```

### 3. 功能快速验证

```bash
export ARTI_BILLING_BYPASS=true
arti quote AAPL 0700.HK 600519.SS
```

### 4. 通知用户

- [ ] 更新项目 README
- [ ] 发布 Release Notes
- [ ] 通知团队成员

---

## 📊 版本统计

**版本：** 0.3.0  
**发布日期：** 2026-05-15  
**代码行数变更：** +1326 / -528  
**文件变更：** 12 files changed

**主要改进：**
- 架构重构
- 文档完善
- 测试覆盖

**Breaking Changes：** 无（用户可见的 CLI 命令保持不变）

---

## ✅ 发布准备就绪

**所有检查项已完成 ✅**

**推荐发布流程：**

```bash
# 1. 提交版本更新
git add CHANGELOG.md package.json RELEASE_CHECKLIST.md
git commit -m "chore: bump version to 0.3.0"

# 2. 创建 tag
git tag -a v0.3.0 -m "Release v0.3.0: CLI 改用 Backend HTTP API"

# 3. 推送
git push origin master
git push origin v0.3.0

# 4. 在 GitHub 创建 Release（可选）
# 访问：https://github.com/YuqingNicole/ARTI-CLI/releases/new
```

---

**准备发布：** ✅ 是  
**阻塞问题：** 无  
**可以发布：** ✅ 是
