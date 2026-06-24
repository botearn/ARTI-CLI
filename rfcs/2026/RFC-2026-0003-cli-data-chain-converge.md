# RFC-2026-0003: CLI 数据链收敛到生产产品函数，下线 OpenBB 第二套处理

## 元数据

- **RFC 编号**: RFC-2026-0003
- **标题**: CLI 数据链收敛到生产产品函数，下线 OpenBB 第二套处理
- **作者**: zhe
- **状态**: Draft
- **创建日期**: 2026-06-24
- **最后更新**: 2026-06-24
- **关联 Issue**: N/A
- **关联 PR**: N/A
- **取代**: 部分调整 RFC-2026-0001（Backend MCP 集成）确立的"OpenBB 作为 fallback"策略
- **被取代**: N/A

## 摘要

CLI 目前对一批命令维护着一套独立的本地数据处理链（`openbb.ts` + `scripts/*.py` + `.venv`），与 web 产品使用的生产函数（`arti/supabase/functions/*`）口径、计费各行其是，构成"两套处理方法"。本 RFC 将 CLI 收敛为生产后端的瘦客户端，下线 CLI 侧的 OpenBB 实现，使数据口径与 web 产品永远一致、计费统一走 Supabase 函数层。

**v1 范围已收敛**：第一版 CLI 只对外开放 **聊天（chat）/ 快速扫描（quick-scan）/ 全景（full）/ 深度（deep）** 四个能力——这四个本就全部由产品函数提供（`chat`、`scan-stock`、`orchestrator`）。**所有原始数据命令（quote/history/fundamental/economy/market/search/news/crypto/options/scan/predict）v1 不开放**，随 OpenBB 一并退出主链，留待后续版本评估。因此 v1 可直接整条删除 OpenBB，不触及任何"裸数据"取舍问题。

## 动机

### 问题陈述

1. **存在两套处理逻辑**：凡是产品函数已覆盖的能力，CLI 却另走 OpenBB/yfinance 本地链。数据口径（技术指标算法、基本面字段、市值换算）、计费在 CLI 侧与生产产品分别实现，迟早不一致。
2. **OpenBB 链在全新克隆环境直接失效**：新 clone 不会创建 `.venv`，系统 `python3` 也无 `openbb` 包。`history/search/news/fundamental/crypto/options/economy` 全部报错，且真实错误 `No module named 'openbb'` 被错误层包装成误导性的"DNS 解析失败"。
3. **降级链形同虚设**：RFC-2026-0001 设计的"Backend MCP 优先 + OpenBB 降级"假设 OpenBB 永远可用，但现实是 fallback 本身就挂。
4. **维护成本**：CLI 要跟随产品同步技术指标/聚合逻辑，但这些逻辑分散在 Python 脚本里，难以与主产品对齐。

### 用户故事

- 作为投资者，我希望 CLI 查询的数据与 web 产品完全一致，避免同一支股票在两端给出不同数字。
- 作为开发者，我希望只维护一套数据处理逻辑（生产函数），CLI 不再重复实现。
- 作为新用户，我希望 clone 后无需安装 Python/OpenBB 即可使用全部核心命令。

### 现状分析

四个仓库的真实分工（已逐仓核对代码）：

```
                  ┌─────────────────────────────────────────────┐
   web 产品 (arti) │   arti/supabase/functions/  ← 产品函数单一来源   │
   CLI ───────────┤   chat · scan-stock · predict-stock           │
                  │   stock-quotes · resolve-stock · orchestrator │
                  │   cli-auth · credits-settle（用户鉴权 + 计费）   │
                  └───────────────┬─────────────────────────────────┘
                                  │ 重型研报委派
                                  ▼
                       ARTI_backend (Railway)  ← 全景/深度运行时
                       /internal/market/*（内部 token，非用户面）
                                  │ 背后数据源
                                  ▼
                       arti-data （未投产；将来在后端换源，CLI 无感）
```

关键事实：

- CLI 的 `config.api.baseUrl` 已指向 `…supabase.co/functions/v1`，登录（`cli-auth`）、研报（`orchestrator`）用的就是与 web 产品**同一套函数**。
- web 前端只调用少量函数：`scan-stock`、`stock-quotes`、`resolve-stock`、`predict-stock`、`chat`、`generate-report`、`watchlist-memory` 等。
- 产品是"分析驱动"而非"裸数据驱动"：**基本面 / 技术面 / 日线并没有独立函数，而是打包在 `scan-stock` 的返回里**（见 `arti/supabase/functions/scan-stock/index.ts`，港股 PE/PB/ROE、技术指标、前复权日线均在其中算好返回）。
- 裸数据端点 `/internal/market/*`（quote / technicals / daily-bars / financial-reports / market-overview / macro-indicators / stock-context …）位于 `ARTI_backend`，受 `verify_internal_token` 内部鉴权保护，**不过用户计费**，不适合直连分发到每个 CLI 客户端。
- `fetch-news` 是 cron 同步函数（硬编码股票列表 + Finnhub，灌库用），不是按 symbol 查询的用户接口。

