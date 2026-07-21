import { describe, expect, it } from "vitest";
import {
  renderBanner,
  renderStatusContent,
  supportsUnicode,
  tipOfTheDay,
} from "../src/core/banner.js";
import { formatUpdateNotice } from "../src/update-check.js";
import type { BillingState } from "../src/billing.js";

const fakeBilling = {
  tierLabel: "Pro",
  balance: 1240,
} as BillingState;

describe("启动 banner", () => {
  it("宽终端 + Unicode + 已登录：方块 logo、版本号、余额占位符", () => {
    const { lines, statusLineIndex } = renderBanner({
      version: "0.4.0",
      who: "zhe@artifin.ai",
      columns: 80,
      unicode: true,
      now: new Date("2026-07-19"),
    });
    const text = lines.join("\n");

    expect(text).toContain("█████"); // 大字标
    expect(text).toContain("0.4.0");
    expect(text).toContain("zhe@artifin.ai");
    expect(text).toContain("余额查询中");
    expect(text).toContain("提示：");
    // 状态行下标指向含身份的那一行，供异步回填定位
    expect(statusLineIndex).toBeGreaterThan(0);
    expect(lines[statusLineIndex]).toContain("zhe@artifin.ai");
    // 上下两条分隔线
    expect(lines.filter(l => l.includes("─")).length).toBeGreaterThanOrEqual(2);
  });

  it("窄终端回退单行小字标，不出现方块字符", () => {
    const { lines } = renderBanner({ version: "0.4.0", who: "u", columns: 40, unicode: true });
    const text = lines.join("\n");

    expect(text).not.toContain("█");
    expect(text).toContain("ARTI");
    expect(text).toContain("0.4.0");
  });

  it("非 Unicode 终端回退纯 ASCII 分隔线", () => {
    const { lines } = renderBanner({ version: "0.4.0", who: "u", columns: 80, unicode: false });
    const text = lines.join("\n");

    expect(text).not.toContain("█");
    expect(text).not.toContain("─");
    expect(text).toContain("ARTI");
  });

  it("未登录显示 login 引导，状态行下标为 -1（不做余额回填）", () => {
    const { lines, statusLineIndex } = renderBanner({ version: "0.4.0", who: null, columns: 80 });

    expect(lines.join("\n")).toContain("login");
    expect(statusLineIndex).toBe(-1);
  });

  it("supportsUnicode：win32 无现代终端变量时回退，TERM=dumb 一律回退", () => {
    expect(supportsUnicode("darwin", {})).toBe(true);
    expect(supportsUnicode("win32", {})).toBe(false);
    expect(supportsUnicode("win32", { WT_SESSION: "1" })).toBe(true);
    expect(supportsUnicode("darwin", { TERM: "dumb" })).toBe(false);
  });
});

describe("状态行内容", () => {
  it("pending 显示占位符，billing 到位后显示套餐与余额", () => {
    expect(renderStatusContent("zhe@x.com", "pending")).toContain("余额查询中");

    const filled = renderStatusContent("zhe@x.com", fakeBilling);
    expect(filled).toContain("zhe@x.com");
    expect(filled).toContain("Pro");
    expect(filled).toContain("1,240");
    expect(filled).toContain("Credits");
    expect(filled).not.toContain("余额查询中");
  });

  it("error 只保留身份，去掉占位符", () => {
    const line = renderStatusContent("zhe@x.com", "error");
    expect(line).toContain("zhe@x.com");
    expect(line).not.toContain("余额查询中");
  });
});

describe("每日提示", () => {
  it("同一天结果固定，且来自提示列表", () => {
    const day = new Date("2026-07-19T10:00:00");
    const tip = tipOfTheDay(day);

    expect(tipOfTheDay(new Date("2026-07-19T23:59:59"))).toBe(tip);
    expect(tip.length).toBeGreaterThan(0);
  });
});

describe("更新提示", () => {
  it("formatUpdateNotice 包含当前与最新版本号", () => {
    const notice = formatUpdateNotice("0.4.0", "0.5.0");
    expect(notice).toContain("0.4.0");
    expect(notice).toContain("0.5.0");
    expect(notice).toContain("npm i -g artifin-cli");
  });
});
