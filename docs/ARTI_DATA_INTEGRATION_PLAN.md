# ARTI-CLI × arti-data Integration Plan

目标：把 `arti-data` 作为 ARTI CLI 的上游数据平台，逐步替代 CLI 当前“请求时临时拉 OpenBB/yfinance”的数据路径。

适用仓库：
- 当前仓库：`ARTI-CLI`
- 上游数据平台：`botearn/arti-data`

---

## 1. 现状与问题

## 1.1 ARTI-CLI 当前数据链路

当前 CLI 数据链路是：

1. TS 命令层调用 `src/openbb.ts`
2. `openbb.ts` 通过 `scripts/openbb_daemon.py`（优先）或 `scripts/openbb_query.py`（降级）
3. Python 侧调用 OpenBB / yfinance / sec / federal_reserve

优点：
- 本地可跑，零后端依赖（多数命令）
- 开发体验快

限制：
- 数据口径依赖 provider 实时返回，跨市场统一性弱
- 技术指标/聚合逻辑分散在 CLI 侧，难与主产品对齐
- `research` 缺少稳定的预聚合上下文，结果波动更大
- 多源融合（资金面、政策、舆情、cross-market）难落地

## 1.2 arti-data 的定位（根据仓库结构）

`arti-data` 不是单一 provider SDK，而是完整数据平台：

- `providers/`：多数据源采集
- `pipelines/`：采集与加工流水线
- `store/` + `schema/`：标准层入库与数据模型
- `api/`：应用消费接口
- 文档中定义了消费模式：标准表 / 物化视图 / `agent_context_*`

结论：`arti-data` 应作为 **上游 canonical data backend**，不是把名字塞进当前 `provider=` 参数就完事。

---

## 2. 目标架构

CLI 最终采用“双通道”：

1. **实时轻查询通道（保留）**
- 继续用现有 `fast_quote`（yfinance）做低延迟临时行情

2. **标准化数据通道（新增）**
- CLI 通过 `arti-data` 的 Consumer API（优先）或 Supabase 只读（备选）读取标准层数据
- `research` 优先读取 `agent_context_*` 数据包

---

## 3. 接入策略（推荐）

## 3.1 优先方案：HTTP Consumer API（推荐）

由 `arti-data` 暴露稳定 HTTP 接口，CLI 仅做读请求。

优点：
- CLI 与数据库解耦
- 权限边界更清晰（不把 DB 直连暴露到每个 CLI 客户端）
- 更利于未来多端统一（Web/Agent/CLI 共用）

建议新增 CLI 配置：

- `ARTI_DATA_API_URL`
- `ARTI_DATA_API_KEY`（可选，若需要 Internal API 鉴权）
- `ARTI_DATA_TIMEOUT`

## 3.2 备选方案：Supabase 只读直查

CLI 直接查 `arti-data` 标准层表/视图（只读 key + RLS）。

优点：
- 起步快

缺点：
- 客户端要携带查询结构，后续演进成本高
- 接口契约不如 HTTP 稳定

适合：
- 内部联调阶段
- API 尚未稳定时过渡

---

## 4. 命令级迁移顺序（小步上线）

原则：
- 先低风险、结构化强的命令
- 再迁移高复杂的 `research`
- 每步都保留 OpenBB fallback，可快速回滚

### Phase 1（首批）

迁移命令：
- `history`
- `fundamental`
- `economy`

原因：
- 返回结构明确
- 与标准层/视图匹配度高
- 业务风险低

### Phase 2

迁移命令：
- `scan`（底层 K 线改读标准层）
- `news`（若 `arti-data` 提供清洗后新闻层）

### Phase 3（重点）

迁移命令：
- `research`

方式：
- 优先读 `agent_context_*`（technical / financial / capital / macro / policy / cross-market）
- 由 orchestrator 使用结构化 context，减少临时抓取与 token 噪声

### Phase 4（可选）

- `search`、`market`、`watchlist` 的底层统一到 `arti-data` 视图
- `quote` 是否迁移视延迟要求决定（可能继续保留 fast_quote）

---

## 5. CLI 代码改造点（ARTI-CLI）

## 5.1 新增数据客户端层

新增文件建议：

- `src/data/client.ts`
  - `callArtiData(path, payload)`
  - 超时、重试、错误归一化
- `src/data/types.ts`
  - `ArtiDataHistoryRecord` 等 DTO
- `src/data/mappers.ts`
  - 上游字段 -> CLI 现有输出结构映射

## 5.2 命令层改造方式

以 `history` 为例：

1. 先尝试 `arti-data` 客户端拉取
2. 成功则返回
3. 失败则 fallback 到现有 `getHistorical`（OpenBB）
4. 打日志标记数据来源（`arti-data` / `openbb-fallback`）

## 5.3 配置层改造

扩展 `src/config.ts`：

- `data: { provider: "openbb" | "arti-data" | "hybrid", apiBaseUrl, timeout }`

环境变量覆盖：

- `ARTI_DATA_PROVIDER`
- `ARTI_DATA_API_URL`
- `ARTI_DATA_TIMEOUT`
- `ARTI_DATA_API_KEY`（若需要）

默认建议：
- `provider = hybrid`（先走 arti-data，失败回退 openbb）

---

## 6. 接口契约建议（CLI 视角）

请在 `arti-data` 侧稳定这些 endpoint（示例）：

- `POST /consumer/history`
- `POST /consumer/fundamental`
- `POST /consumer/economy`
- `POST /consumer/research-context`

统一响应建议：

```json
{
  "ok": true,
  "data": { "...": "..." },
  "meta": {
    "source": "arti-data",
    "as_of": "2026-05-13T10:00:00Z",
    "schema_version": "v1"
  }
}
```

失败响应：

```json
{
  "ok": false,
  "error": {
    "code": "UPSTREAM_TIMEOUT",
    "message": "..."
  }
}
```

这样 CLI 侧能稳定映射错误并决定是否 fallback。

---

## 7. 安全与权限

不建议：
- 在 CLI 中使用 Supabase `service_role`
- 暴露可写权限

建议：
- Consumer API 使用独立只读鉴权（`INTERNAL_API_KEY` 或签名）
- 或 Supabase 只读 key + 严格 RLS
- CLI 日志不打印 key / token

---

## 8. 观测与回滚

## 8.1 观测指标

CLI 侧至少记录：
- `data_source`（arti-data/openbb-fallback）
- 请求耗时
- 错误码分布
- fallback 率

## 8.2 回滚策略

通过配置快速切换：
- `ARTI_DATA_PROVIDER=openbb` 直接全量回退

保持策略：
- 在迁移完成前，不删除现有 `openbb.ts` 路径

---

## 9. 里程碑建议

### M1（1-2 天）
- CLI 增加 `arti-data` 客户端骨架与配置
- `history` 接入 `hybrid`

### M2（2-4 天）
- `fundamental`、`economy` 接入
- 增加来源标记和错误归一化

### M3（3-5 天）
- `research` 接 `agent_context_*`
- 对齐主产品研报上下文结构

### M4（持续）
- 视延迟和稳定性，决定 `market/search/news/quote` 的进一步迁移比例

---

## 10. 落地结论

对 ARTI-CLI 来说，`arti-data` 的最佳角色是：

- **标准化数据后端（source of truth）**
- 通过 API/视图给 CLI 提供稳定消费层
- CLI 保留 OpenBB 作为 fallback/实时补充，而不是完全替换为单源

这条路径风险最小、回滚简单，并且能把 CLI 与主产品的数据口径逐步对齐。
