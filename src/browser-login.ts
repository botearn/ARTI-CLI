import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { getDefaultSupabasePublishableKey, getDefaultSupabaseUrl } from "./config.js";
import { getAuthState, saveSupabaseSession, type AuthState, type SupabaseAuthResponse } from "./auth.js";

const DEFAULT_WEB_AUTH_URL = "https://www.artifin.ai/auth";
const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/cli-auth/callback";
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;

interface BrowserLoginOptions {
  webAuthUrl?: string;
  timeoutMs?: number;
  onOpenUrl?: (url: string) => Promise<void> | void;
}

interface CallbackPayload {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number | string;
  expires_in?: number | string;
  user_id?: string;
  email?: string;
  state?: string;
}

export function buildBrowserLoginUrl(webAuthUrl: string, callbackUrl: string, state: string): string {
  const url = new URL(webAuthUrl || DEFAULT_WEB_AUTH_URL);
  url.searchParams.set("cli", "1");
  url.searchParams.set("callback_url", callbackUrl);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function loginWithBrowser(options?: BrowserLoginOptions): Promise<AuthState> {
  const auth = getAuthState();
  const state = randomBytes(16).toString("hex");
  const timeoutMs = options?.timeoutMs ?? CALLBACK_TIMEOUT_MS;

  return await new Promise<AuthState>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("浏览器登录超时，请重新执行 arti login"));
    }, timeoutMs);

    const server = createServer(async (req, res) => {
      try {
        if (!req.url) {
          writeJson(res, 404, { error: "not_found" });
          return;
        }

        const url = new URL(req.url, `http://${CALLBACK_HOST}`);
        if (req.method === "OPTIONS" && url.pathname === CALLBACK_PATH) {
          writeCors(res);
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method === "GET" && url.pathname === "/") {
          writeHtml(
            res,
            "ARTI CLI 登录中",
            "请回到 ARTI CLI 完成登录。",
          );
          return;
        }

        if (req.method !== "POST" || url.pathname !== CALLBACK_PATH) {
          writeJson(res, 404, { error: "not_found" });
          return;
        }

        const body = await readJsonBody(req);
        const payload = normalizePayload(body);
        const saved = completeBrowserLogin(payload, state, auth);

        writeJson(res, 200, {
          ok: true,
          email: saved.email,
          userId: saved.userId,
          message: "ARTI CLI 登录成功，请回到终端继续使用。",
        });

        settled = true;
        cleanup();
        resolve(saved);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeJson(res, 400, { error: message });
      }
    });
    server.once("error", (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    });

    const cleanup = () => {
      clearTimeout(timer);
      if (server.listening) {
        server.close();
      }
    };

    server.listen(0, CALLBACK_HOST, async () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        cleanup();
        reject(new Error("无法启动本地登录回调服务"));
        return;
      }

      const callbackUrl = `http://${CALLBACK_HOST}:${address.port}${CALLBACK_PATH}`;
      const webAuthUrl = options?.webAuthUrl || process.env.ARTI_WEB_AUTH_URL?.trim() || DEFAULT_WEB_AUTH_URL;
      const loginUrl = buildBrowserLoginUrl(webAuthUrl, callbackUrl, state);

      try {
        if (options?.onOpenUrl) {
          await options.onOpenUrl(loginUrl);
        } else {
          await openExternalUrl(loginUrl);
        }
      } catch (error) {
        if (!settled) {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
  });
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

export function completeBrowserLogin(
  payload: CallbackPayload,
  expectedState: string,
  currentAuth = getAuthState(),
): AuthState {
  if (!payload.access_token) {
    throw new Error("missing_access_token");
  }
  if (payload.state !== expectedState) {
    throw new Error("state_mismatch");
  }

  const session: SupabaseAuthResponse = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at,
    expires_in: payload.expires_in,
    user: {
      id: payload.user_id,
      email: payload.email,
    },
  };

  return saveSupabaseSession(session, {
    supabaseUrl: currentAuth.supabaseUrl || getDefaultSupabaseUrl(),
    publishableKey: currentAuth.publishableKey || getDefaultSupabasePublishableKey(),
    userId: payload.user_id || currentAuth.userId,
    email: payload.email || currentAuth.email,
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("callback payload too large");
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("invalid_json");
  }
}

function normalizePayload(body: unknown): Required<Pick<CallbackPayload, "access_token" | "state">> & CallbackPayload {
  if (!body || typeof body !== "object") {
    throw new Error("invalid_payload");
  }

  const payload = body as Record<string, unknown>;
  return {
    access_token: toStringValue(payload.access_token),
    refresh_token: toOptionalStringValue(payload.refresh_token),
    expires_at: toOptionalNumberValue(payload.expires_at),
    expires_in: toOptionalNumberValue(payload.expires_in),
    user_id: toOptionalStringValue(payload.user_id),
    email: toOptionalStringValue(payload.email),
    state: toStringValue(payload.state),
  };
}

function toStringValue(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("invalid_string");
  }
  return value.trim();
}

function toOptionalStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function toOptionalNumberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return undefined;
}

function writeCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function writeJson(res: ServerResponse, statusCode: number, data: unknown): void {
  writeCors(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function writeHtml(res: ServerResponse, title: string, message: string): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