CLI 各命令现状（是否仍依赖 OpenBB）：

| 命令 | 已引用的产品函数 | 仍带 OpenBB |
|---|---|---|
| quote | `stock-quotes` | 是 |
| scan / quick-scan | `scan-stock` | 是（quick-scan 已纯后端） |
| search | `resolve-stock` | 是 |
| predict | 未接 | 是（纯 OpenBB） |
| news | 未接 | 是（纯 OpenBB） |
| fundamental / history / economy / market | 未接 | 是（纯 OpenBB） |
| crypto / options | 产品无对应 | 是（纯 OpenBB） |
| full / deep / research | `orchestrator` | 否 ✅ |

## 详细设计

### 方案概述

v1 只保留四个能力，其数据来源全部已是生产产品函数，无需任何"裸数据"取舍：CLI 直接调用这些函数，整条删除 OpenBB 本地链，并把所有原始数据命令从对外命令表中移除（延后到后续版本再评估）。

#### v1 命令 → 产品函数映射（全部复用，零新链路）

| v1 命令 | 目标产品函数 | 鉴权/计费 | 说明 |
|---|---|---|---|
| `chat`（REPL / `arti chat`） | `chat` | 用户 + 计费 | 已引用 |
| `quick-scan <symbol>` | `scan-stock` | 用户 + 计费 | 返回含基本面 + 技术面，统一来源 |
| `full <symbol>` | `orchestrator`（委派 ARTI_backend） | 用户 + 计费 | 已是产品函数，无需改 |
| `deep <symbol>` | `orchestrator`（委派 ARTI_backend） | 用户 + 计费 | 已是产品函数，无需改 |

辅助命令（非数据能力）保留：`login`/`logout`/`whoami`（`cli-auth`）、`config`、`credits`。

#### 交互形态与意图识别（v1 主入口）

v1 采用"REPL 自由文本 + 意图识别"为主入口，**复用产品的 `classify-intent` 函数**做意图分类——不在 CLI 侧另写一套规则（`classify-intent` 本就是产品为替代"前端脆弱的中文正则"而建的统一分类器，用 Haiku 模型）。

```
用户在 REPL 直接打字「茅台怎么样」
        ↓
   classify-intent（与 web 产品同一分类器）
        ↓ intent = quick-scan / panorama / deep / general-chat / …
        ↓
派发 → scan-stock / orchestrator(全景) / orchestrator(深度) / chat
        ↓ 报告类意图但缺 symbol → need-symbol，回问用户"扫哪只？"
```

意图 → 能力 → 函数映射（取自 `arti/supabase/functions/classify-intent`）：

| classify-intent 意图 | v1 能力 | 派发函数 | 备注 |
|---|---|---|---|
| `quick-scan` | 快速扫描 | `scan-stock` | 映射 slash `/f` |
| `panorama` | 全景报告 | `orchestrator` | 映射 slash `/p` |
| `deep` | 深度报告 | `orchestrator` | 映射 slash `/d` |
| `general-chat` | 聊天 | `chat`（内部 `route` 再分 chat/light/deep 深度） | |
| `roundtable` 等 v1 外意图 | — | — | 回"暂未开放" |

**显式命令并存**：保留 `quick-scan <symbol>` / `full <symbol>` / `deep <symbol>` / `chat "<问题>"` 作为直达入口，供脚本与精确指定使用；其与自由文本走同一批产品函数，仅跳过 `classify-intent` 这一步。

- 缺 symbol（`need-symbol`）：REPL 内回问，命令行模式则提示补参。
- v1 范围外意图（`roundtable`、新闻解读等）：统一回"该能力暂未开放"。

#### v1 不开放的命令（移出命令表，延后评估）

`quote`、`scan`、`predict`、`search`、`history`、`fundamental`、`economy`、`market`、`news`、`crypto`、`options`、`watch`、`watchlist`、`export`、`insights`。

处理方式：从 commander 命令注册中**移除**（暂时移除，非隐藏）；REPL 内若被提及给出"该能力暂未开放"提示。**v1 不为这些命令保留任何 OpenBB 兜底**。后续版本若开放，再按"复用产品函数 / 新增产品函数"原则单独立 RFC，详见"未来展望"。

#### 配置变更

- 移除/弃用：`ARTI_DATA_PROVIDER`、`ARTI_DATA_API_URL`、`ARTI_DATA_INTERNAL_KEY`、`ARTI_DATA_TIMEOUT`（OpenBB/arti-data 直连相关）。
- 保留：`api.baseUrl`（Supabase 函数层）、`auth.*`、`backend.*`（研报委派）。

