import chalk from "chalk";
import { output } from "../output.js";
import { printError } from "../errors.js";
import { polyGet } from "./api.js";
import { renderEvent, renderEvents, renderPicks, renderSummary } from "./format.js";
import type { ApiEnvelope, ArtiPickData, PolyEvent, SummaryData } from "./types.js";
import type { CapabilityExecutionResult } from "../core/conversation-types.js";

interface PolyOptions {
  limit?: string | boolean;
  source?: string | boolean;
  category?: string | boolean;
}

function limitValue(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 100) : fallback;
}

function stringValue(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function collectTitles(value: unknown, titles: string[] = []): string[] {
  if (titles.length >= 3 || value == null) return titles;
  if (Array.isArray(value)) {
    for (const item of value) collectTitles(item, titles);
    return titles;
  }
  if (typeof value !== "object") return titles;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string"
    ? record.title
    : typeof record.question === "string"
      ? record.question
      : undefined;
  if (title && !titles.includes(title)) titles.push(title);
  for (const key of [
    "data",
    "topEvents",
    "artiPick",
    "high",
    "moderate",
    "canonicalEvent",
    "polymarket",
    "kalshi",
  ]) {
    collectTitles(record[key], titles);
  }
  return titles;
}

function polyResult(action: string, json: unknown): CapabilityExecutionResult {
  const titles = collectTitles(json);
  return {
    json,
    artifact: {
      type: "poly_result",
      digest: titles.length
        ? `预测市场 ${action}：${titles.join("；")}`
        : `预测市场 ${action} 查询完成`,
      payload: json,
    },
  };
}

export async function polyCommand(
  args: string[],
  options: PolyOptions,
): Promise<CapabilityExecutionResult | undefined> {
  const action = args[0] ?? "events";
  try {
    switch (action) {
      case "events":
        return await polyEvents(options);
      case "event":
        return await polyEvent(args[1], options);
      case "summary":
        return await polySummary(options);
      case "compare":
        return await polyCompare();
      case "search":
        return await polySearch(args.slice(1).join(" "), options);
      default:
        console.log(chalk.red(`未知 poly 子命令: ${action}`));
        console.log(chalk.gray("可用: events | event <slug> | summary | compare | search <keyword>"));
    }
  } catch (err) {
    printError(err);
  }
}

async function polyEvents(options: PolyOptions): Promise<CapabilityExecutionResult> {
  const limit = limitValue(options.limit, 24);
  const source = stringValue(options.source) ?? "polymarket";
  const category = stringValue(options.category);
  const res = await polyGet<ApiEnvelope<PolyEvent[]>>(`events${qs({ limit, source, category })}`);
  output(res, () => renderEvents(res.data ?? []));
  return polyResult("events", res);
}

async function polyEvent(
  slug: string | undefined,
  options: PolyOptions,
): Promise<CapabilityExecutionResult | undefined> {
  if (!slug) {
    console.log(chalk.red("请提供事件 slug，例如：arti poly event will-trump-win-2026"));
    return;
  }
  const source = stringValue(options.source) ?? "polymarket";
  const res = await polyGet<ApiEnvelope<PolyEvent>>(`events/${encodeURIComponent(slug)}${qs({ source })}`);
  output(res, () => renderEvent(res.data));
  return polyResult("event", res);
}

async function polySummary(options: PolyOptions): Promise<CapabilityExecutionResult> {
  const limit = limitValue(options.limit, 10);
  const res = await polyGet<ApiEnvelope<SummaryData>>(`summary${qs({ limit })}`);
  output(res, () => renderSummary(res.data));
  return polyResult("summary", res);
}

async function polyCompare(): Promise<CapabilityExecutionResult> {
  const res = await polyGet<ApiEnvelope<ArtiPickData>>("market-comparison");
  output(res, () => renderPicks(res.data));
  return polyResult("compare", res);
}

async function polySearch(
  keyword: string,
  options: PolyOptions,
): Promise<CapabilityExecutionResult | undefined> {
  const q = keyword.trim();
  if (!q) {
    console.log(chalk.red("请提供搜索关键词，例如：arti poly search fed"));
    return;
  }
  const limit = limitValue(options.limit, 20);
  const res = await polyGet<ApiEnvelope<PolyMarketSearchResult[]>>(`markets/search${qs({ source: "kalshi", q, limit })}`);
  output(res, () => renderEvents((res.data ?? []).map(item => ({
    id: item.id,
    slug: item.slug ?? item.ticker,
    source: "kalshi",
    title: item.title ?? item.question,
    category: item.category,
    volume: item.volume,
    markets: [item],
  }))));
  return polyResult("search", res);
}

interface PolyMarketSearchResult {
  id?: string;
  slug?: string;
  ticker?: string;
  title?: string;
  question?: string;
  category?: string;
  volume?: number;
  yesPrice?: number;
  outcomePrices?: number[];
}
