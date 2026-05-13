# ARTI CLI 文档目录

本目录包含 ARTI CLI 的所有技术文档、架构说明和开发计划。

## 文档列表

### 核心架构

- [**agents.md**](agents.md) — AI 分析师系统架构与角色说明
  - Layer 1：8 位专业分析师（Natasha、Steve、Tony、Thor、Clint、Sam、Vision、Wanda）
  - Layer 2：投资大师圆桌辩论（巴菲特、林奇、马克斯、索罗斯等）
  - Layer 3：综合裁定与分歧点分析

### 数据源

- [**ARTI_DATA_INTEGRATION_PLAN.md**](ARTI_DATA_INTEGRATION_PLAN.md) — arti-data 高级数据源接入计划
  - A 股技术面数据增强方案
  - hybrid 数据源切换逻辑
  - history / scan / predict / research 的分步接入计划

### 商业模式

- [**BILLING_FLOW.md**](BILLING_FLOW.md) — Credit 计费流程、套餐对比与升级引导
  - Free / Basic / Pro / Flagship 四档套餐
  - Credit 消耗规则（查询 1、快速扫描 5、全景 30、深度 100）
  - 自选股上限与权益对比
  - 下载体验、本地联调与真实付费边界

### 功能清单

- [**CLI_FEATURES.md**](CLI_FEATURES.md) — CLI 功能清单与开发进度
  - 已实现功能列表
  - 计划中功能
  - 各命令的参数、输出格式与计费说明

### 集成

- [**codex.md**](codex.md) — Codex 集成说明
  - 与 OpenAI Codex CLI 的集成方案
  - 代码审查与挑战模式使用方式

## 快速导航

- 想了解 AI 分析师如何工作？→ [agents.md](agents.md)
- 需要接入 A 股数据？→ [ARTI_DATA_INTEGRATION_PLAN.md](ARTI_DATA_INTEGRATION_PLAN.md)
- 想知道计费规则？→ [BILLING_FLOW.md](BILLING_FLOW.md)
- 查看功能完成度？→ [CLI_FEATURES.md](CLI_FEATURES.md)
- 集成 Codex？→ [codex.md](codex.md)

## 返回主文档

- [← 返回项目 README](../README.md)
- [← 返回 CLAUDE.md（项目说明）](../CLAUDE.md)
