/**
 * 版本更新检查 — 启动时静默检查 npm 最新版本
 * 超过 24 小时才检查一次，不阻塞主流程
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";

const CONFIG_DIR = join(homedir(), ".config", "arti");
const CHECK_FILE = join(CONFIG_DIR, "update-check.json");
const PACKAGE_NAME = "arti-cli";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 小时

interface CheckState {
  lastCheck: number;
  latestVersion: string | null;
}

function loadState(): CheckState {
  if (!existsSync(CHECK_FILE)) return { lastCheck: 0, latestVersion: null };
  try {
    return JSON.parse(readFileSync(CHECK_FILE, "utf-8"));
  } catch {
    return { lastCheck: 0, latestVersion: null };
  }
}

function saveState(state: CheckState): void {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CHECK_FILE, JSON.stringify(state) + "\n", "utf-8");
  } catch {
    // 静默
  }
}

function parseVersion(v: string): number[] {
  return v.replace(/^v/, "").split(".").map(Number);
}

function isNewer(latest: string, current: string): boolean {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

/**
 * 静默检查更新。仅在超过 24h 未检查时发起请求。
 * 如果有新版本，打印提示。不抛异常、不阻塞。
 */
export async function checkForUpdate(currentVersion: string): Promise<void> {
  try {
    const state = loadState();
    if (Date.now() - state.lastCheck < CHECK_INTERVAL_MS) {
      // 上次检查距离现在不到 24h，用缓存结果
      if (state.latestVersion && isNewer(state.latestVersion, currentVersion)) {
        printUpdateNotice(currentVersion, state.latestVersion);
      }
      return;
    }

    // 发起 npm registry 查询
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      saveState({ lastCheck: Date.now(), latestVersion: null });
      return;
    }

    const data = await res.json() as { version?: string };
    const latest = data.version || null;
    saveState({ lastCheck: Date.now(), latestVersion: latest });

    if (latest && isNewer(latest, currentVersion)) {
      printUpdateNotice(currentVersion, latest);
    }
  } catch {
    // 静默失败 — 网络不通、超时等不影响使用
  }
}

function printUpdateNotice(current: string, latest: string): void {
  console.log(
    chalk.yellow(`\n  新版本可用: ${current} → ${chalk.bold(latest)}`) +
    chalk.gray(`  运行 ${chalk.white("npm i -g arti-cli")} 更新\n`)
  );
}
