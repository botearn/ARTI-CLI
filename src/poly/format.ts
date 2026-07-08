import chalk from "chalk";
import type { ArtiPick, PolyEvent, PolyMarket, SummaryData } from "./types.js";

function text(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function truncate(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value;
}

function money(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function percent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function firstPrice(market?: PolyMarket): string {
  if (!market) return "-";
  if (typeof market.yesPrice === "number") return percent(market.yesPrice);
  if (Array.isArray(market.outcomePrices) && typeof market.outcomePrices[0] === "number") {
    return percent(market.outcomePrices[0]);
  }
  return "-";
}

export function renderEvents(events: PolyEvent[]): void {
  if (!events.length) {
    console.log(chalk.gray("暂无事件"));
    return;
  }

  console.log(chalk.bold.cyan("\n  ARTi Poly 事件\n"));
  for (const [idx, event] of events.entries()) {
    const market = event.markets?.[0];
    const title = truncate(text(event.title ?? event.slug), 46);
    const source = text(event.source).padEnd(10);
    const price = firstPrice(market).padStart(7);
    const volume = money(event.volume24hr ?? event.volume).padStart(8);
    console.log(`  ${String(idx + 1).padStart(2)}. ${chalk.white(title.padEnd(48))} ${chalk.gray(source)} ${chalk.yellow(price)} ${chalk.gray(volume)}`);
  }
  console.log();
}

export function renderEvent(event: PolyEvent): void {
  console.log(chalk.bold.cyan(`\n  ${text(event.title ?? event.slug)}`));
  console.log(chalk.gray(`  ${text(event.source)} · ${text(event.category)} · ${text(event.endDate ?? event.closeTime)}`));
  if (!event.markets?.length) {
    console.log(chalk.gray("\n  暂无市场"));
    return;
  }

  console.log(chalk.bold("\n  Markets"));
  for (const market of event.markets) {
    const question = truncate(text(market.question ?? market.title ?? market.slug ?? market.ticker), 54);
    const yes = firstPrice(market).padStart(7);
    const volume = money(market.volume24hr ?? market.volume).padStart(8);
    console.log(`  - ${chalk.white(question.padEnd(56))} YES ${chalk.yellow(yes)} ${chalk.gray(volume)}`);
  }
  console.log();
}

export function renderSummary(summary: SummaryData): void {
  console.log(chalk.bold.cyan("\n  ARTi Poly Summary"));
  renderEvents(summary.topEvents ?? []);
  renderPicks(summary.artiPick);
}

export function renderPicks(artiPick?: { high?: ArtiPick[]; moderate?: ArtiPick[] }): void {
  const picks = [...(artiPick?.high ?? []), ...(artiPick?.moderate ?? [])];
  if (!picks.length) {
    console.log(chalk.gray("  暂无跨平台价差数据\n"));
    return;
  }

  console.log(chalk.bold.cyan("  ARTi Pick 价差"));
  for (const pick of picks.slice(0, 10)) {
    const title = truncate(text(pick.canonicalEvent?.title ?? pick.polymarket?.title ?? pick.kalshi?.title), 46);
    const poly = percent(pick.polymarket?.yesPrice).padStart(7);
    const kalshi = percent(pick.kalshi?.yesPrice).padStart(7);
    const diff = percent(pick.priceDiff).padStart(7);
    console.log(`  - ${chalk.white(title.padEnd(48))} Poly ${chalk.yellow(poly)} Kalshi ${chalk.yellow(kalshi)} Diff ${chalk.green(diff)}`);
  }
  console.log();
}
