# RFC-2026-0004: ARTi Poly CLI 集成

## 元数据

- **RFC 编号**: RFC-2026-0004
- **标题**: ARTi Poly CLI 集成 — `arti poly` 通过主站 Edge Function 访问预测市场数据
- **作者**: zhe
- **状态**: Draft
- **创建日期**: 2026-07-08
- **最后更新**: 2026-07-09
- **关联 RFC（外部）**: ARTi-poly RFC-2026-0005（公开 API）、ARTi-poly RFC-2026-0022（同源化部署）

## 摘要

在 ARTI-CLI（`arti` 命令）中新增 `arti poly` 子命令组。第一方 CLI 不直接调用 ARTi-poly Public API，也不使用 `X-API-Key`；它复用现有 `arti login` 登录态，通过主站 Supabase Edge Function `poly-data` 获取预测市场数据。

Phase 1 只做只读查询；Credits 下注和 AI 流式分析延后到 Phase 2。

## 当前实现校准（2026-07-09）

第一版 RFC 曾建议 `arti poly` 直接调用 Public API v1，并使用 `X-API-Key` 或直接 Bearer 调 `/api/v1/*`。该方向已被修正：

- `arti` 第一方 CLI 统一走现有 `callEdge()` 链路。
- `arti poly` 调用 `callEdge("poly-data", { path })`。
- `poly-data` 位于主站 `arti/supabase/functions/poly-data`，负责校验 `arti login` Bearer token 并代理预测市场只读数据。
- 第三方 Public API 继续以 `X-API-Key` 为主鉴权方式。
- `poly.apiBaseUrl` / `ARTI_POLY_API_URL` 不再参与 `arti poly` 运行时；保留仅作历史兼容，后续可清理。

## 动机

### 问题陈述

用户希望在终端快速查看预测市场摘要、事件列表、事件详情和跨平台价差，并与现有 `arti` 登录态和 REPL 工作流无缝衔接。

### 用户故事

- 作为 `arti` 用户，我希望用 `arti poly events` 直接在终端看到当前热门预测市场事件，不用开浏览器。
- 作为 `arti` 用户，我希望用 `arti poly event <slug>` 查看某个事件的市场详情和外部赔率。
- 作为 `arti` 用户，我希望用 `arti poly summary` 获取热门事件和 ARTi Pick 快照。
- 作为 `arti` 用户，我希望用 `arti poly compare` 查看 Polymarket/Kalshi 跨平台价差。

## 详细设计

### 命令形态

```bash
arti poly events [--limit <n>] [--source polymarket|kalshi] [--category <category>]
arti poly event <slug> [--source polymarket|kalshi]
arti poly summary [--limit <n>]
arti poly compare
arti poly search <keyword> [--limit <n>]
```

REPL 中同样可用：

```text
> poly events
> poly event us-election-2026
```

### 技术方案

#### ARTI-CLI

`src/poly/api.ts` 保留 `polyGet(path)` 对上层命令的接口，但底层改为：

```typescript
import { callEdge } from "../api.js";

interface PolyDataResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export async function polyGet<T>(path: string): Promise<T> {
  const res = await callEdge<PolyDataResponse<T>>("poly-data", { path });
  return res.data;
}
```

这样 `arti poly` 与 `quick-scan/full/deep/chat` 使用同一认证和网络路径：

```text
ARTI-CLI -> Supabase Edge Function -> 主站 predict 数据入口
```

#### 主站 Edge Function：`poly-data`

新增：

```text
arti/supabase/functions/poly-data/index.ts
```

请求：

```http
POST /functions/v1/poly-data
Authorization: Bearer <arti login token>
Content-Type: application/json

{ "path": "events?limit=3&source=polymarket" }
```

职责：

1. 校验 `Authorization: Bearer` 对应的 Supabase 用户。
2. 校验 `path` 是 allowlisted relative path，避免 SSRF。
3. 用服务端配置调用主站 predict 只读数据入口。
4. 返回主站统一 Edge Function envelope。

允许路径：

- `events`
- `events/<slug>`
- `summary`
- `market-comparison`
- `markets/search`

### Phase 1 命令范围

| 命令 | poly-data path | 说明 |
|---|---|---|
| `poly events` | `events?...` | 事件列表，支持 limit/source/category |
| `poly event <slug>` | `events/<slug>?...` | 事件详情 + 市场列表 |
| `poly summary` | `summary?...` | 热门事件 + ARTi Pick |
| `poly compare` | `market-comparison` | 跨平台赔率对比 |
| `poly search <q>` | `markets/search?source=kalshi&q=...` | Kalshi 市场搜索 |

均为只读请求，不涉及下注、Credits、AI 流式分析。

## 权衡与替代方案

### 方案 A — ARTI-CLI 调主站 Edge Function（选中）

**优点**：

- 与现有 `arti` CLI 架构一致。
- 用户只需 `arti login`。
- CLI 不依赖前端同源路径、Cloudflare、多 Zone rewrite 或 ARTi-poly 独立 Vercel URL。
- Public API 可以继续清晰地服务第三方 `X-API-Key` 场景。

**缺点**：

- 需要新增并部署一个主站 Supabase Edge Function。
- `poly-data` 和 predict 数据入口之间会有一层服务端 HTTP 调用。

### 方案 B — CLI 直接调用 ARTi-poly Public API（已放弃）

**缺点**：

- 会把第一方 CLI 绑定到公开 API / 前端部署路径。
- `arti login` 和 `X-API-Key` 体验割裂。
- 后续 Credits、AI、下注等用户态功能仍要重新改链路。

### 方案 C — ARTi-poly 自带独立 CLI（未选中）

**为何不选**：安装、配置和 REPL 体验都会分裂；ARTi-poly 是前端应用仓库，添加独立 CLI 工具链成本高。

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| `poly-data` path 校验不严导致 SSRF | 中 | 高 | 只接受 allowlisted relative path，拒绝 URL、`//`、`..`、反斜杠 |
| 上游 predict 数据入口变化 | 中 | 中 | Edge Function 使用 `ARTI_POLY_INTERNAL_BASE_URL` 配置；CLI 不感知 |
| 双层 envelope 处理错误 | 中 | 中 | `polyGet` 只 unwrap `poly-data` 外层，保留 predict 数据 envelope 给现有 formatter |
| `poly-data` 未上线时 CLI 404 | 中 | 中 | 先部署主站 Edge Function，再合并/发布 CLI |

## 开放问题

- `poly.apiBaseUrl` / `ARTI_POLY_API_URL` 当前已不参与运行时。为减少破坏，先保留；后续单独清理。
- `ARTi-poly /api/v1/*` 已支持 Bearer 的兼容逻辑可以保留，但不作为 `arti poly` 主链路。

## 变更历史

| 日期 | 作者 | 变更内容 |
|---|---|---|
| 2026-07-08 | zhe | 创建 RFC |
| 2026-07-08 | zhe | 修正鉴权决策：`arti poly` 复用 `arti login`，不再要求 `poly.apiKey` |
| 2026-07-08 | zhe | 将默认 Base URL 更新为同源生产路径 `/app/predict/api/v1` |
| 2026-07-09 | zhe | 再次收敛架构：`arti poly` 改为通过主站 `poly-data` Edge Function 获取数据 |