#### 代码删除清单

- `src/openbb.ts`
- `scripts/openbb_daemon.py`、`scripts/openbb_query.py`、其余 OpenBB Python 脚本
- `.venv` 相关安装步骤（`install.sh`、README、CLAUDE.md 中的 OpenBB fallback 说明）
- 各命令中 `import { ... } from "../openbb.js"` 及 fallback 分支

#### 错误信息修复

下线 OpenBB 后，"DNS 解析失败"误报随之消失。保留的网络错误映射需复核，确保后端不可用时给出准确文案（区分"未登录"、"积分不足"、"后端不可用"、"标的不存在"）。

### 实现计划

1. **阶段一：v1 四能力收敛到产品函数**
   - [ ] `quick-scan` → `scan-stock`（删 OpenBB 分支）
   - [ ] `chat` → `chat`（确认 REPL/命令入口已纯产品函数）
   - [ ] `full` / `deep` → `orchestrator`（确认无 OpenBB 依赖）
   - [ ] 验证：四能力数据/结论与 web 产品一致

2. **阶段一·B：REPL 自由文本接 `classify-intent`**
   - [ ] REPL 非命令输入 → 调 `classify-intent` 分类
   - [ ] 按意图派发到 scan-stock / orchestrator / chat
   - [ ] `need-symbol` 回问；v1 外意图回"暂未开放"
   - [ ] 保留 `quick-scan/full/deep/chat` 显式命令直达

3. **阶段二：移除原始数据命令**
   - [ ] 从 commander 注册中移除所有 v1 不开放命令（暂时移除，非隐藏）
   - [ ] 帮助文本同步；REPL 内被调用回"暂未开放"

4. **阶段三：删除 OpenBB 链路**
   - [ ] 删除 `openbb.ts` + Python 脚本 + 相关配置项
   - [ ] 更新 `install.sh`、README、CLAUDE.md，移除 `.venv`/OpenBB 安装步骤
   - [ ] 复核错误文案映射（OpenBB 误报随之消失）

### 测试策略

- **集成测试**：一档每个命令，对同一标的（美/港/A 各一）比对 CLI 输出与对应 Supabase 函数原始返回，断言关键字段一致。
- **回归测试**：`full`/`deep` 不受影响，确认无回归。
- **环境测试**：在无 `.venv`、无 `python3` 的纯净环境跑全部一/二档命令，应全部可用。
- **错误路径**：未登录、积分不足、标的不存在、后端 5xx，断言文案准确。

### 迁移策略

- 保留的四能力对用户基本无感：命令名与参数不变，仅数据来源切换到产品函数。
- 收起的裸数据命令需在 CHANGELOG 与命令帮助中说明"v1 暂未开放，后续版本评估"。
- 移除 OpenBB 后，README "Build from source" 不再需要 `python3 -m venv .venv && pip install openbb`。

## 权衡与替代方案

### v1 命令范围

**方案 A（选中）：只开放 chat / quick-scan / full / deep**
- 优点：四能力全部已是产品函数，零新链路、零裸数据取舍；可立即整删 OpenBB；CLI 与产品口径/计费天然一致。
- 缺点：暂时损失 quote/history/fundamental 等裸数据能力。

**方案 B（未选）：v1 同时保留裸数据命令**
- 优点：能力更全。
- 缺点：裸数据无干净的用户面产品函数（仅 internal_market 内部端点），需新增函数或分发内部 token，范围与风险骤增。
- **为何不选**：与"先交付一致、正确的核心能力"目标冲突，裸数据留待后续版本单独立 RFC。

### 原始数据命令延后的落点（后续版本，非 v1）

记录备查，v1 不实现：

- `fundamental` / `history`：数据已含于 `scan-stock` 返回，可从中抽取。
- `economy` / `market`：仅 `/internal/market/*` 覆盖，需新增用户面 Supabase 函数（**不**直连 internal_market——会把内部 token 分发到客户端、绕过计费、扩大攻击面）。
- `crypto` / `options` / 按 symbol 的 `news`：产品无对应能力，需先在产品侧补齐。

### OpenBB 去留

**彻底删除（选中）**：v1 四能力均不需要 OpenBB，故直接删除 `openbb.ts` + Python 脚本 + `.venv` 依赖。单一链路、新用户零 Python 依赖、无第二套处理。失去的离线能力在"需联网 + 登录 + 计费"的产品形态下意义有限。

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| 收起裸数据命令后老用户能力缺失 | 中 | 低 | CHANGELOG 与帮助文本说明 v1 范围；后续版本评估开放 |
| 计费口径变化（OpenBB 不计费 → 产品函数计费） | 中 | 中 | 评审中确认四能力计费策略，必要时调整每命令 credits |
| `full`/`deep`/`quick-scan` 对美股技术面仍走后端降级（Tushare 无美股日线） | 中 | 中 | 属后端数据源问题，不在本 RFC；后端补源后 CLI 无感 |

