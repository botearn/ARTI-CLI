# ARTI CLI — 智能投研工具

ARTI 是 ARTI 投研产品的命令行客户端，支持美股、港股、A 股三个市场。

CLI 是生产后端的**瘦客户端**：所有能力直接调用与 web 产品同一套生产函数（Supabase Edge Functions + orchestrator），数据口径、计费一致，不维护本地数据处理逻辑，无需本地 Python。

**v1 能力：** 聊天（chat）/ 快速扫描（quick-scan）/ 全景研报（full）/ 深度研报（deep）

## 分支与版本

- **主线分支为 `main`**（GitHub 默认分支）。旧的 `master` 已弃用，不再使用。
- 从 `main` 切分支开发：新功能 `feat/<名>`、修复 `fix/<名>`；不直接在 `main` 上提交。
- 当前版本 `0.4.0` = v1（RFC-2026-0003）：CLI 收敛为生产瘦客户端，下线 OpenBB 与 MCP Server，命令面收敛为四能力。详见 `CHANGELOG.md` 与 `rfcs/2026/RFC-2026-0003-cli-data-chain-converge.md`。

## 项目结构

- `src/index.ts` — CLI 入口（commander + REPL 统一命令定义）
- `src/core/repl.ts` — 交互终端；普通文本进入对话，行首 Slash 确定性派发
- `src/core/slash.ts` — Slash 输入解析、转义、补全和未知命令建议
- `src/core/conversation-session.ts` — 0700/0600 JSONL Session、索引、恢复和保留期清理
- `src/core/conversation-runtime.ts` — 活跃会话、完整 context pack 与 usage 落盘
- `src/core/conversation-display.ts` — `/status`、`/usage`、`/resume` 文本输出
- `src/api.ts` — 生产函数客户端（chat / scan-stock / classify-intent / orchestrator / 计费）
- `src/commands/` — 各能力实现（product=quick-scan/full/deep，chat，auth，credits…）
- `src/data/` — 后端 MCP 客户端、研报上下文、共享类型
- `prompts/` — AI 研报 prompt 定义（从 ARTI_backend 同步）
  - `layer1/` — 8 位分析师 prompt（Natasha/Steve/Tony/Thor/Clint/Sam/Vision/Wanda）
  - `layer2/` — 7 位投资大师 prompt（巴菲特/林奇/马克斯/索罗斯/达里奥/德鲁肯米勒/段永平）
  - `panorama_synthesizer.yaml` — 全景研报综合裁定
  - `synthesizer.yaml` — 深度研报综合裁定
  - `_common.yaml` — 公共 prompt 片段

## 依赖环境

- Node.js >= 18（无需 Python）
- 登录后端（`arti login`）：生产函数需用户鉴权 + 计费

## 快速开始（开发）

```bash
npm install && npm run build && npm link
arti login
arti quick-scan AAPL
```
## CLI 命令

```bash
arti                          # 进入交互终端（普通文本对话，Slash 调用能力）
arti chat 美股今天怎么样       # AI 投研对话
arti quick-scan AAPL          # 快速研判（产品 scan-stock）
arti full NVDA                # 全景研报（orchestrator）
arti deep TSLA                # 深度研报
arti credits                  # 余额套餐
arti config list              # 查看配置
```

所有命令支持 `--json` 全局选项，输出结构化 JSON。

交互终端内使用 `/quick AAPL`、`/full NVDA`、`/deep TSLA` 等 Slash Command；不带 `/` 的输入始终作为普通对话。外层命令行为不受影响。

会话 transcript 默认保留 30 天，配置键为 `session.retentionDays`。Token usage 仅消费 `v1-chat` 的服务端 SSE 事件，不允许用字符数或 provider tokenizer 在 CLI 侧估算，也不能从 Token 推导 Credits。

## 开发

```bash
npm install                   # 安装 Node 依赖
npm run dev -- quick-scan AAPL # 开发模式运行 CLI
npm run build                 # 构建
npm test                      # 测试
```

## 技术约定

- TypeScript ESM 模块，导入路径带 `.js` 后缀
- 数据全部来自生产函数（`src/api.ts`），不在 CLI 侧重复实现数据/指标逻辑
- 涨红跌绿（中国习惯）

## RFC 流程

所有重要功能变更、架构调整、破坏性更新都必须先写 RFC。

- **RFC 目录**: `rfcs/`
- **快速创建**: `./scripts/create-rfc.sh`
- **查看已有 RFC**: `rfcs/INDEX.md`
- **上手指南**: `rfcs/QUICK_START.md`

触发条件：
- 添加新的 CLI 命令
- 修改现有命令行为（破坏性变更）
- 数据源切换或架构调整
- API 接口变更
- 计费模型调整

不需要 RFC 的情况：
- Bug 修复（不涉及架构）
- 文档更新
- 代码重构（不改变外部行为）

## 演绎法（强制）

修改 src/ 时，按顺序执行：
1. 查 `.deductive/acs/rules.json` → 向用户展示相关规则
2. 用业务语言写验收要点（3-5条）→ 等用户说"确认"
3. 写 `tests/test_ac_*.py`（头部 `# @covers: 规则ID`）+ 写生产代码
4. 跑一次给用户看结果 → 等用户说"对"
5. 用户说"对" → commit；说"不对" → 改了再跑给用户看

不可跳步。未确认不写代码。未验证不 commit。
无匹配规则时告知用户后正常实现。
用户说"跳过演绎"时可直接实现。

### 验收要点规则
用用户能判断对错的业务语言，禁止写技术细节。

### 意图识别规则
系统已配置 UserPromptSubmit hook 做意图识别。
当 hook 返回 UNCERTAIN 时，不要视为确认。必须追问用户。
"应该对吧""算是吧""嗯...""可能" = 不确定 = 必须追问。

### 演绎法文件结构

```
.deductive/
├── config.json              # 模式配置（observe/enforce）
├── state.json               # 实时状态（自动更新）
├── acs/
│   └── rules.json           # 规则注册表（ARTI CLI 需求清单）
├── hooks/
│   ├── gate-commit.py       # commit 门禁 + 覆盖率计算
│   ├── run-lint.py          # 编辑后即时 lint
│   └── check-intent.py      # 用户意图识别
├── evidence/                # 验证存档（自动写入）
└── logs/                    # 执行日志
```

启用方式：将 `settings.deductive.json` 中的 hooks 合并到 `~/.claude/settings.json`。
临时禁用：`touch .deductive/DISABLED`
切换为强制模式：编辑 `.deductive/config.json` 将 mode 改为 `enforce`。
