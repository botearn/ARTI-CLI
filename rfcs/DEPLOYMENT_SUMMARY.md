# RFC 体系部署总结

**部署日期**: 2026-05-19  
**部署范围**: ARTI-CLI, ARTI_backend, arti-data

---

## ✅ 部署清单

### 三个项目都已完成

- [x] RFC 目录结构创建
- [x] 核心文档（README, QUICK_START, CONTRIBUTING, SUMMARY, INDEX, template）
- [x] 自动化创建脚本
- [x] 示例 RFC（ARTI-CLI 和 ARTI_backend）
- [x] assets 目录（diagrams, examples）

### 文件统计

| 项目 | 目录 | 文档 | 脚本 | 示例RFC |
|---|---|---|---|---|
| ARTI-CLI | ✅ | 7 个 | 1 个 | 1 个 |
| ARTI_backend | ✅ | 7 个 | 1 个 | 1 个 |
| arti-data | ✅ | 7 个 | 1 个 | 0 个 |

---

## 📊 已创建的示例 RFC

### ARTI-CLI
- **RFC-2026-0001**: Backend MCP 集成 - 主链支持所有市场
- **状态**: Implemented
- **文件**: `rfcs/2026/RFC-2026-0001-backend-mcp-integration.md`

### ARTI_backend
- **RFC-2026-0001**: Supabase Edge Functions → Railway 三服务架构
- **状态**: Implementing (80%)
- **文件**: `rfcs/2026/RFC-2026-0001-edge-to-railway-migration.md`

### arti-data
- **状态**: 基础设施就绪，等待第一个 RFC

---

## 🚀 快速开始

### 在任何项目中创建新 RFC

```bash
# 1. 进入项目根目录
cd /path/to/ARTI-CLI      # 或 ARTI_backend、arti-data

# 2. 运行创建脚本
./scripts/create-rfc.sh

# 3. 按提示输入信息
#    - 标题（英文 kebab-case）：例如 add-portfolio-command
#    - 描述（中文）：例如 添加投资组合管理命令
#    - 作者：自动从 git config 读取

# 4. 编辑生成的 RFC 文件
# rfcs/2026/RFC-2026-NNNN-your-title.md

# 5. 提交到 Git
git add rfcs/
git commit -m "RFC-2026-NNNN: 你的标题"
```

### 查看现有 RFC

```bash
# 查看索引
cat rfcs/INDEX.md

# 查看特定 RFC
cat rfcs/2026/RFC-2026-0001-*.md

# 查看快速上手指南
cat rfcs/QUICK_START.md
```

---

## 📝 RFC 使用场景

### ✅ 必须写 RFC

1. **新增功能**
   - ARTI-CLI: 新增命令（如 `arti portfolio`）
   - ARTI_backend: 新增 API 端点
   - arti-data: 新增数据源

2. **破坏性变更**
   - 修改命令行参数
   - 修改 API 响应格式
   - 修改数据库 schema

3. **架构调整**
   - 数据源切换
   - 服务拆分/合并
   - 技术栈升级

4. **重要决策**
   - 计费模型调整
   - 安全机制变更
   - 性能优化方案

### ❌ 不需要 RFC

- Bug 修复（不涉及架构）
- 文档更新
- 代码重构（不改变外部行为）
- 小版本依赖升级
- 单元测试补充

---

## 🔄 RFC 生命周期

```
1. Draft (草稿)
   ↓ 完善内容
2. Proposed (已提出)
   ↓ 团队评审
3. Accepted (已接受)
   ↓ 开始实施
4. Implementing (实施中)
   ↓ 完成开发
5. Implemented (已实施)
```

**评审退出**:
```
Proposed → Rejected (已拒绝)
```

**被取代**:
```
Implemented → Superseded (被新 RFC 取代)
```

---

## 💡 最佳实践

### 1. 及时记录

在开始写代码**之前**写 RFC，而不是事后补文档。

### 2. 简洁明了

- 摘要：2-3 句话说清楚
- 动机：为什么需要这个变更
- 设计：如何实现（含架构图）
- 权衡：为什么选择这个方案

### 3. 版本控制

- RFC 文件提交到 Git
- 重要讨论记录在 RFC 文件中
- 状态变更提交独立 commit

### 4. 团队协作

- 大型变更在 Proposed 阶段充分讨论
- 在 RFC 文件的"讨论记录"章节记录意见
- 达成共识后再改为 Accepted

---

## 📚 文档索引

### 流程说明
- `rfcs/README.md` - RFC 流程完整说明
- `rfcs/QUICK_START.md` - 5 分钟快速上手
- `rfcs/CONTRIBUTING.md` - 贡献者指南

### 工具和模板
- `rfcs/template.md` - RFC 标准模板
- `scripts/create-rfc.sh` - 自动化创建脚本

### 索引和总览
- `rfcs/INDEX.md` - 所有 RFC 索引（按状态/主题/时间）
- `rfcs/SUMMARY.md` - RFC 体系总览

---

## 🔗 相关资源

### 项目文档
- ARTI-CLI: `README.md` 和 `CLAUDE.md` 已添加 RFC 说明
- ARTI_backend: 建议更新 `README.md`
- arti-data: 建议更新 `CLAUDE.md`

### 参考实现
- [Rust RFC Process](https://github.com/rust-lang/rfcs)
- [Python PEP](https://peps.python.org/)
- [Kubernetes KEP](https://github.com/kubernetes/enhancements)

---

## 🎯 下一步建议

### 短期（本周）

1. **熟悉工具**
   ```bash
   # 尝试创建一个测试 RFC
   cd ARTI-CLI
   ./scripts/create-rfc.sh
   ```

2. **阅读示例**
   - 查看已有的示例 RFC
   - 了解完整的章节结构

### 中期（本月）

1. **ARTI_backend**: 完成 Railway 迁移 RFC 实施，状态改为 Implemented
2. **arti-data**: 下次添加数据源时创建第一个 RFC
3. **ARTI-CLI**: 下次添加新命令时创建 RFC

### 长期（季度）

1. 培养团队 RFC 习惯
2. 定期 RFC 评审会议
3. 积累 RFC 作为技术文档库

---

## ⚠️ 注意事项

### 状态更新

RFC 状态变更时需要**手动**更新两个地方：

1. RFC 文件本身的"状态"字段
2. `rfcs/INDEX.md` 中的分类位置

### Git 提交规范

```bash
# RFC 创建
git commit -m "RFC-2026-NNNN: 创建 [标题]"

# RFC 更新
git commit -m "RFC-2026-NNNN: 更新 [变更内容]"

# 状态变更
git commit -m "RFC-2026-NNNN: 状态变更为 [新状态]"
```

### 不要修改编号

RFC 编号一经创建就不要修改，即使 RFC 被拒绝也保留记录。

---

## 📞 支持

- **问题反馈**: 在项目 Issues 中创建
- **改进建议**: 直接修改 RFC 模板和流程文档
- **讨论交流**: 在 RFC 文件的"讨论记录"章节

---

**部署完成**: 2026-05-19  
**部署者**: YuqingNicole  
**工具**: Claude (Sonnet 4.5)
