# ARTI CLI RFCs

RFC (Request for Comments) 用于记录 ARTI CLI 的重要设计决策、功能变更和技术方案。

## RFC 流程

### 1. 何时需要写 RFC

以下情况**必须**创建 RFC：

- 添加新的主要功能（如新命令、新数据源）
- 修改现有核心功能的行为
- 架构层面的重大变更
- 破坏性更新（breaking changes）
- API 接口变更
- 数据格式变更
- 计费模型调整

以下情况**不需要** RFC：

- Bug 修复（除非涉及架构调整）
- 文档更新
- 代码重构（不改变外部行为）
- 依赖版本升级（无破坏性变更）

### 2. RFC 编号规则

```
RFC-YYYY-NNNN-标题.md
```

- `YYYY`：年份（4位）
- `NNNN`：序号（4位，从0001开始）
- `标题`：简短英文标题（kebab-case）

示例：
- `RFC-2026-0001-backend-mcp-integration.md`
- `RFC-2026-0002-credit-system-v2.md`
- `RFC-2026-0003-astock-data-enhancement.md`

### 3. RFC 状态

每个 RFC 必须标明当前状态：

| 状态 | 说明 |
|---|---|
| `Draft` | 草稿阶段，正在讨论 |
| `Proposed` | 已提出，等待评审 |
| `Accepted` | 已接受，准备实施 |
| `Implementing` | 实施中 |
| `Implemented` | 已实施 |
| `Rejected` | 已拒绝 |
| `Deprecated` | 已废弃 |
| `Superseded` | 已被新 RFC 取代（需注明新 RFC 编号）|

### 4. 创建新 RFC

```bash
# 1. 复制模板
cp rfcs/template.md rfcs/RFC-2026-NNNN-your-title.md

# 2. 填写 RFC 内容
# 按照模板填写各个章节

# 3. 更新索引
# 在 rfcs/INDEX.md 中添加条目

# 4. 提交
git add rfcs/
git commit -m "RFC-2026-NNNN: 你的标题"
```

### 5. RFC 生命周期

```
Draft → Proposed → Accepted → Implementing → Implemented
                       ↓
                   Rejected
```

实施完成后：
- 更新 RFC 状态为 `Implemented`
- 在 `## 实施记录` 章节记录实际完成情况
- 如有偏差，记录与原方案的差异

## 目录结构

```
rfcs/
├── README.md           # 本文件
├── INDEX.md            # RFC 索引（按状态分类）
├── template.md         # RFC 模板
├── 2026/               # 按年份组织
│   ├── RFC-2026-0001-backend-mcp-integration.md
│   ├── RFC-2026-0002-credit-system-v2.md
│   └── ...
└── assets/             # RFC 相关资源（图表、示例代码等）
    ├── diagrams/
    └── examples/
```

## 参考资源

- [Rust RFC Process](https://github.com/rust-lang/rfcs)
- [Python PEP](https://peps.python.org/pep-0001/)
- [Kubernetes Enhancement Proposals](https://github.com/kubernetes/enhancements)
