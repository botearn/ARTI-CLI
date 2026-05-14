/**
 * 服务端 Credits 计费体系
 * 真源：Supabase subscribers / usage_tiers / usage_snapshots / user_credits / credit_pricing / consume_credits_atomic
 */
import chalk from "chalk";
import { ensureValidAccessToken, getAuthState } from "./auth.js";

const CREDIT_USD_VALUE = 0.04;
const SUPABASE_JSON_HEADERS = {
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

export type PlanId = "free" | "basic" | "pro" | "flagship";
export type AlertsLevel = "none" | "standard" | "realtime";
export type ExportLevel = "none" | "pdf" | "pdf_api";
export type PriorityLevel = "normal" | "priority" | "highest";
export type CreditAction =
  | "chat_general"
  | "analysis_light"
  | "analysis_deep"
  | "report_generate"
  | "news_interpret"
  | "debate_council"
  | "report_stock"
  | "report_panorama";
export type FeatureKey = "chat" | "quickScan" | "panorama" | "deepReport" | "preBrief" | "postRecap";

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  monthly: number;
  rolloverCap: number;
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
    name: "免费版",
    price: 0,
    monthly: 5,
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
    name: "入门版",
    price: 20,
    monthly: 50,
    rolloverCap: 0,
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
    monthly: 300,
    rolloverCap: 0,
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
    monthly: 800,
    rolloverCap: 0,
    watchlistLimit: null,
    reportHistoryDays: null,
    alerts: "realtime",
    exportLevel: "pdf_api",
    apiAccess: true,
    priority: "highest",
  },
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  chat: "普通查询",
  quickScan: "快速扫描",
  panorama: "全景报告",
  deepReport: "深度报告",
  preBrief: "盘前简报",
  postRecap: "盘后复盘",
};

const FEATURE_ACTIONS: Record<FeatureKey, CreditAction> = {
  chat: "chat_general",
  quickScan: "analysis_light",
  panorama: "analysis_light",
  deepReport: "debate_council",
  preBrief: "report_stock",
  postRecap: "report_stock",
};

const FEATURE_RECOMMENDED_PLAN: Record<FeatureKey, PlanId> = {
  chat: "basic",
  quickScan: "basic",
  panorama: "basic",
  deepReport: "pro",
  preBrief: "basic",
  postRecap: "basic",
};

const TIER_TO_PLAN: Record<string, PlanId> = {
  free: "free",
  t20: "basic",
  t100: "pro",
  t200: "flagship",
};

export interface BillingState {
  plan: PlanId;
  balance: number;
  rollover: number;
  lastResetYM: string;
  newUserBonusGiven: boolean;
  newUserBonusExpiry: string | null;
  totalUsed: number;
  userId: string;
  tier: string;
  tierLabel: string;
  weeklyQuota: number;
  usedWeekly: number;
  weeklyRemaining: number;
  permanentBalance: number;
  used5h: number;
  limit5h: number;
  snapshotAt: string | null;
  resetAt: string | null;
  pricing: CreditPricingRow[];
}

export interface DeductResult {
  cost: number;
  balanceBefore: number;
  balanceAfter: number;
  feature: FeatureKey;
  skipped?: boolean;
  weeklyPart?: number;
  permanentPart?: number;
  transactionId?: string;
}

export interface CreditPricingRow {
  action: CreditAction | string;
  cost: number;
  label: string;
  cost_multiplier?: number | null;
}

interface UsageTierRow {
  tier: string;
  label: string;
  window_5h_limit: number;
  window_weekly_limit: number;
}

interface SubscriberRow {
  subscribed?: boolean;
  subscription_tier?: string;
  subscription_end?: string | null;
}

interface UserCreditsRow {
  balance?: number | null;
  total_spent?: number | null;
}

interface UsageSnapshotRow {
  used_5h?: number | null;
  used_weekly?: number | null;
  week_start?: string | null;
  snapshot_at?: string | null;
}

