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

const CMD_COLORS: Record<string, string> = {
  quote: "#2563eb",
  scan: "#d97706",
  predict: "#7c3aed",
  news: "#059669",
  market: "#dc2626",
  research: "#db2777",
};

function analyze(records: ActivityRecord[]): InsightsData {
  if (!records.length) {
    return { totalActions: 0, uniqueSymbols: 0, activeDays: 0, dateRange: null, topSymbols: [], commandBreakdown: [], timeline: [], recentActivity: [] };
  }

  // 标的统计
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

  // 命令分布
  const cmdMap = new Map<string, number>();
  for (const r of records) {
    cmdMap.set(r.command, (cmdMap.get(r.command) || 0) + 1);
  }
  const commandBreakdown: CommandStat[] = [...cmdMap.entries()]
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count);

  // 按日时间线
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

/** 生成投研画像摘要 */
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

  return `你近期共进行了 <strong>${data.totalActions} 次投研操作</strong>，覆盖 <strong>${data.uniqueSymbols} 个标的</strong>，跨越 <strong>${data.activeDays} 个活跃日</strong>。最关注的标的是 <strong>${top3}</strong>，最常用的功能是<strong>${mainCmdLabel}</strong>。${style}`;
}

/** 生成投研建议 */
function generateSuggestions(data: InsightsData): { title: string; desc: string; type: "tip" | "warn" | "idea" }[] {
  const suggestions: { title: string; desc: string; type: "tip" | "warn" | "idea" }[] = [];
  if (!data.totalActions) return suggestions;

  // 深度不足
  const shallowSymbols = data.topSymbols.filter(s => s.count >= 2 && s.commands.length === 1);
  if (shallowSymbols.length > 0) {
    const names = shallowSymbols.slice(0, 3).map(s => s.symbol).join("、");
    suggestions.push({
      title: "试试多维度分析",
      desc: `你多次查询了 ${names}，但只用了单一功能。试试 scan 看技术面，或 predict 获取综合研判，可以更全面地评估。`,
      type: "tip",
    });
  }

  // 只看不分析
  const hasPredict = data.commandBreakdown.some(c => c.command === "predict");
  const hasScan = data.commandBreakdown.some(c => c.command === "scan");
  if (!hasPredict && !hasScan && data.totalActions >= 5) {
    suggestions.push({
      title: "别只看行情，用分析功能",
      desc: "你目前只使用了基础查询功能。scan 命令可以一键扫描技术指标（RSI/MACD/布林带），predict 会综合技术面和消息面给出研判。",
      type: "idea",
    });
  }

  // 没看新闻
  const hasNews = data.commandBreakdown.some(c => c.command === "news");
  if (!hasNews && data.topSymbols.length > 0) {
    suggestions.push({
      title: "关注基本面信息",
      desc: `你关注了 ${data.topSymbols[0].symbol} 等标的，但还没查看过相关新闻。用 news ${data.topSymbols[0].symbol} 看看最新动态，技术面 + 消息面结合才更靠谱。`,
      type: "tip",
    });
  }

  // 连续多日关注
  const streaks = data.topSymbols.filter(s => {
    const days = new Set<string>();
    for (const r of data.recentActivity) {
      if (r.symbols.includes(s.symbol)) days.add(r.timestamp.slice(0, 10));
    }
    return days.size >= 3;
  });
  if (streaks.length > 0) {
    suggestions.push({
      title: `持续追踪：${streaks[0].symbol}`,
      desc: `你已经连续多天关注 ${streaks[0].symbol}，说明你对它有较强的研究意向。考虑把它加入自选股（watchlist add ${streaks[0].symbol}）方便持续跟踪。`,
      type: "idea",
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

  // 标的排行条形图
  const maxSymCount = data.topSymbols[0]?.count || 1;
  const topSymbolsHTML = data.topSymbols.slice(0, 10).map(s => {
    const pct = ((s.count / maxSymCount) * 100).toFixed(1);
    const cmdTags = s.commands.map(c =>
      `<span class="tag" style="background:${CMD_COLORS[c] || "#6b7280"}">${CMD_LABELS[c] || c}</span>`
    ).join(" ");
    return `<div class="bar-row">
      <div class="bar-label">${esc(s.symbol)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:linear-gradient(90deg,#2563eb,#7c3aed)"></div></div>
      <div class="bar-value">${s.count}</div>
    </div>
    <div style="padding-left:100px;margin:-2px 0 8px 8px;font-size:11px;color:#94a3b8;">
      ${cmdTags} <span style="margin-left:4px">首次 ${s.firstSeen.slice(0, 10)} · 最近 ${s.lastSeen.slice(0, 10)}</span>
    </div>`;
  }).join("");

  // 命令分布条形图
  const maxCmdCount = data.commandBreakdown[0]?.count || 1;
  const cmdHTML = data.commandBreakdown.map(c => {
    const pct = ((c.count / maxCmdCount) * 100).toFixed(1);
    const color = CMD_COLORS[c.command] || "#6b7280";
    const label = CMD_LABELS[c.command] || c.command;
    return `<div class="bar-row">
      <div class="bar-label">${label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="bar-value">${c.count}</div>
    </div>`;
  }).join("");

  // 时间线柱状图
  const maxDayCount = Math.max(...data.timeline.map(d => d.count), 1);
  const timelineHTML = data.timeline.slice(-30).map(d => {
    const barH = Math.max(Math.round((d.count / maxDayCount) * 100), 4);
    return `<div class="day-col" title="${d.date}\n${d.count} 次操作\n${d.symbols.join(', ')}">
      <div class="day-count">${d.count}</div>
      <div class="day-bar" style="height:${barH}px"></div>
      <div class="day-label">${d.date.slice(5)}</div>
    </div>`;
  }).join("");

  // 最近操作列表
  const recentHTML = data.recentActivity.map(r => {
    const color = CMD_COLORS[r.command] || "#6b7280";
    const label = CMD_LABELS[r.command] || r.command;
    const time = r.timestamp.slice(0, 16).replace("T", " ");
    return `<div class="recent-row">
      <span class="recent-time">${time}</span>
      <span class="tag" style="background:${color}">${label}</span>
      <span class="recent-symbols">${r.symbols.join(", ") || "—"}</span>
    </div>`;
  }).join("");

  // 建议卡片
  const suggestionColors = { tip: { bg: "#f0fdf4", border: "#bbf7d0", title: "#166534", desc: "#15803d" }, warn: { bg: "#fef2f2", border: "#fca5a5", title: "#991b1b", desc: "#7f1d1d" }, idea: { bg: "#eff6ff", border: "#bfdbfe", title: "#1e40af", desc: "#1e3a5f" } };
  const suggestionsHTML = suggestions.map(s => {
    const c = suggestionColors[s.type];
    return `<div style="background:${c.bg};border:1px solid ${c.border};border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="font-weight:600;font-size:15px;color:${c.title};margin-bottom:6px;">${esc(s.title)}</div>
      <div style="font-size:14px;color:${c.desc};line-height:1.5;">${esc(s.desc)}</div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ARTI Insights — 个人投研洞察</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; color: #334155; line-height: 1.65; padding: 48px 24px; }
  .container { max-width: 800px; margin: 0 auto; }
  h1 { font-size: 32px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
  h2 { font-size: 20px; font-weight: 600; color: #0f172a; margin-top: 48px; margin-bottom: 16px; }
  .subtitle { color: #64748b; font-size: 15px; margin-bottom: 32px; }

  .nav-toc { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0 32px 0; padding: 16px; background: white; border-radius: 8px; border: 1px solid #e2e8f0; }
  .nav-toc a { font-size: 12px; color: #64748b; text-decoration: none; padding: 6px 12px; border-radius: 6px; background: #f1f5f9; transition: all 0.15s; }
  .nav-toc a:hover { background: #e2e8f0; color: #334155; }

  .stats-row { display: flex; gap: 24px; margin-bottom: 40px; padding: 20px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
  .stat { text-align: center; }
  .stat-value { font-size: 24px; font-weight: 700; color: #0f172a; }
  .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }

  .at-a-glance { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #f59e0b; border-radius: 12px; padding: 20px 24px; margin-bottom: 32px; }
  .glance-title { font-size: 16px; font-weight: 700; color: #92400e; margin-bottom: 12px; }
  .glance-text { font-size: 14px; color: #78350f; line-height: 1.7; }
  .glance-text strong { color: #92400e; }

  .chart-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .chart-title { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
  .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }

  .bar-row { display: flex; align-items: center; margin-bottom: 6px; }
  .bar-label { width: 100px; font-size: 12px; color: #475569; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .bar-track { flex: 1; height: 6px; background: #f1f5f9; border-radius: 3px; margin: 0 8px; }
  .bar-fill { height: 100%; border-radius: 3px; }
  .bar-value { width: 32px; font-size: 12px; font-weight: 600; color: #64748b; text-align: right; }

  .tag { display: inline-block; font-size: 10px; color: #fff; padding: 1px 6px; border-radius: 4px; font-weight: 500; }

  .timeline-container { display: flex; align-items: flex-end; gap: 3px; height: 140px; padding-top: 10px; }
  .day-col { display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 0; }
  .day-count { font-size: 9px; color: #94a3b8; margin-bottom: 2px; }
  .day-bar { width: 100%; max-width: 24px; background: linear-gradient(180deg, #2563eb, #1e40af); border-radius: 3px 3px 0 0; transition: height 0.3s; }
  .day-col:hover .day-bar { background: linear-gradient(180deg, #3b82f6, #2563eb); }
  .day-label { font-size: 9px; color: #94a3b8; margin-top: 4px; white-space: nowrap; }

  .recent-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  .recent-row:last-child { border-bottom: none; }
  .recent-time { color: #94a3b8; width: 130px; font-family: 'SF Mono', 'Cascadia Code', monospace; font-size: 12px; }
  .recent-symbols { color: #334155; font-weight: 500; }

  .section-intro { font-size: 14px; color: #64748b; margin-bottom: 16px; }

  .empty-state { text-align: center; color: #94a3b8; padding: 60px 20px; }
  .empty-state p { margin-bottom: 8px; }

  .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 48px; padding-top: 24px; border-top: 1px solid #e2e8f0; }

  @media (max-width: 640px) { .charts-row { grid-template-columns: 1fr; } .stats-row { justify-content: center; } }
</style>
</head>
<body>
<div class="container">
  <h1>ARTI Insights</h1>
  <p class="subtitle">个人投研洞察报告 · ${dateRange ? `${dateRange} · ` : ""}生成于 ${now}</p>

  ${data.totalActions === 0 ? `
  <div class="chart-card">
    <div class="empty-state">
      <p style="font-size:48px;margin-bottom:16px;">&#x1F50D;</p>
      <p style="font-size:16px;color:#475569;font-weight:600;">暂无投研记录</p>
      <p style="font-size:13px;margin-top:8px;">开始使用 arti quote / scan / predict 等命令<br>你的投研轨迹将自动记录于此</p>
    </div>
  </div>
  ` : `
  <div class="at-a-glance">
    <div class="glance-title">投研画像</div>
    <div class="glance-text">${profile}</div>
  </div>

  <nav class="nav-toc">
    <a href="#section-stats">数据概览</a>
    <a href="#section-symbols">关注标的</a>
    <a href="#section-behavior">行为分布</a>
    <a href="#section-timeline">活跃时间线</a>
    <a href="#section-recent">最近操作</a>
    ${suggestions.length ? '<a href="#section-suggestions">投研建议</a>' : ""}
  </nav>

  <div class="stats-row" id="section-stats">
    <div class="stat"><div class="stat-value">${data.totalActions}</div><div class="stat-label">总操作</div></div>
    <div class="stat"><div class="stat-value">${data.uniqueSymbols}</div><div class="stat-label">关注标的</div></div>
    <div class="stat"><div class="stat-value">${data.activeDays}</div><div class="stat-label">活跃天数</div></div>
    <div class="stat"><div class="stat-value">${data.commandBreakdown.length}</div><div class="stat-label">使用功能</div></div>
    <div class="stat"><div class="stat-value">${data.topSymbols[0]?.symbol || "—"}</div><div class="stat-label">最关注</div></div>
  </div>

  <h2 id="section-symbols">关注标的排行</h2>
  <p class="section-intro">按查询次数排序，展示你投入研究精力最多的标的。</p>
  <div class="chart-card">
    <div class="chart-title">标的查询频次 Top 10</div>
    ${topSymbolsHTML}
  </div>

  <h2 id="section-behavior">投研行为分布</h2>
  <p class="section-intro">你使用各项功能的频率，反映你的投研习惯和偏好。</p>
  <div class="charts-row">
    <div class="chart-card">
      <div class="chart-title">功能使用次数</div>
      ${cmdHTML}
    </div>
    <div class="chart-card">
      <div class="chart-title">功能使用占比</div>
      ${data.commandBreakdown.map(c => {
        const total = data.commandBreakdown.reduce((sum, cc) => sum + cc.count, 0) || 1;
        const pct = ((c.count / total) * 100).toFixed(1);
        const color = CMD_COLORS[c.command] || "#6b7280";
        const label = CMD_LABELS[c.command] || c.command;
        return `<div class="bar-row">
          <div class="bar-label">${label}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <div class="bar-value">${pct}%</div>
        </div>`;
      }).join("")}
    </div>
  </div>

  <h2 id="section-timeline">活跃度时间线</h2>
  <p class="section-intro">近 30 天每日操作次数，鼠标悬停可查看当日关注的标的。</p>
  <div class="chart-card">
    <div class="chart-title">每日操作次数</div>
    <div class="timeline-container">
      ${timelineHTML}
    </div>
  </div>

  <h2 id="section-recent">最近操作</h2>
  <p class="section-intro">最近 20 条投研操作记录。</p>
  <div class="chart-card">
    ${recentHTML}
  </div>

  ${suggestions.length ? `
  <h2 id="section-suggestions">投研建议</h2>
  <p class="section-intro">基于你的使用习惯，ARTI 为你生成的个性化建议。</p>
  ${suggestionsHTML}
  ` : ""}
  `}

  <div class="footer">ARTI CLI · 你的个人投研助手 · 数据仅保存在本地</div>
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
