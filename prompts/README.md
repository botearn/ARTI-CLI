# prompts/

15 个 layer1/layer2 prompt + synthesizer + common，由 `arti_shared.prompt_loader` 加载。

## 目录结构

```
prompts/
├── layer1/                       # 8 个分析师
│   ├── natasha.yaml              # 情报·宏观
│   ├── steve.yaml                # 板块轮动
│   ├── tony.yaml                 # 技术面
│   ├── thor.yaml                 # 风控
│   ├── clint.yaml                # 基本面
│   ├── sam.yaml                  # 收益分析
│   ├── vision.yaml               # 量化验证
│   └── wanda.yaml                # 组合策略
├── layer2/                       # 7 位大师
│   ├── value_guardian.yaml
│   ├── growth_hunter.yaml
│   ├── cycle_judge.yaml
│   ├── reflexivity_hunter.yaml
│   ├── all_weather_architect.yaml
│   ├── macro_momentum.yaml
│   └── business_model.yaml
├── synthesizer.yaml              # 综合裁定
└── _common.yaml                  # 公共 system prompt 片段（由 loader 通过 ${common.KEY} 展开）
```

## 1:1 迁移纪律（HTML §2.2 + §7274 重申）

> "15 个 prompt 文件迁移到 YAML 时，**文本内容必须 1:1 复制，不要"优化"**。
> 哪怕是空格、换行、标点都影响模型输出（大师 prompt 行为敏感）。"

具体规则：

1. **从旧 TS 源（`supabase/functions/_shared/prompts/layer{1,2}/*.ts`）粘贴时**：
   - 不调整缩进
   - 不"统一"标点（中文标点 vs 英文标点保留原样）
   - 不删除尾随空格 / 空行
   - 不修改换行符 (`\n` vs `\r\n` —— YAML 保留原样)
   - 注释和代码风格的"改进"全部不做

2. **YAML 用 block scalar (`|` 或 `|-`)**：
   - `|` 保留尾随换行（默认推荐）
   - `|-` 去掉所有尾随换行（仅在 TS 源最后一行没换行时用）
   - **不要用 `>` 或 `>-`** —— 那是 folded scalar，会把换行折成空格

3. **每次添加/修改 YAML 后必跑**：
   ```bash
   python scripts/verify_prompt_diff.py path/to/source.ts shared/arti_shared/prompts/layer1/xxx.yaml
   ```
   diff 必须为 0 才能合并。

4. **公共片段用 `${common.KEY}` 占位引用 `_common.yaml`**：
   - 4 段重复尾部（计算分工 / 数据准确性 / 竞品禁令 / 客观性原则）抽到
     `_common.yaml`，每份 prompt 在 `system_prompt` 里用 `${common.compute_split}`
     `${common.data_accuracy}` `${common.no_competitor}` `${common.objectivity}` 引用
   - loader 在 `load_prompt()` 内部展开占位，下游（build_messages / verify_prompt_diff /
     golden 测试）拿到的仍是 resolved 字符串，对调用方透明
   - 字节等价由 `shared/tests/test_prompt_golden.py` 守护（17 个快照对比）
   - 未来若某份 prompt 要用"私有"变体，可在 `_common.yaml` 新增 key 或
     在 prompt 内直接写出本体，loader 不强制所有尾部必须 include
   - 旧 TS 版其他 `BASE + EXTRA` 拼接如需复用该机制，扩 `_common.yaml` 即可

## 字段语义

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✅ | 必须是合法 LAYER1_AGENTS / LAYER2_MASTERS ID |
| `role` | ❌ | 给前端展示的角色名，例如 "技术面分析师" |
| `stance` | ❌ | layer2 大师的"立场"标签，例如 "价值守门人" |
| `version` | ❌ | semver，热更新追踪用 |
| `model` | ❌ | 缺省走 `MODEL_STANDARD`；layer2 通常用 `MODEL_HEAVY` |
| `max_tokens` | ❌ | 缺省 4096 |
| `temperature` | ❌ | 缺省 0.7 |
| `system_prompt` | ✅ | 1:1 来自 TS 源 |
| `user_template` | ✅ | 支持 `{symbol}` `{stock_data}` `{...}` 占位 |

## 占位变量约定（与旧 TS 一致）

- `{symbol}` —— 标准化后的股票代码（resolve_stock_local 出口格式）
- `{stock_data}` —— 行情/基本面 JSON 字符串
- `{research_context}` —— layer2 用，layer1 reports 拼成的上下文
- `{debate_transcript}` —— layer2 大师辩论时的前序意见

注意：占位变量在 user_template 里出现一次以上是允许的，
loader 用 `string.Formatter().vformat`，相同 key 多次替换没有问题。

## 当前状态

15 份 prompt + synthesizer 已完成 1:1 迁移，且 4 段公共尾部已抽到
`_common.yaml`（2026-04-22）。`layer1/_template.yaml` / `layer2/_template.yaml`
是 loader 自检样板，调用方按约定不加载。

改 prompt 的硬门槛：
1. 任何 `system_prompt` 改动必须跑 `python -m pytest shared/tests/test_prompt_golden.py`
2. 有意变更（非字节等价重构）需同步：
   - 用户明示同意
   - 重跑 `python scripts/snapshot_prompt_golden.py` 更新 golden
   - commit 里说明"为什么这是有意打破 1:1"
