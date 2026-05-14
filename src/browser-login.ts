import { spawn } from "node:child_process";
import { getDefaultSupabasePublishableKey, getDefaultSupabaseUrl } from "./config.js";
import { getAuthState, saveSupabaseSession, type AuthState, type SupabaseAuthResponse } from "./auth.js";

const DEFAULT_WEB_AUTH_URL = "https://www.artifin.ai/auth";
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
      return saveSupabaseSession(polled.session, {
        supabaseUrl: auth.supabaseUrl || getDefaultSupabaseUrl(),
        publishableKey: auth.publishableKey || getDefaultSupabasePublishableKey(),
        userId: polled.session.user?.id || auth.userId,
        email: polled.session.user?.email || auth.email,
      });
    }
    if (polled.status === "expired") {
      throw new Error("网页登录已过期，请重新执行 arti login");
    }
    await delay(polled.poll_after_ms || pollIntervalMs);
  }

  throw new Error("浏览器登录超时，请重新执行 arti login");
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

async function startLoginSession(): Promise<CliAuthStartResponse> {
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

async function pollLoginSession(sessionId: string, pollToken: string): Promise<CliAuthPollResponse> {
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
