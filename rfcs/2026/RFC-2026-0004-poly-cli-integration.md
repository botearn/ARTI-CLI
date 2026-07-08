# RFC-2026-0004: ARTi Poly CLI 集成

## 元数据

- **RFC 编号**: RFC-2026-0004
- **标题**: ARTi Poly CLI 集成 — `arti poly` 子命令接入 ARTi-poly 公开 API
- **作者**: zhe
- **状态**: Draft
- **创建日期**: 2026-07-08
- **最后更新**: 2026-07-08
- **关联 RFC（外部）**: ARTi-poly RFC-2026-0005（公开 API）、RFC-2026-0022（同源化部署）

## 摘要

在 ARTI-CLI（`arti` 命令）中新增 `arti poly` 子命令组，通过 ARTi-poly 公开 API v1（`X-API-Key` 鉴权）提供预测市场数据的 CLI 访问能力。Phase 1 只做只读查询；登录态功能、Credits 下注和 AI 分析延后到 Phase 2。

## 动机

### 问题陈述

ARTi-poly 已有 Public API v1，但目前只能通过浏览器/HTTP 客户端访问。用户希望在终端快速查看预测市场的摘要、事件列表、事件详情和跨平台价差，与现有 `arti` 工作流无缝衔接。

### 用户故事

- 作为 `arti` 用户，我希望用 `arti poly events` 直接在终端看到当前热门预测市场事件，不用开浏览器。
- 作为 `arti` 用户，我希望用 `arti poly event <slug>` 查看某个事件的市场详情和外部赔率，以便在 REPL 里进一步分析。
- 作为 `arti` 用户，我希望用 `arti poly summary <slug>` 获取 AI 摘要快照。
- 作为 `arti` 用户，我希望用 `arti poly compare <slugA> <slugB>` 对比两个跨平台市场的赔率价差。

### 现状分析

目前 ARTI-CLI 通过 `callEdge()` 调用 Supabase Edge Functions，使用 `Authorization: Bearer <token>` 认证。ARTi-poly 公开 API v1 使用独立的 `X-API-Key` Header 认证，两套 auth 完全隔离：

- 公开 API 不需要 Supabase 登录态，只需持有 API Key。
- API Key 通过 `POST /api/public/request-key` 自助申请，存储在 Supabase `public_api_keys` 表。
- 公开 API 的 Base URL 依赖 ARTi-poly 的部署路径（待确认 canonical URL）。

两套 auth 之所以分开，是设计意图：公开 API 面向第三方开发者，Supabase session 面向登录用户，不能混用。

## 详细设计

### 命令形态

```bash
arti poly events [--limit <n>] [--search <keyword>]
arti poly event <slug>
arti poly summary <slug>
arti poly compare <slugA> <slugB>
arti poly search <keyword>
```

REPL 中同样可用（通过统一 CommandDef 注册）：

```
> poly events
> poly event us-election-2026
```

### 技术方案

#### 目录结构

```
src/
  poly/
    api.ts        # fetch 封装，注入 X-API-Key，读 poly.apiBaseUrl / poly.apiKey
    format.ts     # 表格/摘要格式化，风格对齐 src/format.ts
    commands.ts   # CommandDef 定义，注册到 registry
```

`commands/poly.ts` 作为 Commander subcommand 入口，调用 `src/poly/commands.ts` 里的 handler。

#### `src/poly/api.ts`

```typescript
import { loadConfig } from "../config.js";

const DEFAULT_POLY_BASE_URL = "https://predict.artifin.ai/api/v1";

function polyBase(): string {
  const cfg = loadConfig();
  return cfg.poly?.apiBaseUrl ?? DEFAULT_POLY_BASE_URL;
}

function polyKey(): string {
  const cfg = loadConfig();
  return cfg.poly?.apiKey ?? "";
}

export async function polyGet<T>(path: string): Promise<T> {
  const key = polyKey();
  if (!key) throw new Error("未设置 poly API Key。运行: arti config set poly.apiKey <your-key>");
  const url = `${polyBase()}/${path}`;
  const res = await fetch(url, {
    headers: { "X-API-Key": key },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`poly API ${res.status}: ${body.error ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}
