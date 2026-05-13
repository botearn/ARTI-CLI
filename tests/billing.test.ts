import { describe, expect, it } from "vitest";
import {
  PLANS,
  PlanAccessError,
  assertWatchlistCapacity,
  assertSufficientCredits,
  applyDeduction,
  creditDollarValue,
  formatPlanLimit,
  type BillingState,
} from "../src/billing.js";

function makeState(plan: keyof typeof PLANS): BillingState {
  return {
    plan,
    balance: PLANS[plan].monthly,
    rollover: 0,
    lastResetYM: "2026-05",
    newUserBonusGiven: plan === "free",
    newUserBonusExpiry: plan === "free" ? "2026-06-01T00:00:00.000Z" : null,
    totalUsed: 0,
  };
}

describe("billing plan rules", () => {
  it("free 套餐自选上限为 1", () => {
    expect(() => assertWatchlistCapacity(1, makeState("free"))).not.toThrow();
    expect(() => assertWatchlistCapacity(2, makeState("free"))).toThrow(PlanAccessError);
  });

  it("watchlist 超限时给出升级建议", () => {
    expect(() => assertWatchlistCapacity(2, makeState("free"))).toThrow(/升级到基础版/);
    expect(() => assertWatchlistCapacity(21, makeState("pro"))).toThrow(/升级到旗舰版/);
  });

  it("格式化套餐限制和 credit 美元价值", () => {
    expect(formatPlanLimit(5, "支")).toBe("5支");
    expect(formatPlanLimit(null, "支")).toBe("无限支");
    expect(creditDollarValue(30)).toBeCloseTo(1.2, 6);
  });

  it("开启 ARTI_BILLING_BYPASS 时跳过余额校验", () => {
    process.env.ARTI_BILLING_BYPASS = "true";
    const lowBalanceState = { ...makeState("free"), balance: 0 };
    expect(() => assertSufficientCredits("panorama", lowBalanceState)).not.toThrow();
    delete process.env.ARTI_BILLING_BYPASS;
  });

  it("开启 ARTI_BILLING_BYPASS 时不实际扣费", () => {
    process.env.ARTI_BILLING_BYPASS = "true";
    const state = { ...makeState("basic"), balance: 20 };
    const result = applyDeduction("panorama", state);
    expect(result.skipped).toBe(true);
    expect(result.cost).toBe(0);
    expect(result.balanceAfter).toBe(20);
    expect(state.balance).toBe(20);
    delete process.env.ARTI_BILLING_BYPASS;
  });
});
