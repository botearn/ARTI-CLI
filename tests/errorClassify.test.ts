import { describe, expect, it } from "vitest";
import { classifyError } from "../src/errors.js";
import { InsufficientCreditsError, PlanAccessError, BillingBackendError } from "../src/billing.js";

// L14/L15：计费类错误应被 classifyError 精确识别，不落入"未知错误"兜底。
describe("classifyError 计费类错误分类", () => {
  it("InsufficientCreditsError → Credits 不足", () => {
    const info = classifyError(new InsufficientCreditsError(10, 3, "chat"));
    expect(info.title).toBe("Credits 不足");
    expect(info.title).not.toBe("未知错误");
  });

  it("PlanAccessError → 套餐权限不足", () => {
    const info = classifyError(new PlanAccessError("自选股已达上限"));
    expect(info.title).toBe("套餐权限不足");
    expect(info.detail).toContain("自选股已达上限");
  });

  it("BillingBackendError → 计费服务不可用（区别于积分不足）", () => {
    const info = classifyError(new BillingBackendError("扣费服务暂时不可用（HTTP 503）"));
    expect(info.title).toBe("计费服务不可用");
    expect(info.title).not.toBe("未知错误");
  });

  it("普通未知错误仍走兜底", () => {
    const info = classifyError(new Error("something odd"));
    expect(info.title).toBe("未知错误");
  });
});