## 依赖关系

### 前置依赖

- [ ] 确认 `chat`/`scan-stock`/`orchestrator` 三函数的 CLI 调用契约与计费已就绪（v1 仅依赖这三者）

### 后续依赖

- 后续版本若开放裸数据命令，需 `arti` 仓新增对应用户面 Supabase 函数（另立 RFC）。
- arti-data 投产后，在 ARTI_backend 背后换数据源，CLI 层无感，不需新 RFC。

## 安全性考虑

- **不得**将 `verify_internal_token` 的内部 token 下发到 CLI 客户端。
- 所有数据查询经用户鉴权的 Supabase 函数，纳入统一计费与额度控制。

## 性能影响

- **延迟**：去掉 Python 子进程冷启动（~1-2s），首次查询更快；改为 HTTP 往返。
- **内存**：CLI 不再拉起 Python 常驻进程，占用下降。
- **依赖体积**：移除 `.venv`（OpenBB 依赖较重），安装更轻。

## 可观测性

- **日志**：统一记录目标函数名、标的、市场、耗时、计费结果。
- **指标**：各命令成功率/延迟可在 Supabase 函数侧统一观测，与 web 共享。

## 文档影响

- [ ] README.md（移除 OpenBB/`.venv` 安装；更新数据链说明）
- [ ] CLAUDE.md（移除"OpenBB 作为 fallback""每个 Python 调用是独立子进程"等）
- [ ] docs/BACKEND_API_USAGE.md、docs/ARTI_DATA_INTEGRATION_PLAN.md（标注 OpenBB 链下线）
- [ ] 命令行帮助文本（crypto/options 若下线）
- [ ] CHANGELOG.md

## 已决策

1. **计费口径**：与产品**完全一致**，不为 CLI 重新定价；四能力直接沿用对应产品函数的计费。
2. **v1 不开放命令**：**暂时移除**（从命令表删除），非隐藏；后续版本评估再开放。
3. **chat 入口形态**：采用 **A 方案——REPL 自由文本 + `classify-intent` 意图识别**为主入口，同时保留 `chat/quick-scan/full/deep` 显式命令直达。

## 开放问题

1. `classify-intent` / `route` 对 CLI 调用的鉴权与计费上下文是否已就绪（需与产品侧确认调用契约）。
2. `quick-scan`/`full`/`deep` 对**美股**技术面经后端降级（Tushare 无美股日线）——是否在 v1 接受该降级，后端补源前先上线。

> 原"裸数据取舍（economy/market/crypto/options/news/history）"及"OpenBB 去留"在 v1 范围下已关闭——原始数据命令一律不开放，OpenBB 直接删除。后续版本若开放裸数据，另立 RFC。

## 未来展望

- v1 跑通后，后续版本按需逐个开放裸数据命令——前提是产品侧有对应的用户面函数（fundamental/history 从 `scan-stock` 抽取；economy/market 新增函数；crypto/options/news 待产品补齐），每次开放单独立 RFC。
- CLI 收敛为生产瘦客户端后，arti-data 投产、后端换源对 CLI 完全透明。
- 为多端（Web / Agent / CLI）共用同一套产品函数与计费奠定基础。

## 参考资料

- RFC-2026-0001：Backend MCP 集成
- `arti/supabase/functions/`（产品函数单一来源）
- `ARTI_backend/apps/api/handlers/internal_market_handler.py`（内部数据端点）
- `docs/ARTI_DATA_INTEGRATION_PLAN.md`

---

## 讨论记录

### 2026-06-24 - zhe

明确核心原则：CLI 复用生产产品现有函数，避免维护第二套处理逻辑；arti-data 未投产，先不纳入。OpenBB 可移除。

**决策**: 采用"CLI = 生产瘦客户端"方向。**v1 范围收敛**：只开放 chat / quick-scan / full / deep 四能力（均为现成产品函数），原始数据命令一律不开放，OpenBB 直接删除。原"裸数据取舍/OpenBB 去留"开放问题在 v1 范围下关闭，延后到后续版本另立 RFC。

补充三项决策：(1) 计费口径与产品一致，不重新定价；(2) v1 不开放命令暂时移除（非隐藏）；(3) chat 入口采用"REPL 自由文本 + 复用产品 `classify-intent` 意图识别"为主、显式命令并存——意图识别复用产品分类器，CLI 不另写规则。

---

## 变更历史

| 日期 | 作者 | 变更内容 |
|---|---|---|
| 2026-06-24 | zhe | 创建 RFC |
