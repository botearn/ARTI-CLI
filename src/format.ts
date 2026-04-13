/**
 * 终端格式化工具
 */
import chalk from "chalk";

/** 涨跌着色：涨红跌绿 */
export function colorChange(value: number, suffix = ""): string {
  const str = (value >= 0 ? "+" : "") + value.toFixed(2) + suffix;
  if (value > 0) return chalk.red(str);
  if (value < 0) return chalk.green(str);
  return chalk.gray(str);
}

/** 简易表格：左对齐 label，右对齐 value */
export function kvLine(label: string, value: string, labelWidth = 14): string {
  return chalk.gray(label.padEnd(labelWidth)) + value;
}

/** 分隔线 */
export function divider(char = "─", width = 50): string {
  return chalk.gray(char.repeat(width));
}

/** 标题 */
export function title(text: string): string {
  return chalk.bold.cyan(`\n  ${text}\n`) + divider();
}

/** 情绪标签 */
export function sentimentBadge(sentiment: string): string {
  switch (sentiment) {
    case "看多": return chalk.bgRed.white(` ${sentiment} `);
    case "看空": return chalk.bgGreen.white(` ${sentiment} `);
    case "中性": return chalk.bgYellow.black(` ${sentiment} `);
    default: return chalk.bgGray.white(` ${sentiment} `);
  }
}

/** 置信度条 */
export function confidenceBar(confidence: number): string {
  const total = 20;
  const filled = Math.round(confidence * total);
  const bar = "█".repeat(filled) + "░".repeat(total - filled);
  const pct = (confidence * 100).toFixed(0) + "%";
  return `${chalk.cyan(bar)} ${pct}`;
}

/** Sparkline 迷你折线图 */
export function sparkline(data: number[]): string {
  if (!data.length) return "";
  const chars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data.map(v => {
    const idx = Math.round(((v - min) / range) * (chars.length - 1));
    return chars[idx];
  }).join("");
}
