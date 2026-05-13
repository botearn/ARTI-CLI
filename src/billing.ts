/**
 * 计费核心 — Credit-Based 计费体系
 * 余额存于 ~/.config/arti/billing.json，月初自动重置
 * 基准汇率：1 Credit = $0.04
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";

const CONFIG_DIR = join(homedir(), ".config", "arti");
const BILLING_FILE = join(CONFIG_DIR, "billing.json");
const CREDIT_USD_VALUE = 0.04;

// ── 套餐定义 ──

export type PlanId = "free" | "basic" | "pro" | "flagship";
export type AlertsLevel = "none" | "standard" | "realtime";
export type ExportLevel = "none" | "pdf" | "pdf_api";
export type PriorityLevel = "normal" | "priority" | "highest";

export interface Plan {
  id: PlanId;
  name: string;
  price: number;               // USD/月
  monthly: number;             // Credits/月（常规）
  rolloverCap: number;         // Rollover 上限（0 = 无 Rollover）
  watchlistLimit: number | null;
  reportHistoryDays: number | null;
  alerts: AlertsLevel;
  exportLevel: ExportLevel;
  apiAccess: boolean;
  priority: PriorityLevel;
}

export const PLAN_ORDER: PlanId[] = ["free", "basic", "pro", "flagship"];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    monthly: 100,
    rolloverCap: 0,
    watchlistLimit: 1,
    reportHistoryDays: 7,
    alerts: "none",
    exportLevel: "none",
    apiAccess: false,
    priority: "normal",
  },
  basic: {
    id: "basic",
    name: "基础版",
    price: 20,
    monthly: 500,
    rolloverCap: 1000,
    watchlistLimit: 5,
    reportHistoryDays: 30,
    alerts: "none",
    exportLevel: "none",
    apiAccess: false,
    priority: "normal",
  },
  pro: {
    id: "pro",
    name: "专业版",
    price: 100,
    monthly: 2500,
    rolloverCap: 5000,
    watchlistLimit: 20,
    reportHistoryDays: null,
    alerts: "standard",
    exportLevel: "pdf",
    apiAccess: false,
    priority: "priority",
  },
  flagship: {
    id: "flagship",
    name: "旗舰版",
    price: 200,
    monthly: 8000,
    rolloverCap: 16000,
    watchlistLimit: null,
    reportHistoryDays: null,
    alerts: "realtime",
    exportLevel: "pdf_api",
    apiAccess: true,
    priority: "highest",
  },
};

// ── 功能消耗 ──

export type FeatureKey = "chat" | "quickScan" | "panorama" | "deepReport" | "preBrief" | "postRecap";

export const FEATURE_COSTS: Record<FeatureKey, number> = {
  chat: 1,         // quote / market / news / history / search / watch
  quickScan: 5,    // scan / predict
  panorama: 30,    // research --mode layer1-only / 单分析师
  deepReport: 100, // research（完整三层）
  preBrief: 20,    // 盘前简报（预留）
  postRecap: 20,   // 盘后复盘（预留）
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  chat: "普通查询",
  quickScan: "快速扫描",
  panorama: "全景报告",
  deepReport: "深度报告",
  preBrief: "盘前简报",
  postRecap: "盘后复盘",
};

const FEATURE_RECOMMENDED_PLAN: Record<FeatureKey, PlanId> = {
  chat: "basic",
  quickScan: "basic",
  panorama: "basic",
  deepReport: "pro",
  preBrief: "basic",
  postRecap: "basic",
};

// ── 新用户礼包 ──

/** 新用户首月额外赠送额度（总计 400 Credits） */
const NEW_USER_BONUS = 300; // 300 bonus + 100 regular = 400

// ── 余额状态 ──

export interface BillingState {
  plan: PlanId;
  balance: number;       // 当前可用 Credits（含 Rollover）
  rollover: number;      // 上月结转的 Credits
  lastResetYM: string;   // 上次重置的年月，格式 "YYYY-MM"
  newUserBonusGiven: boolean;
  newUserBonusExpiry: string | null; // ISO date
  totalUsed: number;     // 生命周期累计消耗
}