interface ConsumeRpcRow {
  success: boolean;
  reason?: string;
  cost: number;
  weekly_part: number;
  permanent_part: number;
  transaction_id: string | null;
  weekly_remaining: number;
  permanent_balance: number;
}

function isBillingBypassed(): boolean {
  const value = process.env.ARTI_BILLING_BYPASS?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export class InsufficientCreditsError extends Error {
  constructor(
    public required: number,
    public available: number,
    public feature: FeatureKey,
    public reason?: string,
  ) {
    const label = FEATURE_LABELS[feature];
    const plan = getRecommendedPlanForFeature(feature);
    const suffix = reason === "rate_limited_5h" ? "（触发 5h 限流）" : "";
    super(
      `Credits 不足：${label} 需要 ${required} Credits，当前可用 ${available} Credits${suffix}\n` +
      `  升级到${plan.name}（$${plan.price}/月）可获得 ${plan.monthly.toLocaleString()} Credits/周`
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

export function getRecommendedPlanForFeature(feature: FeatureKey): Plan {
  return PLANS[FEATURE_RECOMMENDED_PLAN[feature]];
}

export async function getActiveBillingState(): Promise<BillingState> {
  if (isBillingBypassed()) {
    return createBypassState();
  }

  const auth = getAuthState();
  const token = await ensureValidAccessToken();
  if (!token) {
    throw new Error("未登录，无法读取 Credits。请先执行 arti login");
  }

  const userId = auth.userId || getJwtUserId(token);
  if (!userId) {
    throw new Error("缺少用户 ID，请重新登录");
  }

  const [{ data: pricing }, { data: tiers }, subscriber, credits, snapshot] = await Promise.all([
    supabaseSelect<CreditPricingRow[]>("credit_pricing", "action,cost,label,cost_multiplier", token),
    supabaseSelect<UsageTierRow[]>("usage_tiers", "tier,label,window_5h_limit,window_weekly_limit", token),
    supabaseMaybeSingle<SubscriberRow>("subscribers", "*", `user_id=eq.${userId}`, token),
    supabaseMaybeSingle<UserCreditsRow>("user_credits", "balance,total_spent", `user_id=eq.${userId}`, token),
    supabaseMaybeSingle<UsageSnapshotRow>("usage_snapshots", "used_5h,used_weekly,week_start,snapshot_at", `user_id=eq.${userId}`, token),
  ]);

  const effectiveTier = resolveEffectiveTier(subscriber.data ?? null);
  const plan = mapTierToPlan(effectiveTier);
  const tierRow = (tiers.data ?? []).find((row) => row.tier === effectiveTier)
    ?? (tiers.data ?? []).find((row) => row.tier === "free");

  const usedWeekly = snapshot.data?.used_weekly ?? 0;
  const weeklyQuota = tierRow?.window_weekly_limit ?? 0;
  const permanentBalance = credits.data?.balance ?? 0;
  const weeklyRemaining = Math.max(0, weeklyQuota - usedWeekly);
  const balance = weeklyRemaining + permanentBalance;

  return {
    plan,
    balance,
    rollover: 0,
    lastResetYM: snapshot.data?.week_start ?? "",
    newUserBonusGiven: false,
    newUserBonusExpiry: null,
    totalUsed: credits.data?.total_spent ?? 0,
    userId,
    tier: effectiveTier,
    tierLabel: tierRow?.label ?? PLANS[plan].name,
    weeklyQuota,
    usedWeekly,
    weeklyRemaining,
    permanentBalance,
    used5h: snapshot.data?.used_5h ?? 0,
    limit5h: tierRow?.window_5h_limit ?? 0,
    snapshotAt: snapshot.data?.snapshot_at ?? null,
    resetAt: null,
    pricing: pricing.data ?? [],
  };
}

export function setPlan(planId: PlanId): BillingState {
  return {
    ...createBypassState(),
    plan: planId,
  };
}

export async function assertSufficientCredits(feature: FeatureKey, state?: BillingState): Promise<BillingState> {
  const billingState = state ?? await getActiveBillingState();
  if (isBillingBypassed()) {
    return billingState;
  }

  const cost = getFeatureCost(feature, billingState.pricing);
  const affordable = billingState.weeklyRemaining + billingState.permanentBalance;

  if (billingState.used5h + cost > billingState.limit5h) {
    throw new InsufficientCreditsError(cost, affordable, feature, "rate_limited_5h");
  }
  if (affordable < cost) {
    throw new InsufficientCreditsError(cost, affordable, feature, "insufficient_credits");
  }
  return billingState;
}

export async function checkAndDeduct(feature: FeatureKey): Promise<DeductResult> {
  const state = await assertSufficientCredits(feature);
  return applyDeduction(feature, state);
}

export async function applyDeduction(feature: FeatureKey, state?: BillingState): Promise<DeductResult> {
  const billingState = state ?? await getActiveBillingState();
  if (isBillingBypassed()) {
    return {
      cost: 0,
      balanceBefore: billingState.balance,
      balanceAfter: billingState.balance,
      feature,
      skipped: true,
    };
  }

  const action = FEATURE_ACTIONS[feature];
  const cost = getFeatureCost(feature, billingState.pricing);
  const reason = `${FEATURE_LABELS[feature]}：CLI`;
  const row = await consumeCreditsAtomic(billingState.userId, action, reason);

  if (!row.success) {
    const available = (row.weekly_remaining ?? billingState.weeklyRemaining)
      + (row.permanent_balance ?? billingState.permanentBalance);
    throw new InsufficientCreditsError(cost, available, feature, row.reason);
  }

  return {
    cost: row.cost,
    balanceBefore: billingState.balance,
    balanceAfter: row.weekly_remaining + row.permanent_balance,
    feature,
    weeklyPart: row.weekly_part,
    permanentPart: row.permanent_part,
    transactionId: row.transaction_id ?? undefined,
  };
}

export async function withBilling<T>(
  feature: FeatureKey,
  fn: () => Promise<T>,
): Promise<{ result: T; deduct: DeductResult } | undefined> {
  const state = await assertSufficientCredits(feature);
  const result = await fn();

  if (result === undefined) {
    return undefined;
  }

  return {
    result,
    deduct: await applyDeduction(feature, state),
  };
}

export async function assertWatchlistCapacity(nextCount: number, state?: BillingState): Promise<BillingState> {
  const billingState = state ?? await getActiveBillingState();
  const plan = PLANS[billingState.plan];
  if (plan.watchlistLimit !== null && nextCount > plan.watchlistLimit) {
    const requiredPlan = PLAN_ORDER.find((planId) => {
      const candidate = PLANS[planId];
      return candidate.watchlistLimit === null || nextCount <= candidate.watchlistLimit;
    });

    const required = requiredPlan ? PLANS[requiredPlan] : PLANS.flagship;
    throw new PlanAccessError(
      `当前套餐最多支持 ${formatPlanLimit(plan.watchlistLimit, "支自选股")}，你要添加后会达到 ${nextCount} 支\n` +
      `  升级到${required.name}（$${required.price}/月）即可支持 ${formatPlanLimit(required.watchlistLimit, "支自选股")}`,
    );
  }
  return billingState;
}

export function printDeductResult(result: DeductResult): void {
  if (result.skipped) {
    console.log(
      chalk.gray(
        `  ─ ${FEATURE_LABELS[result.feature]} ${chalk.cyan("[测试模式未扣费]")}` +
        `  余额 ${chalk.cyan(result.balanceAfter.toString())} Credits`,
      ),
    );
    return;
  }

  const source = [
    typeof result.weeklyPart === "number" ? `周包 ${result.weeklyPart}` : "",
    typeof result.permanentPart === "number" ? `永久 ${result.permanentPart}` : "",
  ].filter(Boolean).join(" + ");

  console.log(
    chalk.gray(
      `  ─ ${FEATURE_LABELS[result.feature]} ${chalk.yellow(`-${result.cost} Credits`)}` +
      `  余额 ${chalk.cyan(result.balanceAfter.toString())} Credits` +
      (source ? `  (${source})` : ""),
    ),
  );
}

export function getBillingPath(): string {
  return "supabase://credits";
}

export function getFeatureCost(feature: FeatureKey, pricing: CreditPricingRow[]): number {
  const action = FEATURE_ACTIONS[feature];
  const row = pricing.find((item) => item.action === action);
  if (!row) return 0;
  return Math.ceil(row.cost * (row.cost_multiplier ?? 1));
}

async function consumeCreditsAtomic(
  userId: string,
  action: CreditAction,
  reason: string,
): Promise<ConsumeRpcRow> {
  const auth = getAuthState();
  const token = await ensureValidAccessToken();
  const res = await fetch(`${auth.supabaseUrl}/rest/v1/rpc/consume_credits_atomic`, {
    method: "POST",
    headers: {
      ...SUPABASE_JSON_HEADERS,
      apikey: auth.publishableKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_action: action,
      p_reason: reason,
      p_metadata: {},
      p_task_id: null,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(`扣费失败: ${text}`);
  }

  const json = await res.json() as ConsumeRpcRow | ConsumeRpcRow[];
  return Array.isArray(json) ? json[0] : json;
}

async function supabaseSelect<T>(
  table: string,
  select: string,
  token: string,
  query = "",
): Promise<{ data: T }> {
  const auth = getAuthState();
  const qs = query ? `&${query}` : "";
  const res = await fetch(
    `${auth.supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}${qs}`,
    {
      headers: {
        apikey: auth.publishableKey,
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(`读取 ${table} 失败: ${text}`);
  }

  return { data: await res.json() as T };
}

async function supabaseMaybeSingle<T>(
  table: string,
  select: string,
  query: string,
  token: string,
): Promise<{ data: T | null }> {
  const auth = getAuthState();
  const res = await fetch(
    `${auth.supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&${query}`,
    {
      headers: {
        apikey: auth.publishableKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );

  if (res.status === 406) {
    return { data: null };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(`读取 ${table} 失败: ${text}`);
  }

  const json = await res.json() as T[];
  return { data: json[0] ?? null };
}

function resolveEffectiveTier(subscriber: SubscriberRow | null): string {
  if (!subscriber) return "free";
  if (!subscriber.subscribed) return "free";
  if (subscriber.subscription_end && new Date(subscriber.subscription_end) < new Date()) return "free";
  return subscriber.subscription_tier || "free";
}

function mapTierToPlan(tier: string): PlanId {
  return TIER_TO_PLAN[tier] ?? "free";
}

function createBypassState(): BillingState {
  return {
    plan: "flagship",
    balance: 999999,
    rollover: 0,
    lastResetYM: "",
    newUserBonusGiven: false,
    newUserBonusExpiry: null,
    totalUsed: 0,
    userId: "bypass",
    tier: "t200",
    tierLabel: "测试模式",
    weeklyQuota: 999999,
    usedWeekly: 0,
    weeklyRemaining: 999999,
    permanentBalance: 0,
    used5h: 0,
    limit5h: 999999,
    snapshotAt: null,
    resetAt: null,
    pricing: [
      { action: "chat_general", cost: 1, label: "普通查询" },
      { action: "analysis_light", cost: 1, label: "快速扫描" },
      { action: "debate_council", cost: 5, label: "深度报告" },
    ],
  };
}

function getJwtUserId(token: string): string {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const json = JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as { sub?: string };
    return json.sub ?? "";
  } catch {
    return "";
  }
}
