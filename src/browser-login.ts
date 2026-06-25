import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { getDefaultSupabasePublishableKey, getDefaultSupabaseUrl, saveConfig, loadConfig } from "./config.js";
import { getAuthState, saveSupabaseSession, type AuthState, type SupabaseAuthResponse } from "./auth.js";

const DEFAULT_WEB_AUTH_URL = "https://artifin.ai/cli/auth";
const PENDING_FILE = join(homedir(), ".config", "arti", "pending-login.json");
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 2000;

interface BrowserLoginOptions {
  webAuthUrl?: string;
  timeoutMs?: number;
  onOpenUrl?: (url: string) => Promise<void> | void;
  onLoginUrl?: (url: string) => void;
  onCode?: (code: string) => void;
  onApproved?: () => void;
}

interface CliAuthStartResponse {
  session_id: string;
  code: string;
  poll_token: string;
  login_url: string;
  expires_at?: string;
  poll_interval_ms?: number;
}

interface CliAuthPollResponse {
  status: "pending" | "approved" | "expired" | "consumed";
  code?: string;
  poll_after_ms?: number;
  expires_at?: string;
  session?: SupabaseAuthResponse;
}

export async function loginWithBrowser(options?: BrowserLoginOptions): Promise<AuthState> {
  const auth = getAuthState();
  // 确保首次使用时配置文件被创建
  ensureConfigInitialized();
  const timeoutMs = options?.timeoutMs ?? LOGIN_TIMEOUT_MS;
  const started = await startLoginSession();

  options?.onLoginUrl?.(started.login_url);
  options?.onCode?.(started.code);
  if (options?.onOpenUrl) {
    await options.onOpenUrl(started.login_url);
  } else {
    await openExternalUrl(started.login_url);
  }

  const deadline = Date.now() + timeoutMs;
  const pollIntervalMs = started.poll_interval_ms || DEFAULT_POLL_INTERVAL_MS;

  while (Date.now() < deadline) {
    const polled = await pollLoginSession(started.session_id, started.poll_token);
    if (polled.status === "approved" && polled.session?.access_token) {
      options?.onApproved?.();
      return saveApprovedSession(polled.session);
    }
    if (polled.status === "expired") {
      throw new Error("网页登录已过期（5 分钟未操作）。请重新执行 arti login");
    }
    await delay(polled.poll_after_ms || pollIntervalMs);
  }

  throw new Error(
    "浏览器登录超时（5 分钟未收到确认）。\n" +
    "  • 请确认浏览器已打开并显示验证码页面\n" +
    "  • 检查您的网络连接\n" +
    "  • 重新执行 arti login 重试"
  );
}

/** 保存已批准的登录会话到本地配置，返回 AuthState */
export function saveApprovedSession(session: SupabaseAuthResponse): AuthState {
  const auth = getAuthState();
  return saveSupabaseSession(session, {
    supabaseUrl: auth.supabaseUrl || getDefaultSupabaseUrl(),
    publishableKey: auth.publishableKey || getDefaultSupabasePublishableKey(),
    userId: session.user?.id || auth.userId,
    email: session.user?.email || auth.email,
  });
}

// ── 待确认登录会话持久化（供 agent 两步式 --start / --poll 使用）──

export interface PendingLogin {
  session_id: string;
  poll_token: string;
  login_url: string;
  code: string;
  expires_at?: string;
  poll_interval_ms?: number;
}

export function savePendingLogin(p: PendingLogin): void {
  mkdirSync(dirname(PENDING_FILE), { recursive: true });
  writeFileSync(PENDING_FILE, JSON.stringify(p, null, 2));
}

export function loadPendingLogin(): PendingLogin | null {
  if (!existsSync(PENDING_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PENDING_FILE, "utf8")) as PendingLogin;
  } catch {
    return null;
  }
}

export function clearPendingLogin(): void {
  try {
    rmSync(PENDING_FILE, { force: true });
  } catch {
    // 文件不存在或无法删除，忽略
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  const platform = process.platform;
  const command = platform === "darwin"
    ? { cmd: "open", args: [url] }
    : platform === "win32"
      ? { cmd: "cmd", args: ["/c", "start", "", url] }
      : { cmd: "xdg-open", args: [url] };

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.cmd, command.args, {
      detached: true,
      stdio: "ignore",
    });

    child.once("error", (error) => {
      reject(new Error(`打开浏览器失败，请手动访问：${url}\n${error.message}`));
    });

    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export function buildBrowserLoginUrl(webAuthUrl: string, sessionId: string, code: string): string {
  const url = new URL(webAuthUrl || DEFAULT_WEB_AUTH_URL);
  url.searchParams.set("cli", "1");
  url.searchParams.set("session_id", sessionId);
  url.searchParams.set("device_code", code);
  return url.toString();
}

export async function startLoginSession(): Promise<CliAuthStartResponse> {
  const auth = getAuthState();
  const res = await fetch(`${auth.supabaseUrl}/functions/v1/cli-auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: auth.publishableKey,
    },
    body: JSON.stringify({ action: "start" }),
  });
  if (!res.ok) {
    throw new Error(`启动网页登录失败: ${await safeText(res)}`);
  }
  const data = await res.json() as CliAuthStartResponse;
  const webAuthUrl = process.env.ARTI_WEB_AUTH_URL?.trim() || DEFAULT_WEB_AUTH_URL;
  return {
    ...data,
    login_url: buildBrowserLoginUrl(webAuthUrl, data.session_id, data.code),
  };
}

export async function pollLoginSession(sessionId: string, pollToken: string): Promise<CliAuthPollResponse> {
  const auth = getAuthState();
  const url = new URL(`${auth.supabaseUrl}/functions/v1/cli-auth`);
  url.searchParams.set("session_id", sessionId);
  url.searchParams.set("poll_token", pollToken);
  const res = await fetch(url, {
    headers: {
      apikey: auth.publishableKey,
    },
  });
  if (!res.ok) {
    throw new Error(`查询网页登录状态失败: ${await safeText(res)}`);
  }
  return await res.json() as CliAuthPollResponse;
}

async function safeText(res: Response): Promise<string> {
  return await res.text().catch(() => "unknown error");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureConfigInitialized(): void {
  // 触发配置文件创建（通过 saveConfig 保存当前配置）
  const config = loadConfig();
  saveConfig(config);
}
