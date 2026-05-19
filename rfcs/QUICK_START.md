# RFC 快速上手指南

## 5 分钟创建你的第一个 RFC

### 方式一：使用脚本（推荐）

```bash
# 在项目根目录运行
./scripts/create-rfc.sh
```

脚本会引导你输入：
1. RFC 标题（英文 kebab-case）
2. 简短描述（中文）
3. 作者名称

然后自动：
- 生成下一个 RFC 编号
- 创建文件并填充模板
- 更新 INDEX.md
- 给出下一步提示

### 方式二：手动创建

```bash
# 1. 复制模板
cp rfcs/template.md rfcs/2026/RFC-2026-0002-your-title.md

# 2. 编辑文件
code rfcs/2026/RFC-2026-0002-your-title.md

# 3. 更新 INDEX.md
# 手动在 INDEX.md 的 Draft 部分添加条目
```

---

## RFC 生命周期示例

### 1. 创建草稿 (Draft)

```bash
./scripts/create-rfc.sh
# 输入: credit-system-v2
# 输出: rfcs/2026/RFC-2026-0002-credit-system-v2.md
```

此时状态为 `Draft`。

### 2. 填写 RFC 内容

按照模板填写：
- 摘要：用 2-3 句话说清楚
- 动机：为什么需要这个改动
- 详细设计：如何实现
- 权衡：为什么选这个方案

### 3. 提出方案 (Proposed)

完成草稿后：

```bash
# 1. 将状态改为 Proposed
# 在 RFC 文件中: **状态**: Proposed

# 2. 在 INDEX.md 中移动到 Proposed 部分

# 3. 提交
git add rfcs/
git commit -m "RFC-2026-0002: Propose credit system v2"
git push
```

### 4. 评审与讨论

团队成员在 RFC 文件的 `## 讨论记录` 章节添加意见。

### 5. 接受方案 (Accepted)

评审通过后：

```bash
# 状态改为 Accepted
# 在 INDEX.md 移动到 Accepted 部分
git commit -m "RFC-2026-0002: Accept credit system v2"
```

### 6. 实施 (Implementing)

开始写代码：

```bash
# 1. 状态改为 Implementing
# 2. 记录实施开始日期、负责人、分支名
# 3. 提交
git commit -m "RFC-2026-0002: Start implementing"
```

### 7. 完成 (Implemented)

功能上线后：

```bash
# 1. 状态改为 Implemented
# 2. 填写 ## 实施记录 章节：
#    - 实施完成日期
#    - 合并的 PR 编号
#    - 发布版本号
#    - 实际偏差（如有）
# 3. 在 INDEX.md 移动到 Implemented 部分
git commit -m "RFC-2026-0002: Mark as implemented in v0.4.0"
```

---

## 常见场景

### 场景 1: 添加新命令

```markdown
# RFC-2026-0003: Add portfolio command

## 摘要
添加 `arti portfolio` 命令，支持投资组合管理和收益分析。

## 动机
用户需要在 CLI 中管理多只股票的投资组合，计算总收益和风险。

## 详细设计

### API 变更
**新增命令**
\```bash
arti portfolio list               # 查看组合列表
arti portfolio add <name>         # 创建组合
arti portfolio <name> add AAPL 100 150.00  # 添加持仓
arti portfolio <name> analyze     # 分析组合
\```

### 数据结构
\```typescript
interface Portfolio {
  name: string;
  holdings: Holding[];
  created_at: string;
}

interface Holding {
  symbol: string;
  shares: number;
  cost_basis: number;
}
\```
```

### 场景 2: 修改现有功能（破坏性变更）

```markdown
# RFC-2026-0004: Change quote output format

## 摘要
将 `arti quote` 的输出格式从表格改为卡片式，提升可读性。

## 动机
当前表格格式在多股票查询时可读性差，卡片式更适合移动端和小屏幕。

## 详细设计

### Before
\```
AAPL    $234.56    +1.23%
NVDA    $890.12    -0.45%
\```

### After
\```
┌─────────────────────────┐
│ 苹果公司 (AAPL)         │
│ $234.56  ▲ +1.23%       │
│ 成交量: 45.2M           │
└─────────────────────────┘
\```

### 迁移策略
- 向后兼容期：v0.4.x
- 添加 `--legacy` 选项保留旧格式
- v0.5.0 移除旧格式
```

### 场景 3: 架构调整

```markdown
# RFC-2026-0005: Migrate to TypeScript strict mode

## 摘要
启用 TypeScript strict 模式，提升类型安全。

## 动机
当前代码存在多处 `any` 和隐式类型推断，导致运行时错误。

## 详细设计

### 分阶段迁移
1. **阶段一**：修复核心模块（src/commands/）
2. **阶段二**：修复数据层（src/data/）
3. **阶段三**：修复工具函数（src/utils/）

### 测试策略
- 每个模块迁移后运行完整测试套件
- 添加新的类型测试用例
```

---

## 写作技巧

### ✅ 好的摘要

> 添加 `arti portfolio` 命令，支持用户在 CLI 中管理多只股票的投资组合，计算总收益率、风险指标和资产分布。

### ❌ 差的摘要

> 这个 RFC 是关于组合功能的。

---

### ✅ 好的动机

> **问题陈述**: 用户需要手动在 Excel 中记录持仓，无法快速查看实时收益。
> 
> **用户故事**: 作为投资者，我希望在 CLI 中管理我的投资组合，以便随时查看实时收益而不需要打开 Excel。

### ❌ 差的动机

> 其他工具都有这个功能，我们也应该有。

---

### ✅ 好的权衡分析

> **方案 A (选中)**: 组合数据存储在本地 JSON 文件
> - 优点: 无需数据库，启动快，离线可用
> - 缺点: 无法跨设备同步
> 
> **方案 B (未选中)**: 组合数据存储在 Backend
> - 优点: 跨设备同步
> - 缺点: 离线不可用，增加 Backend 复杂度
> 
> **为何不选**: 当前用户主要在单设备使用 CLI，跨设备同步不是高优先级需求。

### ❌ 差的权衡分析

> 就用方案 A 吧，因为简单。

---

## 检查清单

提交 RFC 前，确认：

- [ ] 标题清晰简洁（< 50 字符）
- [ ] 摘要说清了"是什么"
- [ ] 动机说清了"为什么"
- [ ] 详细设计说清了"怎么做"
- [ ] 权衡分析说清了"为什么这样做"
- [ ] 列出了风险和缓解措施
- [ ] 考虑了向后兼容性
- [ ] 明确了测试策略
- [ ] 更新了 INDEX.md

---

## 参考资源

- [README](README.md) - RFC 流程说明
- [template.md](template.md) - RFC 完整模板
- [RFC-2026-0001](2026/RFC-2026-0001-backend-mcp-integration.md) - 真实案例参考
