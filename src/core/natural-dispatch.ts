/**
 * 自然语言入口分发：复用产品意图识别，把自由文本派发到对应能力。
 */
import chalk from "chalk";
import { classifyIntent } from "../api.js";
import { quickScanCommand, fullReportCommand, deepReportCommand } from "../commands/product.js";

export type NaturalDispatchResult =
  | "quick-scan"
  | "panorama"
  | "deep"
  | "general-chat"
  | "needs-symbol"
  | "unsupported-market"
  | "roundtable";

export interface NaturalDispatchOptions {
  onGeneralChat: (text: string) => Promise<void>;
}

export async function dispatchNaturalText(
  text: string,
  options: NaturalDispatchOptions,
): Promise<NaturalDispatchResult | undefined> {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const res = await classifyIntent(trimmed);
  if (res.needs_symbol) {
    console.log(chalk.yellow("  请带上股票代码，例如：茅台 / AAPL / 600519.SS"));
    return "needs-symbol";
  }

  switch (res.intent) {
    case "quick-scan":
      if (res.symbol) await quickScanCommand(res.symbol);
      return "quick-scan";
    case "panorama":
      if (res.symbol) await fullReportCommand(res.symbol);
      return "panorama";
    case "deep":
      if (res.symbol) await deepReportCommand(res.symbol);
      return "deep";
    case "unsupported-market":
      console.log(chalk.yellow("  暂不支持该市场"));
      return "unsupported-market";
    case "roundtable":
      console.log(chalk.yellow("  圆桌能力暂未开放"));
      return "roundtable";
    default:
      await options.onGeneralChat(trimmed);
      return "general-chat";
  }
}
