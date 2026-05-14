import {
  deriveSupabaseUrlFromApiBase,
  getDefaultSupabaseUrl,
  loadConfig,
  saveConfig,
  type ArtiConfig,
} from "./config.js";

const AUTH_EXPIRY_SKEW_SECONDS = 60;

export interface AuthState {
  token: string;
  refreshToken: string;
  expiresAt: number | null;
  userId: string;
  email: string;
  supabaseUrl: string;
  publishableKey: string;
}

export interface SupabaseAuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: {
    id?: string;
    email?: string;
  };
}

interface JwtPayload {
  exp?: number;
  email?: string;
  sub?: string;
}

export function getAuthState(): AuthState {
  const config = loadConfig();
  return {
    token: config.auth.token,
    refreshToken: config.auth.refreshToken,
    expiresAt: config.auth.expiresAt,
    userId: config.auth.userId,
    email: config.auth.email,
    supabaseUrl: resolveSupabaseUrl(config),
    publishableKey: resolvePublishableKey(config),
  };
}

export function isLoggedIn(auth = getAuthState()): boolean {
  return Boolean(auth.token);
}

export function saveAuthState(auth: Partial<AuthState>): ArtiConfig {
  const config = loadConfig();
  const merged = mergeAuthState(config, auth);
  config.auth = merged;
  saveConfig(config);
  return config;
}

export function clearAuthState(): ArtiConfig {
  const config = loadConfig();
  config.auth = {
    token: "",
    refreshToken: "",
    expiresAt: null,
    userId: "",
    email: "",
    supabaseUrl: resolveSupabaseUrl(config),
    publishableKey: resolvePublishableKey(config),
  };
  saveConfig(config);
  return config;
}

export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 8) return "*".repeat(token.length);
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  if (!token || !token.includes(".")) return null;
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpiringSoon(
  auth: Pick<AuthState, "token" | "expiresAt">,
  skewSeconds = AUTH_EXPIRY_SKEW_SECONDS,
): boolean {
  const exp = auth.expiresAt ?? decodeJwtPayload(auth.token)?.exp ?? null;
  if (!exp) return false;
  return exp <= Math.floor(Date.now() / 1000) + skewSeconds;
}

export async function loginWithPassword(email: string, password: string): Promise<AuthState> {
  const { supabaseUrl, publishableKey } = getAuthState();
  ensureSupabaseKey(publishableKey, "邮箱密码登录");

  const session = await requestSupabaseSession(
    supabaseUrl,
    publishableKey,
    "password",
    { email, password },
  );
  return persistSession(session, { supabaseUrl, publishableKey });
}

export async function refreshAuthSession(current = getAuthState()): Promise<AuthState> {
  if (!current.refreshToken) {
    throw new Error("当前登录态缺少 refresh token，请重新登录");
  }
  ensureSupabaseKey(current.publishableKey, "自动续期");

  const session = await requestSupabaseSession(
    current.supabaseUrl,
    current.publishableKey,
    "refresh_token",
    { refresh_token: current.refreshToken },
  );
  return persistSession(session, current);
}

export function saveSupabaseSession(
  session: SupabaseAuthResponse,
  current?: Partial<AuthState>,
): AuthState {
  return persistSession(session, current);
}

export async function ensureValidAccessToken(options?: {
  forceRefresh?: boolean;
}): Promise<string> {
  const auth = getAuthState();
  if (!auth.token) return "";

  if (!options?.forceRefresh && !isTokenExpiringSoon(auth)) {
    return auth.token;
  }

  if (!auth.refreshToken) {
    if (isTokenExpiringSoon(auth, 0)) {
      throw new Error("登录已过期，请重新登录（当前缺少 refresh token）");
    }
    return auth.token;
  }

  const refreshed = await refreshAuthSession(auth);
  return refreshed.token;
}

export async function getAuthenticatedUserProfile(): Promise<{
  id: string | null;
  email: string | null;
}> {
  const auth = getAuthState();
  const token = await ensureValidAccessToken();
  if (!token) {
    return { id: null, email: null };
  }

  const payload = decodeJwtPayload(token);
  if (!auth.publishableKey) {
    const id = auth.userId || payload?.sub || null;
    const email = auth.email || payload?.email || null;
    return { id, email };
  }

  const res = await fetch(`${auth.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: auth.publishableKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(`读取当前用户失败: ${text}`);
  }

  const user = await res.json() as { id?: string; email?: string };
  const merged = saveAuthState({
    userId: user.id || auth.userId || payload?.sub || "",
    email: user.email || auth.email || payload?.email || "",
  });

  return {
    id: merged.auth.userId || null,
    email: merged.auth.email || null,
  };
}

function resolveSupabaseUrl(config: ArtiConfig): string {
  return config.auth.supabaseUrl
    || deriveSupabaseUrlFromApiBase(config.api.baseUrl)
    || getDefaultSupabaseUrl();
}

function resolvePublishableKey(config: ArtiConfig): string {
  return config.auth.publishableKey || "";
}

function mergeAuthState(config: ArtiConfig, auth: Partial<AuthState>): ArtiConfig["auth"] {
  const previous = config.auth;
  const token = auth.token ?? previous.token;
  const payload = decodeJwtPayload(token);
  const expiresAt = auth.expiresAt
    ?? previous.expiresAt
    ?? payload?.exp
    ?? null;

  return {
    token,
    refreshToken: auth.refreshToken ?? previous.refreshToken,
    expiresAt,
    userId: auth.userId ?? previous.userId ?? payload?.sub ?? "",
    email: auth.email ?? previous.email ?? payload?.email ?? "",
    supabaseUrl: auth.supabaseUrl ?? resolveSupabaseUrl(config),
    publishableKey: auth.publishableKey ?? resolvePublishableKey(config),
  };
}

function persistSession(
  session: SupabaseAuthResponse,
  current?: Partial<AuthState>,
): AuthState {
  const payload = decodeJwtPayload(session.access_token);
  const expiresAt = session.expires_at
    ?? (session.expires_in ? Math.floor(Date.now() / 1000) + session.expires_in : null)
    ?? payload?.exp
    ?? null;

  saveAuthState({
    token: session.access_token,
    refreshToken: session.refresh_token ?? current?.refreshToken ?? "",
    expiresAt,
    userId: session.user?.id ?? current?.userId ?? payload?.sub ?? "",
    email: session.user?.email ?? current?.email ?? payload?.email ?? "",
    supabaseUrl: current?.supabaseUrl,
    publishableKey: current?.publishableKey,
  });

  return getAuthState();
}

async function requestSupabaseSession(
  supabaseUrl: string,
  publishableKey: string,
  grantType: "password" | "refresh_token",
  body: Record<string, unknown>,
): Promise<SupabaseAuthResponse> {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=${grantType}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(`Supabase ${grantType} 失败: ${text}`);
  }

  return await res.json() as SupabaseAuthResponse;
}

function ensureSupabaseKey(publishableKey: string, action: string): void {
  if (!publishableKey) {
    throw new Error(
      `${action}需要 Supabase publishable key，请设置 ARTI_SUPABASE_PUBLISHABLE_KEY 或 auth.publishableKey`,
    );
  }
}
