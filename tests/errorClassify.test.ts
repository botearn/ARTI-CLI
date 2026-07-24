import { describe, expect, it } from "vitest";
import { classifyError } from "../src/errors.js";
import { InsufficientCreditsError, PlanAccessError } from "../src/billing.js";

// L15：计费/套餐类错误应被 classifyError 精确识别，不落入"未知错误"兜底。
describe("classifyError 计费类错误分类", () => {
  it("InsufficientCreditsError → Credits 不足", () => {
    const info = classifyError(new InsufficientCreditsError(10, 3, "chat"));
    expect(info.title).toBe("Credits 不足");
    expect(info.title).not.toBe("未知错误");
    expect(info.suggestion).toContain("/credits");
    expect(info.suggestion).toContain("arti credits");
  });

  it("PlanAccessError → 套餐权限不足", () => {
    const info = classifyError(new PlanAccessError("自选股已达上限"));
    expect(info.title).toBe("套餐权限不足");
    expect(info.detail).toContain("自选股已达上限");
  });

  it("普通未知错误仍走兜底", () => {
    const info = classifyError(new Error("something odd"));
    expect(info.title).toBe("未知错误");
  });

  it("登录错误同时说明会话内与外层入口", () => {
    const info = classifyError(new Error("未登录"));

    expect(info.title).toBe("登录态不可用");
    expect(info.suggestion).toContain("/login");
    expect(info.suggestion).toContain("arti login");
  });
});
