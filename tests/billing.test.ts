import { describe, expect, it } from "vitest";
import {
  PLANS,
  PlanAccessError,
  assertWatchlistCapacity,
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
});
