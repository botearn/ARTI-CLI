/**
 * credits 命令 — 查看 Credit 余额与套餐详情
 * 用法：arti credits
 */
import chalk from "chalk";
import {
  getActiveBillingState,
  PLANS,
  FEATURE_COSTS,
  FEATURE_LABELS,
  PLAN_ORDER,
  isPlanId,
  setPlan,
  formatPlanLimit,
  type FeatureKey,
} from "../billing.js";
import { output } from "../output.js";

interface CreditsOptions {
  setPlan?: string;
}

export async function creditsCommand(options?: CreditsOptions): Promise<void> {
  let changeApplied: string | null = null;
  if (options?.setPlan) {
    const target = options.setPlan.toLowerCase();
    if (!isPlanId(target)) {
      console.log(chalk.red(`可用套餐: ${PLAN_ORDER.join(", ")}`));
      return;
    }
    setPlan(target);
    changeApplied = target;
  }

  const state = getActiveBillingState();
  const plan = PLANS[state.plan];

  // ── JSON 模式 ──
  output(
    {
      plan: state.plan,
      planName: plan.name,
      balance: state.balance,
      rollover: state.rollover,
      totalUsed: state.totalUsed,
      monthly: plan.monthly,
      rolloverCap: plan.rolloverCap,
      lastResetYM: state.lastResetYM,
      watchlistLimit: plan.watchlistLimit,
      reportHistoryDays: plan.reportHistoryDays,
      alerts: plan.alerts,
      exportLevel: plan.exportLevel,
      apiAccess: plan.apiAccess,
      priority: plan.priority,
      changeApplied,
    },
    () => renderCredits(state, changeApplied),
  );
}

function renderCredits(state: ReturnType<typeof getActiveBillingState>, changeApplied: string | null): void {
  const plan2 = PLANS[state.plan];

  // ── 标题栏 ──
  console.log();
  console.log(
    `  ${chalk.bold.white("ARTI Credits")}  ${planBadge(state.plan)}`,
  );
  console.log(chalk.gray("  ─────────────────────────────────────"));

  // ── 余额 ──
  const balanceColor = state.balance > 50
    ? chalk.cyan.bold
    : state.balance > 0
      ? chalk.yellow.bold
      : chalk.red.bold;

  console.log(`  余额      ${balanceColor(state.balance.toString())} Credits`);
  if (state.rollover > 0) {
    console.log(`  其中结转  ${chalk.gray(state.rollover.toString())} Credits`);
  }
  console.log(`  月度配额  ${chalk.white(plan2.monthly.toLocaleString())} Credits/月`);
  if (plan2.rolloverCap > 0) {
    console.log(`  Rollover  上限 ${chalk.white(plan2.rolloverCap.toLocaleString())} Credits`);
  }
  console.log(`  累计消耗  ${chalk.gray(state.totalUsed.toLocaleString())} Credits`);
  console.log(`  重置周期  每月初（上次：${state.lastResetYM}）`);
  if (changeApplied) {
    console.log(chalk.green(`  已切换到  ${plan2.name}（本地模拟套餐）`));
  }

  console.log();
  console.log(chalk.gray("  ─── 套餐权益 ─────────────────────────"));
  console.log(`  自选上限  ${chalk.white(formatPlanLimit(plan2.watchlistLimit, "支"))}`);
  console.log(`  报告历史  ${chalk.white(plan2.reportHistoryDays === null ? "永久" : `${plan2.reportHistoryDays}天`)}`);
  console.log(`  提醒能力  ${chalk.white(alertsLabel(plan2.alerts))}`);
  console.log(`  导出能力  ${chalk.white(exportLabel(plan2.exportLevel))}`);
  console.log(`  API 接入  ${plan2.apiAccess ? chalk.green("已开启") : chalk.gray("未开启")}`);
  console.log(`  响应优先级 ${chalk.white(priorityLabel(plan2.priority))}`);

  // ── 功能消耗速查 ──
  console.log();
  console.log(chalk.gray("  ─── 功能消耗速查 ─────────────────────"));

  const featureOrder: FeatureKey[] = ["chat", "quickScan", "panorama", "deepReport", "preBrief", "postRecap"];
  for (const key of featureOrder) {
    const cost = FEATURE_COSTS[key];
    const label = FEATURE_LABELS[key];
    const affordable = state.balance >= cost;
    const costStr = affordable
      ? chalk.yellow(`${cost} Credits`)
      : chalk.red(`${cost} Credits`);
    const canStr = affordable ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${canStr} ${label.padEnd(10)}  ${costStr}  ≈ $${(cost * 0.04).toFixed(2)}`);
  }

  // ── 升级提示（余额偏低时） ──
  if (state.balance < 10 && state.plan === "free") {
    console.log();
    console.log(chalk.yellow("  余额不足 10 Credits。升级基础版（$20/月）可获得 500 Credits/月。"));
  }

  console.log();
}

function planBadge(plan: string): string {
  const badges: Record<string, string> = {
    free:     chalk.bgGray.white(" Free "),
    basic:    chalk.bgBlue.white(" 基础版 "),
    pro:      chalk.bgMagenta.white(" 专业版 "),
    flagship: chalk.bgYellow.black(" 旗舰版 "),
  };
  return badges[plan] ?? chalk.bgGray.white(` ${plan} `);
}

function alertsLabel(level: "none" | "standard" | "realtime"): string {
  if (level === "realtime") return "实时价格/事件提醒";
  if (level === "standard") return "价格/事件提醒";
  return "无";
}

function exportLabel(level: "none" | "pdf" | "pdf_api"): string {
  if (level === "pdf_api") return "PDF + API";
  if (level === "pdf") return "PDF";
  return "无";
}

function priorityLabel(level: "normal" | "priority" | "highest"): string {
  if (level === "highest") return "最优先";
  if (level === "priority") return "优先";
  return "普通";
}
