# RFC-2026-0004: ARTi Poly CLI 集成

## 元数据

- **RFC 编号**: RFC-2026-0004
- **标题**: ARTi Poly CLI 集成 — `arti poly` 子命令接入 ARTi-poly 数据 API
- **作者**: zhe
- **状态**: Draft
- **创建日期**: 2026-07-08
- **最后更新**: 2026-07-08
- **关联 RFC（外部）**: ARTi-poly RFC-2026-0005（公开 API）、RFC-2026-0022（同源化部署）

## 摘要

在 ARTI-CLI（`arti` 命令）中新增 `arti poly` 子命令组，通过现有 `arti login` 登录态访问 ARTi-poly 预测市场数据。Phase 1 只做只读查询；Credits 下注和 AI 流式分析延后到 Phase 2。

## 当前实现校准（2026-07-08）

第一版 RFC 曾建议 `arti poly` 直接使用 Public API v1 的 `X-API-Key`。该口径已被修正：`arti` 用户已经通过 `arti login` 建立 Supabase session，CLI 子命令不应再要求用户单独申请和配置 Public API Key。

当前决策：

- `arti poly` 使用现有 `auth.token`，请求 Header 为 `Authorization: Bearer <token>`。
- ARTi-poly `/api/v1/*` 保留 `X-API-Key` 给第三方开发者，同时接受 `Authorization: Bearer` 给第一方 CLI / 登录用户。
- CLI 只保留 `poly.apiBaseUrl` 作为部署路径 override；不新增 `poly.apiKey`。
- 未登录或 token 过期时提示用户运行 `arti login`。

## 动机

### 问题陈述

ARTi-poly 已有预测市场数据 API，但目前主要通过浏览器/HTTP 客户端访问。用户希望在终端快速查看预测市场摘要、事件列表、事件详情和跨平台价差，并与现有 `arti` 登录态和 REPL 工作流无缝衔接。

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

REPL 中同样可用（通过统一 CommandDef 注册）：

```text
> poly events
> poly event us-election-2026
```

### 技术方案

#### 目录结构

```text
src/
  poly/
    api.ts        # fetch 封装，注入 Authorization: Bearer，读取 poly.apiBaseUrl
    format.ts     # 表格/摘要格式化
    commands.ts   # poly 子动作分发
```

### `src/poly/api.ts`

`polyGet` 使用现有 auth 模块：

```typescript
import { ensureValidAccessToken } from "../auth.js";
import { loadConfig } from "../config.js";

export async function polyGet<T>(path: string): Promise<T> {
  const token = await ensureValidAccessToken();
  if (!token) throw new Error("未登录。运行: arti login");

  const baseUrl = loadConfig().poly.apiBaseUrl.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  const res = await fetch(`${baseUrl}/${normalizedPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Poly API ${res.status}`);
  return res.json() as Promise<T>;
}
```

### 配置键

新增 `poly` 命名空间到 `ArtiConfig`：

```typescript
poly: {
  apiBaseUrl: string; // 默认 https://www.artifin.ai/app/predict/api/v1
};
```

`ALLOWED_CONFIG_KEYS` 新增：

```text
poly.apiBaseUrl
```

环境变量覆盖：

```text
ARTI_POLY_API_URL
```

### Phase 1 命令范围

| 命令 | ARTi-poly 端点 | 说明 |
|---|---|---|
| `poly events` | `GET /events` | 事件列表，支持 limit/source/category |
| `poly event <slug>` | `GET /events/<slug>` | 事件详情 + 市场列表 |
| `poly summary` | `GET /summary` | 热门事件 + ARTi Pick |
| `poly compare` | `GET /market-comparison` | 跨平台赔率对比 |
| `poly search <q>` | `GET /markets/search?source=kalshi&q=...` | Kalshi 市场搜索 |

均为只读 GET 请求，不涉及下注、Credits、AI 流式分析。

### 测试策略

- **单元测试**：`polyGet` 注入 Bearer token、未登录报错、4xx/5xx 错误体解析。
- **集成测试**：本机已登录后执行 `arti poly events --limit 5`。
- **回归测试**：`npm test`、`npm run build`。

## 权衡与替代方案

### 方案 A — 放入 ARTI-CLI 并复用登录态（选中）

**优点**：
- 用户只需 `arti login`，不需要额外 API Key。
- 复用现有 install、config、REPL、output、auth 基础设施。
- 后续 Phase 2 接 Credits / AI / 下注时可沿用同一用户身份。

**缺点**：
- ARTi-poly `/api/v1/*` 需要同时支持 Public API Key 和第一方 Bearer 登录态。

### 方案 B — 使用 Public API Key（已放弃）

**优点**：实现简单，复用公开 API 的第三方鉴权。

**缺点**：对 `arti` 用户体验不合理；用户已登录仍需申请 key，且与未来 Credits/AI 登录态能力割裂。

### 方案 C — ARTi-poly 自带独立 CLI（未选中）

**为何不选**：安装、配置和 REPL 体验都会分裂；ARTi-poly 是前端应用仓库，添加独立 CLI 工具链成本高。

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| ARTi-poly API 未部署 Bearer 登录态支持 | 中 | 中 | 同步修改 ARTi-poly v1 鉴权；CLI 未登录/未授权时明确提示 |
| 生产 Base URL 未来再次迁移 | 中 | 低 | 默认使用同源 `/app/predict/api/v1`；保留 `poly.apiBaseUrl` override |
| ARTi-poly API 返回结构变化 | 低 | 中 | 格式化层做字段缺省降级，测试覆盖错误体解析 |

## 开放问题

当前无开放问题。默认 Base URL 使用同源生产路径 `https://www.artifin.ai/app/predict/api/v1`；如部署拓扑未来变化，通过 `poly.apiBaseUrl` 覆盖并同步更新默认值。

## 变更历史

| 日期 | 作者 | 变更内容 |
|---|---|---|
| 2026-07-08 | zhe | 创建 RFC |
| 2026-07-08 | zhe | 修正鉴权决策：`arti poly` 复用 `arti login`，不再要求 `poly.apiKey` |
| 2026-07-08 | zhe | 将默认 Base URL 更新为同源生产路径 `/app/predict/api/v1` |