export interface DeductResult {
  cost: number;
  balanceBefore: number;
  balanceAfter: number;
  feature: FeatureKey;
  skipped?: boolean;
}

function currentYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function createInitialState(): BillingState {
  const now = new Date();
  const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    plan: "free",
    balance: PLANS.free.monthly + NEW_USER_BONUS,
    rollover: 0,
    lastResetYM: currentYM(),
    newUserBonusGiven: true,
    newUserBonusExpiry: expiry.toISOString(),
    totalUsed: 0,
  };
}

export function isPlanId(value: string): value is PlanId {
  return PLAN_ORDER.includes(value as PlanId);
}

export function formatCredits(credits: number): string {
  return `${credits.toLocaleString()} Credits`;
}

export function formatPlanLimit(limit: number | null, unit: string): string {
  return limit === null ? `无限${unit}` : `${limit}${unit}`;
}

export function getPlan(planId: PlanId): Plan {
  return PLANS[planId];
}

export function creditDollarValue(credits: number): number {
  return credits * CREDIT_USD_VALUE;
}

export function loadBilling(): BillingState {
  if (!existsSync(BILLING_FILE)) {
    const state = createInitialState();
    saveBilling(state);
    return state;
  }

  try {
    const parsed = JSON.parse(readFileSync(BILLING_FILE, "utf-8")) as Partial<BillingState>;
    const fallback = createInitialState();

    return {
      plan: isPlanId(parsed.plan ?? "") ? parsed.plan! : fallback.plan,
      balance: typeof parsed.balance === "number" ? parsed.balance : fallback.balance,
      rollover: typeof parsed.rollover === "number" ? parsed.rollover : fallback.rollover,
      lastResetYM: typeof parsed.lastResetYM === "string" ? parsed.lastResetYM : fallback.lastResetYM,
      newUserBonusGiven: typeof parsed.newUserBonusGiven === "boolean" ? parsed.newUserBonusGiven : fallback.newUserBonusGiven,
      newUserBonusExpiry: typeof parsed.newUserBonusExpiry === "string" || parsed.newUserBonusExpiry === null
        ? parsed.newUserBonusExpiry
        : fallback.newUserBonusExpiry,
      totalUsed: typeof parsed.totalUsed === "number" ? parsed.totalUsed : fallback.totalUsed,
    };
  } catch {
    const state = createInitialState();
    saveBilling(state);
    return state;
  }
}

