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
    userId: "test-user",
    tier: plan === "basic" ? "t20" : plan === "pro" ? "t100" : plan === "flagship" ? "t200" : "free",
    tierLabel: PLANS[plan].name,
    weeklyQuota: PLANS[plan].monthly,
    usedWeekly: 0,
    weeklyRemaining: PLANS[plan].monthly,
    permanentBalance: 0,
    used5h: 0,
    limit5h: 1000,
    snapshotAt: null,
    resetAt: null,
    pricing: [
      { action: "chat_general", cost: 1, label: "普通查询", cost_multiplier: 1 },
      { action: "analysis_light", cost: 1, label: "轻量分析", cost_multiplier: 1 },
      { action: "debate_council", cost: 5, label: "圆桌辩论", cost_multiplier: 1 },
      { action: "report_stock", cost: 10, label: "个股研报", cost_multiplier: 1 },
    ],
  };
}

describe("billing plan rules", () => {
  it("free 套餐自选上限为 1", async () => {
    await expect(assertWatchlistCapacity(1, makeState("free"))).resolves.toBeDefined();
    await expect(assertWatchlistCapacity(2, makeState("free"))).rejects.toThrow(PlanAccessError);
  });

  it("watchlist 超限时给出升级建议", async () => {
    await expect(assertWatchlistCapacity(2, makeState("free"))).rejects.toThrow(/升级到入门版/);
    await expect(assertWatchlistCapacity(21, makeState("pro"))).rejects.toThrow(/升级到旗舰版/);
  });

  it("格式化套餐限制和 credit 美元价值", () => {
    expect(formatPlanLimit(5, "支")).toBe("5支");
    expect(formatPlanLimit(null, "支")).toBe("无限支");
    expect(creditDollarValue(30)).toBeCloseTo(1.2, 6);
  });

  it("开启 ARTI_BILLING_BYPASS 时跳过余额校验", async () => {
    process.env.ARTI_BILLING_BYPASS = "true";
    const lowBalanceState = { ...makeState("free"), balance: 0 };
    await expect(assertSufficientCredits("panorama", lowBalanceState)).resolves.toBeDefined();
    delete process.env.ARTI_BILLING_BYPASS;
  });

  it("开启 ARTI_BILLING_BYPASS 时不实际扣费", async () => {
    process.env.ARTI_BILLING_BYPASS = "true";
    const state = { ...makeState("basic"), balance: 20 };
    const result = await applyDeduction("panorama", state);
    expect(result.skipped).toBe(true);
    expect(result.cost).toBe(0);
    expect(result.balanceAfter).toBe(20);
    expect(state.balance).toBe(20);
    delete process.env.ARTI_BILLING_BYPASS;
  });
});
