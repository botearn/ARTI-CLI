/**
 * insights 命令 — 生成个人投研洞察 HTML 报告
 * 用法：arti insights
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { loadActivity, type ActivityRecord } from "../tracker.js";
import { output } from "../output.js";

const REPORT_DIR = join(homedir(), ".config", "arti", "reports");

interface SymbolStat {
  symbol: string;
  count: number;
  commands: string[];
  firstSeen: string;
  lastSeen: string;
}

interface CommandStat {
  command: string;
  count: number;
}

interface DayStat {
  date: string;
  count: number;
  symbols: string[];
}

interface InsightsData {
  totalActions: number;
  uniqueSymbols: number;
  activeDays: number;
  dateRange: { from: string; to: string } | null;
  topSymbols: SymbolStat[];
  commandBreakdown: CommandStat[];
  timeline: DayStat[];
  recentActivity: ActivityRecord[];
}

const CMD_LABELS: Record<string, string> = {
  quote: "实时行情",
  scan: "技术扫描",
  predict: "综合预测",
  news: "财经新闻",
  market: "市场概览",
  research: "AI 研报",
};

function analyze(records: ActivityRecord[]): InsightsData {
  if (!records.length) {
    return { totalActions: 0, uniqueSymbols: 0, activeDays: 0, dateRange: null, topSymbols: [], commandBreakdown: [], timeline: [], recentActivity: [] };
  }

  const symbolMap = new Map<string, { count: number; commands: Set<string>; firstSeen: string; lastSeen: string }>();
  for (const r of records) {
    for (const sym of r.symbols) {
      const existing = symbolMap.get(sym);
      if (existing) {
        existing.count++;
        existing.commands.add(r.command);
        if (r.timestamp < existing.firstSeen) existing.firstSeen = r.timestamp;
        if (r.timestamp > existing.lastSeen) existing.lastSeen = r.timestamp;
      } else {
        symbolMap.set(sym, { count: 1, commands: new Set([r.command]), firstSeen: r.timestamp, lastSeen: r.timestamp });
      }
    }
  }
  const topSymbols: SymbolStat[] = [...symbolMap.entries()]
    .map(([symbol, s]) => ({ symbol, count: s.count, commands: [...s.commands], firstSeen: s.firstSeen, lastSeen: s.lastSeen }))
    .sort((a, b) => b.count - a.count);

  const cmdMap = new Map<string, number>();
  for (const r of records) {
    cmdMap.set(r.command, (cmdMap.get(r.command) || 0) + 1);
  }
  const commandBreakdown: CommandStat[] = [...cmdMap.entries()]
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count);

  const dayMap = new Map<string, { count: number; symbols: Set<string> }>();
  for (const r of records) {
    const date = r.timestamp.slice(0, 10);
    const existing = dayMap.get(date);
    if (existing) {
      existing.count++;
      r.symbols.forEach(s => existing.symbols.add(s));
    } else {
      dayMap.set(date, { count: 1, symbols: new Set(r.symbols) });
    }
  }
  const timeline: DayStat[] = [...dayMap.entries()]
    .map(([date, d]) => ({ date, count: d.count, symbols: [...d.symbols] }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const timestamps = records.map(r => r.timestamp).sort();

  return {
    totalActions: records.length,
    uniqueSymbols: symbolMap.size,
    activeDays: dayMap.size,
    dateRange: { from: timestamps[0], to: timestamps[timestamps.length - 1] },
    topSymbols,
    commandBreakdown,
    timeline,
    recentActivity: records.slice(-20).reverse(),
  };
}

function generateProfile(data: InsightsData): string {
  if (!data.totalActions) return "";
  const top3 = data.topSymbols.slice(0, 3).map(s => s.symbol).join("、");
  const mainCmd = data.commandBreakdown[0];
  const mainCmdLabel = CMD_LABELS[mainCmd?.command] || mainCmd?.command || "";
  const depth = data.topSymbols.filter(s => s.commands.length >= 3).length;

  let style = "";
  if (depth >= 3) {
    style = "你倾向于对感兴趣的标的进行深度研究 — 从行情到技术面再到新闻，多维度交叉验证。";
  } else if (data.uniqueSymbols > data.totalActions * 0.6) {
    style = "你的研究风格偏向广度扫描 — 快速浏览大量标的，寻找值得深入的机会。";
  } else {
    style = "你在广度与深度之间保持平衡，既关注市场全貌，又会对重点标的做技术分析。";
  }

  return `近期共进行了 <strong>${data.totalActions} 次投研操作</strong>，覆盖 <strong>${data.uniqueSymbols} 个标的</strong>，跨越 <strong>${data.activeDays} 个活跃日</strong>。最关注 <strong>${top3}</strong>，最常用 <strong>${mainCmdLabel}</strong>。${style}`;
}

function generateSuggestions(data: InsightsData): { title: string; desc: string }[] {
  const suggestions: { title: string; desc: string }[] = [];
  if (!data.totalActions) return suggestions;

  const shallowSymbols = data.topSymbols.filter(s => s.count >= 2 && s.commands.length === 1);
  if (shallowSymbols.length > 0) {
    const names = shallowSymbols.slice(0, 3).map(s => s.symbol).join("、");
    suggestions.push({
      title: "试试多维度分析",
      desc: `你多次查询了 ${names}，但只用了单一功能。试试 scan 看技术面，或 predict 获取综合研判。`,
    });
  }

  const hasPredict = data.commandBreakdown.some(c => c.command === "predict");
  const hasScan = data.commandBreakdown.some(c => c.command === "scan");
  if (!hasPredict && !hasScan && data.totalActions >= 5) {
    suggestions.push({
      title: "用分析功能深入研究",
      desc: "scan 可以一键扫描技术指标（RSI/MACD/布林带），predict 会综合技术面和消息面给出研判。",
    });
  }

  const hasNews = data.commandBreakdown.some(c => c.command === "news");
  if (!hasNews && data.topSymbols.length > 0) {
    suggestions.push({
      title: "关注消息面",
      desc: `试试 news ${data.topSymbols[0].symbol} 查看最新动态，技术面 + 消息面结合更靠谱。`,
    });
  }

  return suggestions;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function generateHTML(data: InsightsData): string {
  const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const dateRange = data.dateRange
    ? `${data.dateRange.from.slice(0, 10)} 至 ${data.dateRange.to.slice(0, 10)}`
    : "";
  const profile = generateProfile(data);
  const suggestions = generateSuggestions(data);

  const maxSymCount = data.topSymbols[0]?.count || 1;
  const topSymbolsHTML = data.topSymbols.slice(0, 10).map(s => {
    const pct = ((s.count / maxSymCount) * 100).toFixed(1);
    const cmds = s.commands.map(c => CMD_LABELS[c] || c).join("、");
    return `<div class="bar-row">
      <div class="bar-label">${esc(s.symbol)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="bar-value">${s.count}</div>
    </div>
    <div class="bar-meta">${cmds} · ${s.firstSeen.slice(0, 10)} 起</div>`;
  }).join("");

  const maxCmdCount = data.commandBreakdown[0]?.count || 1;
  const cmdHTML = data.commandBreakdown.map(c => {
    const pct = ((c.count / maxCmdCount) * 100).toFixed(1);
    const label = CMD_LABELS[c.command] || c.command;
    return `<div class="bar-row">
      <div class="bar-label">${label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="bar-value">${c.count}</div>
    </div>`;
  }).join("");

  const maxDayCount = Math.max(...data.timeline.map(d => d.count), 1);
  const timelineHTML = data.timeline.slice(-30).map(d => {
    const barH = Math.max(Math.round((d.count / maxDayCount) * 100), 4);
    return `<div class="day-col" title="${d.date}: ${d.count} 次\n${d.symbols.join(', ')}">
      <div class="day-count">${d.count}</div>
      <div class="day-bar" style="height:${barH}px"></div>
      <div class="day-label">${d.date.slice(5)}</div>
    </div>`;
  }).join("");

  const recentHTML = data.recentActivity.map(r => {
    const label = CMD_LABELS[r.command] || r.command;
    const time = r.timestamp.slice(0, 16).replace("T", " ");
    return `<div class="recent-row">
      <span class="recent-time">${time}</span>
      <span class="recent-cmd">${label}</span>
      <span class="recent-symbols">${r.symbols.join(", ") || "—"}</span>
    </div>`;
  }).join("");

  const suggestionsHTML = suggestions.map(s =>
    `<div class="suggestion">
      <div class="suggestion-title">${esc(s.title)}</div>
      <div class="suggestion-desc">${esc(s.desc)}</div>
    </div>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ARTI Insights</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: #fff; color: #1a1a1a; line-height: 1.6; padding: 48px 24px; }
  .container { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; color: #946B1A; }
  h2 { font-size: 16px; font-weight: 600; margin-top: 48px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e5e5; color: #946B1A; }
  .subtitle { color: #999; font-size: 14px; margin-top: 4px; margin-bottom: 40px; }

  .stats-row { display: flex; gap: 32px; margin-bottom: 40px; flex-wrap: wrap; }
  .stat-value { font-size: 28px; font-weight: 700; color: #946B1A; }
  .stat-label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; }

  .profile { background: #FBF7EE; border-left: 3px solid #D4A74A; border-radius: 4px; padding: 20px; margin-bottom: 40px; font-size: 14px; color: #333; line-height: 1.8; }
  .profile strong { color: #946B1A; }

  .card { border: 1px solid #eee; border-radius: 8px; padding: 20px; margin-bottom: 16px; }

  .bar-row { display: flex; align-items: center; margin-bottom: 4px; }
  .bar-label { width: 80px; font-size: 13px; color: #666; flex-shrink: 0; font-weight: 500; }
  .bar-track { flex: 1; height: 4px; background: #f0f0f0; border-radius: 2px; margin: 0 12px; }
  .bar-fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg, #D4A74A, #C0912E); }
  .bar-value { width: 28px; font-size: 12px; color: #999; text-align: right; font-variant-numeric: tabular-nums; }
  .bar-meta { padding-left: 92px; font-size: 11px; color: #bbb; margin-bottom: 10px; }

  .timeline-container { display: flex; align-items: flex-end; gap: 3px; height: 120px; }
  .day-col { display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 0; cursor: default; }
  .day-count { font-size: 9px; color: #bbb; margin-bottom: 2px; }
  .day-bar { width: 100%; max-width: 20px; background: linear-gradient(180deg, #D4A74A, #C0912E); border-radius: 2px 2px 0 0; }
  .day-col:hover .day-bar { background: #D4A74A; }
  .day-label { font-size: 9px; color: #ccc; margin-top: 4px; }

  .recent-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; border-bottom: 1px solid #f5f5f5; font-size: 13px; }
  .recent-row:last-child { border-bottom: none; }
  .recent-time { color: #bbb; width: 120px; font-family: 'SF Mono', monospace; font-size: 12px; }
  .recent-cmd { color: #946B1A; width: 72px; font-size: 12px; font-weight: 500; }
  .recent-symbols { color: #1a1a1a; font-weight: 500; }

  .suggestion { background: #FBF7EE; border-radius: 6px; padding: 14px 16px; margin-bottom: 8px; }
  .suggestion-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #946B1A; }
  .suggestion-desc { font-size: 13px; color: #666; line-height: 1.5; }

  .empty-state { text-align: center; color: #bbb; padding: 60px 20px; }

  .footer { text-align: center; color: #ccc; font-size: 11px; margin-top: 48px; padding-top: 20px; border-top: 1px solid #f0f0f0; }

  @media (max-width: 640px) { .stats-row { gap: 20px; } }
</style>
</head>
<body>
<div class="container">
  <h1>ARTI Insights</h1>
  <p class="subtitle">${dateRange || "暂无数据"} · ${now}</p>

  ${data.totalActions === 0 ? `
  <div class="empty-state">
    <p style="font-size:14px;color:#999;">暂无投研记录</p>
    <p style="font-size:13px;margin-top:8px;color:#ccc;">使用 arti quote / scan / predict 等命令后，投研轨迹将自动记录于此</p>
  </div>
  ` : `
  <div class="stats-row">
    <div><div class="stat-value">${data.totalActions}</div><div class="stat-label">总操作</div></div>
    <div><div class="stat-value">${data.uniqueSymbols}</div><div class="stat-label">标的数</div></div>
    <div><div class="stat-value">${data.activeDays}</div><div class="stat-label">活跃天</div></div>
    <div><div class="stat-value">${data.topSymbols[0]?.symbol || "—"}</div><div class="stat-label">最关注</div></div>
  </div>

  <div class="profile">${profile}</div>

  <h2>关注标的</h2>
  <div class="card">
    ${topSymbolsHTML}
  </div>

  <h2>功能使用</h2>
  <div class="card">
    ${cmdHTML}
  </div>

  <h2>活跃度</h2>
  <div class="card">
    <div class="timeline-container">
      ${timelineHTML}
    </div>
  </div>

  <h2>最近操作</h2>
  <div class="card">
    ${recentHTML}
  </div>

  ${suggestions.length ? `
  <h2>建议</h2>
  ${suggestionsHTML}
  ` : ""}
  `}

  <div class="footer">ARTI CLI · 数据仅保存在本地</div>
</div>
</body>
</html>`;
}

export async function insightsCommand(): Promise<void> {
  const records = loadActivity();
  const data = analyze(records);

  output(data, () => {
    if (!existsSync(REPORT_DIR)) {
      mkdirSync(REPORT_DIR, { recursive: true });
    }

    const filename = `insights-${new Date().toISOString().slice(0, 10)}.html`;
    const filepath = join(REPORT_DIR, filename);
    writeFileSync(filepath, generateHTML(data), "utf-8");

    console.log();
    console.log(chalk.bold("  Your shareable insights report is ready:"));
    console.log(`  file://${filepath}`);
    console.log();
  });
}