```

`polyGet` 独立于现有 `callEdge()`，不共享 Bearer token，不引入新的 npm 依赖（使用 Node.js 内置 `fetch`）。

#### 配置键

新增 `poly` 命名空间到 `ArtiConfig`：

```typescript
poly?: {
  apiBaseUrl?: string;  // 默认 https://predict.artifin.ai/api/v1（待 canonical URL 确认）
  apiKey?: string;
};
```

`ALLOWED_CONFIG_KEYS` 新增：

```
"poly.apiBaseUrl"
"poly.apiKey"
```

`loadConfig()` 的 spread 合并加入 `poly: { ...DEFAULT_CONFIG.poly, ...saved.poly }`。

`DEFAULT_CONFIG.poly` 为 `{ apiBaseUrl: DEFAULT_POLY_BASE_URL, apiKey: "" }`。

#### Phase 1 命令范围

| 命令 | ARTi-poly 端点 | 说明 |
|---|---|---|
| `poly events` | `GET /v1/events` | 事件列表，支持 limit/search |
| `poly event <slug>` | `GET /v1/events/<slug>` | 事件详情 + 市场列表 |
| `poly summary <slug>` | `GET /v1/events/<slug>/summary` | AI 摘要（缓存版） |
| `poly compare <a> <b>` | `GET /v1/market-comparison?...` | 跨平台赔率对比 |
| `poly search <q>` | `GET /v1/search?q=...` | 全文搜索 |

均为只读 GET 请求，不涉及下注、Credits、AI 流式分析。

#### 格式化输出

- `poly events`：表格，列：序号 / 事件标题（中文，截断 40 字） / 平台 / 赔率范围 / 截止时间。
- `poly event <slug>`：标题 + 市场列表表格（问题 / YES% / NO% / 交易量）。
- `poly summary <slug>`：纯文本段落，`output.ts` 的 `printMarkdown` 渲染。
- `poly compare`：两列对比表格，行：指标，列：平台 A / 平台 B / 价差。
- 风格统一遵循 `src/output.ts` 的 `printTable` / `printMarkdown`。

### 实现计划（Phase 1）

1. **配置扩展**
   - [ ] `src/config.ts`：`ArtiConfig` 新增 `poly?` 命名空间；`DEFAULT_CONFIG` 填默认值；`loadConfig()` 合并 `poly`；`ALLOWED_CONFIG_KEYS` 新增两个键。

2. **API 层**
   - [ ] 新建 `src/poly/api.ts`。

3. **格式化层**
   - [ ] 新建 `src/poly/format.ts`，实现各命令的表格格式化函数。

4. **命令定义**
   - [ ] 新建 `src/poly/commands.ts`，定义 `CommandDef[]`，注册到 `src/core/registry.ts`。
   - [ ] 新建 `src/commands/poly.ts`，作为 Commander subcommand，绑定到 `src/index.ts`。

5. **文档**
   - [ ] 更新 `README.md`，在命令列表中加入 `arti poly` 子命令。

### 测试策略

- **单元测试**：`polyGet` 错误处理（无 key、4xx、5xx）；格式化函数的表格截断和空数组边界。
- **集成测试**：需要真实 API Key，可跳过 CI（标记 `SKIP_POLY_INTEGRATION=1`）。
- **手动验证**：`arti poly events --limit 5` 输出非空表格；`arti poly event <known-slug>` 输出市场详情；`arti config set poly.apiKey <key>` 后立即生效。

## 权衡与替代方案

### 方案 A — 放入 ARTI-CLI（选中）

在现有 `arti` 包里新增 `arti poly` 子命令组。

**优点**：
- 复用现有 install 路径（单一 `npm i -g artifin-cli`）、config 文件、output 格式化、REPL 注册机制。
- 用户无需管理第二个 CLI 工具或额外 config。
- 未来 Phase 2 接入登录态下注只需在已有 auth 基础上添加凭证传递逻辑，不用跨包协调。

**缺点**：
- `arti` 包体积略增；预测市场与金融数据命令混在同一命名空间。
- 对不关心预测市场的用户会看到更多命令。

### 方案 B — ARTi-poly 自带独立 CLI（未选中）

在 ARTi-poly 仓库里新增 `bin/arti-poly` 命令。

**优点**：关注点分离，ARTi-poly 可独立发布 CLI。

**缺点**：
- 用户需要单独安装第二个工具，管理两套 config 文件。
- 无法复用 ARTI-CLI 的 REPL、output、billing、auth 基础设施。
- ARTi-poly 是前端项目，添加 CLI 工具链有架构噪音。

**为何不选**：安装和维护成本不合理；共用 REPL 的价值更大。

### 方案 C — 第三个独立包（未选中）

新建 `arti-poly-cli` npm 包。

**为何不选**：三个独立包的维护和发版协调成本太高，用户体验更差，没有对应收益。

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| Canonical Base URL 未确认，默认值可能失效 | 中 | 低 | `poly.apiBaseUrl` 可配置覆盖；用户看到清晰错误提示 |
| ARTi-poly API 变更破坏类型 | 低 | 中 | `polyGet<T>` 泛型，格式化层做防御性检查（字段不存在降级展示） |
| Phase 2 登录态需求改变 auth 设计 | 低 | 低 | Phase 1 只读；Phase 2 设计留待 RFC |

## 依赖关系

### 前置依赖

- ARTi-poly RFC-2026-0005（公开 API）已 Accepted，API 合约稳定。
- ARTi-poly 已部署 `POST /api/public/request-key`，用户可自助申请 key。

### 后置依赖

- Phase 2 RFC（待写）：`arti poly bet`、`arti poly portfolio`（需要登录态 + Credits）。

## 开放问题

1. **Canonical Base URL**：ARTi-poly 公开 API 的最终 canonical URL 尚未确认（`predict.artifin.ai/api/v1` vs `www.artifin.ai/predict/api/v1`）。`DEFAULT_POLY_BASE_URL` 暂用 `predict.artifin.ai/api/v1`，用户可通过 `arti config set poly.apiBaseUrl <url>` 覆盖。确认后更新常量和文档。

2. **Key 前缀约定**：`poly.apiKey` 存明文于 `~/.config/arti/config.json`，与现有 `auth.token`（Bearer）存储位置相同。若未来需要多 key 或 key 轮换，需要新的设计；Phase 1 暂不处理。

## 变更历史

| 日期 | 作者 | 变更内容 |
|---|---|---|
| 2026-07-08 | zhe | 创建 RFC |