export function saveBilling(state: BillingState): void {
  ensureDir();
  writeFileSync(BILLING_FILE, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

/**
 * 检查月度重置：若当前年月不等于 lastResetYM，执行重置
 * - 超出 rolloverCap 的余额截断
 * - 发放本月 Credits
 */
export function resetMonthlyIfNeeded(state: BillingState): BillingState {
  const ym = currentYM();
  if (state.lastResetYM === ym) return state;

  const plan = PLANS[state.plan];
  const carryover = plan.rolloverCap > 0
    ? Math.min(state.balance, plan.rolloverCap)
    : 0;

  const newState: BillingState = {
    ...state,
    balance: carryover + plan.monthly,
    rollover: carryover,
    lastResetYM: ym,
  };
  saveBilling(newState);
  return newState;
}

export function getActiveBillingState(): BillingState {
  return resetMonthlyIfNeeded(loadBilling());
}

export function setPlan(planId: PlanId): BillingState {
  const current = getActiveBillingState();
  const plan = PLANS[planId];

  const nextState: BillingState = {
    ...current,
    plan: planId,
    balance: plan.monthly,
    rollover: 0,
    lastResetYM: currentYM(),
  };

  saveBilling(nextState);
  return nextState;
}

export function getRecommendedPlanForFeature(feature: FeatureKey): Plan {
  return PLANS[FEATURE_RECOMMENDED_PLAN[feature]];
}

function isBillingBypassed(): boolean {
  const value = process.env.ARTI_BILLING_BYPASS?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

// ── 核心：检查并扣费 ──

export class InsufficientCreditsError extends Error {
  constructor(
    public required: number,
    public available: number,
    public feature: FeatureKey,
  ) {
    const label = FEATURE_LABELS[feature];
    const plan = getRecommendedPlanForFeature(feature);
    super(
      `Credits 不足：${label} 需要 ${required} Credits，当前余额 ${available} Credits\n` +
      `  升级到${plan.name}（$${plan.price}/月）可获得 ${plan.monthly.toLocaleString()} Credits/月`
    );
    this.name = "InsufficientCreditsError";
  }
}

export class PlanAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanAccessError";
  }
}

export function assertSufficientCredits(feature: FeatureKey, state = getActiveBillingState()): BillingState {
  if (isBillingBypassed()) {
    return state;
  }

  const cost = FEATURE_COSTS[feature];
  if (state.balance < cost) {
    throw new InsufficientCreditsError(cost, state.balance, feature);
  }
  return state;
}

/**
 * 兼容旧调用方：立即检查并扣费。
 * 新代码优先使用 withBilling，避免失败请求也消耗 Credits。
 */
export function checkAndDeduct(feature: FeatureKey): DeductResult {
  const state = assertSufficientCredits(feature);
  return applyDeduction(feature, state);
}

export function applyDeduction(feature: FeatureKey, state = getActiveBillingState()): DeductResult {
  if (isBillingBypassed()) {
    return {
      cost: 0,
      balanceBefore: state.balance,
      balanceAfter: state.balance,
      feature,
      skipped: true,
    };
  }

  const cost = FEATURE_COSTS[feature];
  const balanceBefore = state.balance;

  state.balance -= cost;
  state.totalUsed += cost;
  saveBilling(state);

  return {
    cost,
    balanceBefore,
    balanceAfter: state.balance,
    feature,
  };
}

export async function withBilling<T>(
  feature: FeatureKey,
  fn: () => Promise<T>,
): Promise<{ result: T; deduct: DeductResult } | undefined> {
  const state = assertSufficientCredits(feature);
  const result = await fn();

  if (result === undefined) {
    return undefined;
  }

  return {
    result,
    deduct: applyDeduction(feature, state),
  };
}

// ── 套餐权益校验 ──

export function assertWatchlistCapacity(nextCount: number, state = getActiveBillingState()): BillingState {
  const plan = PLANS[state.plan];
  if (plan.watchlistLimit !== null && nextCount > plan.watchlistLimit) {
    const requiredPlan = PLAN_ORDER.find((planId) => {
      const candidate = PLANS[planId];
      return candidate.watchlistLimit === null || nextCount <= candidate.watchlistLimit;
    });

    const required = requiredPlan ? PLANS[requiredPlan] : PLANS.flagship;
    throw new PlanAccessError(
      `当前套餐最多支持 ${formatPlanLimit(plan.watchlistLimit, "支自选股")}，你要添加后会达到 ${nextCount} 支\n` +
      `  升级到${required.name}（$${required.price}/月）即可支持 ${formatPlanLimit(required.watchlistLimit, "支自选股")}`
    );
  }
  return state;
}

// ── 显示余额信息 ──

/** 命令执行后打印「已消耗 X Credits，余额 Y」 */
export function printDeductResult(result: DeductResult): void {
  if (result.skipped) {
    console.log(
      chalk.gray(
        `  ─ ${FEATURE_LABELS[result.feature]} ${chalk.cyan("[测试模式未扣费]")}` +
        `  余额 ${chalk.cyan(result.balanceAfter.toString())} Credits`
      )
    );
    return;
  }

  const label = FEATURE_LABELS[result.feature];
  console.log(
    chalk.gray(
      `  ─ ${label} ${chalk.yellow(`-${result.cost} Credits`)}` +
      `  余额 ${chalk.cyan(result.balanceAfter.toString())} Credits`
    )
  );
}

export function getBillingPath(): string {
  return BILLING_FILE;
}
