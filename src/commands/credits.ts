/**
 * credits 命令 — 查看 Credit 余额与套餐详情
 * 用法：arti credits
 */
import chalk from "chalk";
import {
  getActiveBillingState,
  PLANS,
  FEATURE_LABELS,
  formatPlanLimit,
  getFeatureCost,
  type FeatureKey,
} from "../billing.js";
import { output } from "../output.js";

interface CreditsOptions {
  setPlan?: string;
}

export async function creditsCommand(options?: CreditsOptions): Promise<void> {
  if (options?.setPlan) {
    console.log(chalk.yellow("  `credits --set-plan` 已废弃，CLI 现使用服务端真实套餐与余额。"));
  }

  const state = await getActiveBillingState();
  const plan = PLANS[state.plan];

  output(
    {
      plan: state.plan,
      tier: state.tier,
      tierLabel: state.tierLabel,
      planName: plan.name,
      balance: state.balance,
      weeklyQuota: state.weeklyQuota,
      usedWeekly: state.usedWeekly,
      weeklyRemaining: state.weeklyRemaining,
      permanentBalance: state.permanentBalance,
      used5h: state.used5h,
      limit5h: state.limit5h,
      totalUsed: state.totalUsed,
      snapshotAt: state.snapshotAt,
      watchlistLimit: plan.watchlistLimit,
      reportHistoryDays: plan.reportHistoryDays,
      alerts: plan.alerts,
      exportLevel: plan.exportLevel,
      apiAccess: plan.apiAccess,
      priority: plan.priority,
      pricing: state.pricing,
    },
    () => renderCredits(state),
  );
}

function renderCredits(state: Awaited<ReturnType<typeof getActiveBillingState>>): void {
  const plan2 = PLANS[state.plan];

  console.log();
  console.log(`  ${chalk.bold.white("ARTI Credits")}  ${planBadge(state.plan)}`);
  console.log(chalk.gray("  ─────────────────────────────────────"));

  const balanceColor = state.balance > 50
    ? chalk.cyan.bold
    : state.balance > 0
      ? chalk.yellow.bold
      : chalk.red.bold;

  console.log(`  余额      ${balanceColor(state.balance.toString())} Credits`);
  console.log(`  当前套餐  ${chalk.white(state.tierLabel)} (${chalk.gray(state.tier)})`);
  console.log(`  周包剩余  ${chalk.white(`${state.weeklyRemaining}/${state.weeklyQuota}`)} Credits`);
  console.log(`  永久余额  ${chalk.white(state.permanentBalance.toLocaleString())} Credits`);
  console.log(`  5h 窗口   ${chalk.white(`${state.used5h}/${state.limit5h}`)} Credits`);
  console.log(`  累计消耗  ${chalk.gray(state.totalUsed.toLocaleString())} Credits`);
  if (state.snapshotAt) {
    console.log(`  快照时间  ${chalk.gray(state.snapshotAt)}`);
  }

  console.log();
  console.log(chalk.gray("  ─── 套餐权益 ─────────────────────────"));
  console.log(`  自选上限  ${chalk.white(formatPlanLimit(plan2.watchlistLimit, "支"))}`);
  console.log(`  报告历史  ${chalk.white(plan2.reportHistoryDays === null ? "永久" : `${plan2.reportHistoryDays}天`)}`);
  console.log(`  提醒能力  ${chalk.white(alertsLabel(plan2.alerts))}`);
  console.log(`  导出能力  ${chalk.white(exportLabel(plan2.exportLevel))}`);
  console.log(`  API 接入  ${plan2.apiAccess ? chalk.green("已开启") : chalk.gray("未开启")}`);
  console.log(`  响应优先级 ${chalk.white(priorityLabel(plan2.priority))}`);

  console.log();
  console.log(chalk.gray("  ─── 功能消耗速查 ─────────────────────"));

  const featureOrder: FeatureKey[] = ["chat", "quickScan", "panorama", "deepReport", "preBrief", "postRecap"];
  for (const key of featureOrder) {
    const cost = getFeatureCost(key, state.pricing);
    const label = FEATURE_LABELS[key];
    const affordable = state.balance >= cost;
    const costStr = affordable
      ? chalk.yellow(`${cost} Credits`)
      : chalk.red(`${cost} Credits`);
    const canStr = affordable ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${canStr} ${label.padEnd(10)}  ${costStr}  ≈ $${(cost * 0.04).toFixed(2)}`);
  }

  if (state.balance < 10 && state.plan === "free") {
    console.log();
    console.log(chalk.yellow("  剩余额度较低。升级入门版（$20/月）可获得 50 Credits/周。"));
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
