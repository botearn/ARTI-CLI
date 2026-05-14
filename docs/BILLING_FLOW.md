# ARTI CLI Billing Flow

> 更新于 2026-05-14：
> 当前 CLI 已切换到 **服务端 Credits 真源**，`credits` 与扣费不再以本地 `~/.config/arti/billing.json` 为准。
> 本文档以下大部分内容描述的是 **旧的本地模拟计费方案**，保留仅用于历史对照，不能再作为当前行为说明。

当前真实行为以这些入口为准：

- `arti credits`：显示服务端真实套餐、周包剩余、永久余额、5h 窗口、动作定价
- `arti login`：支持邮箱密码或 access token + refresh token
- README 的 “Credit 计费” 章节

---

以下为历史方案说明。

## 现在用户下载后会发生什么

1. 用户安装依赖并运行 `arti`。
2. 第一次触发计费相关命令时，CLI 会在本地生成 `~/.config/arti/billing.json`。
3. 默认进入 `free` 套餐。
4. 新用户首月默认拿到 `400 Credits`。
5. 用户可以直接开始体验已接入计费的命令。
6. 每次调用后，Credits 在本地扣减。
7. 用户可以通过 `arti credits` 查看余额、套餐和权益。
8. 到下一个月时，按当前套餐执行月度重置。

## 当前默认套餐

- `free`
- 首月体验额度：`400 Credits`
- 常规月配额：`100 Credits`
- 自选股上限：`1`

## 当前已接入扣费的命令

### `1 Credit / 次`

- `arti quote`
- `arti market`
- `arti news`
- `arti history`
- `arti search`
- `arti watch`
- `arti watchlist` 查看行情时

### `5 Credits / 次`

- `arti scan`
- `arti predict`

### `30 Credits / 次`

- `arti research --agent ...`
- `arti research -m layer1-only`

### `100 Credits / 次`

- `arti research` 默认完整三层研报

## 当前还没接入扣费的命令

- `arti crypto`
- `arti fundamental`
- `arti options`
- `arti economy`
- `arti export`
- `arti insights`

## 什么时候会提示升级

### Credits 不足时

如果用户余额不够，命令会直接报错，并提示升级到更高套餐。

### 套餐权益不够时

当前已接入的权益限制主要是 `watchlist add`：

- `free` 最多 `1` 支
- `basic` 最多 `5` 支
- `pro` 最多 `20` 支
- `flagship` 不限

如果超出上限，CLI 会提示升级。

## 现在会不会真实付费

不会。

当前仓库里：

- 没有 Stripe
- 没有 Checkout
- 没有支付回调
- 没有订阅同步
- 没有真实扣款

也就是说，当前 CLI 的计费系统本质上是 **本地 credits 模拟**。

## `arti credits --set-plan` 是什么

这个命令只是本地联调用的套餐切换能力，不是真实购买。

例如：

```bash
arti credits --set-plan pro
```

这会直接把本地状态切到 `pro`，用于测试不同套餐下的 CLI 行为。

## 如果要变成真实付费产品，还差什么

至少还差这些环节：

1. 主产品定价页接支付入口
2. 支付成功后在后端创建或更新订阅
3. CLI 有登录态，能识别当前用户
4. CLI 从后端读取套餐、余额和权益
5. Credits 扣减改成服务端记账，而不是本地文件
6. CLI 的升级提示可以跳到真实支付页

## 一句话总结

当前版本适合：

- 本地体验
- 套餐规则联调
- CLI 侧计费逻辑验证

当前版本还不适合：

- 真实商业收费
- 用户付费订阅
- 跨设备同步余额
