# Report Terminology Standard

This document defines the report-facing terminology that prompts, schemas, and
UI adapters should converge on.

## Core Terms

- Direction judgment: `看多 / 中性 / 看空`
- Rating action: `增持 / 中性 / 减持`
- Trading action: `增持 / 观望 / 减持`
- Scenario names: `乐观情景 / 基准情景 / 悲观情景`
- Signal strength: `强 / 中 / 弱`

## Usage Rules

- Use `看多 / 中性 / 看空` for trend, stance, momentum, and roundtable views.
- Use `增持 / 中性 / 减持` for rating-style conclusions.
- Use `增持 / 观望 / 减持` for short/mid/long action advice and execution plans.
- Keep direction and strength separate. Example: `看多` + `强`, not `强做多`.

## Deprecated Terms

Do not emit these as final report-facing conclusions:

- `强买入 / 买入 / 卖出 / 强卖出`
- `强做多 / 做多 / 做空 / 强做空`
- `持有`
- `回避`
- `试多`
- `加仓 / 减仓`

Compatibility layers may still normalize legacy outputs into the standard set,
but new prompts and schemas should produce the standard terms directly.
