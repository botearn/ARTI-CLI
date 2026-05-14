import chalk from "chalk";
import { loginWithBrowser } from "../browser-login.js";
import {
  clearAuthState,
  decodeJwtPayload,
  getAuthenticatedUserProfile,
  getAuthState,
  isLoggedIn,
  loginWithPassword,
  maskToken,
  refreshAuthSession,
  saveAuthState,
} from "../auth.js";
import { output } from "../output.js";

interface LoginOptions {
  token?: string;
  refreshToken?: string;
  email?: string;
  password?: string;
  userId?: string;
  supabaseUrl?: string;
  publishableKey?: string;
  webAuthUrl?: string;
}

export async function loginCommand(options?: LoginOptions): Promise<void> {
  const token = options?.token?.trim() || process.env.ARTI_AUTH_TOKEN?.trim() || "";
  const refreshToken = options?.refreshToken?.trim() || process.env.ARTI_AUTH_REFRESH_TOKEN?.trim() || "";
  const email = options?.email?.trim() || process.env.ARTI_USER_EMAIL?.trim() || "";
  const password = options?.password?.trim() || process.env.ARTI_USER_PASSWORD?.trim() || "";
  const userId = options?.userId?.trim() || process.env.ARTI_USER_ID?.trim() || "";
  const supabaseUrl = options?.supabaseUrl?.trim() || process.env.ARTI_SUPABASE_URL?.trim() || "";
  const publishableKey = options?.publishableKey?.trim()
    || process.env.ARTI_SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.SUPABASE_ANON_KEY?.trim()
    || "";
  const webAuthUrl = options?.webAuthUrl?.trim() || process.env.ARTI_WEB_AUTH_URL?.trim() || "";

  if (supabaseUrl || publishableKey) {
    saveAuthState({ supabaseUrl, publishableKey });
  }

  try {
    if (email && password) {
      const auth = await loginWithPassword(email, password);
      printLoginSuccess(auth.email, auth.userId, auth.token, Boolean(auth.refreshToken));
      return;
    }

    if (!token) {
      console.log(chalk.gray("  正在打开 ARTI 官网登录页…"));
      console.log();
      const auth = await loginWithBrowser({ webAuthUrl });
      printLoginSuccess(auth.email, auth.userId, auth.token, Boolean(auth.refreshToken));
      return;
    }

    const payload = decodeJwtPayload(token);
    saveAuthState({
      token,
      refreshToken,
      email: email || payload?.email || "",
      userId: userId || payload?.sub || "",
      expiresAt: payload?.exp ?? null,
    });

    if (refreshToken) {
      try {
        await refreshAuthSession();
      } catch {
        // 保留显式传入的 access token，允许仅 access token 的兼容登录。
      }
    }

    const auth = getAuthState();
    printLoginSuccess(auth.email, auth.userId, auth.token, Boolean(auth.refreshToken));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`登录失败: ${message}`));
  }
}

export function logoutCommand(): void {
  const auth = getAuthState();
  if (!isLoggedIn(auth)) {
    console.log(chalk.yellow("  当前未登录"));
    return;
  }

  clearAuthState();
  console.log(chalk.green("  已退出登录"));
}

export async function whoamiCommand(): Promise<void> {
  const auth = getAuthState();
  let profile = {
    email: auth.email || null,
    userId: auth.userId || null,
  };

  if (isLoggedIn(auth)) {
    try {
      const fresh = await getAuthenticatedUserProfile();
      profile = {
        email: fresh.email,
        userId: fresh.id,
      };
    } catch {
      // 退回本地已缓存信息，不阻塞 whoami。
    }
  }

  output(
    {
      loggedIn: isLoggedIn(auth),
      email: profile.email,
      userId: profile.userId,
      tokenMasked: auth.token ? maskToken(auth.token) : null,
      refreshTokenMasked: auth.refreshToken ? maskToken(auth.refreshToken) : null,
      expiresAt: auth.expiresAt,
    },
    () => {
      console.log();
      console.log(chalk.bold.white("  ARTI Account"));
      console.log(chalk.gray("  ─────────────────────────────────────"));
      if (!isLoggedIn(auth)) {
        console.log(chalk.yellow("  未登录"));
        console.log(chalk.gray("  使用 arti login 打开官网登录，或使用兼容参数手动登录"));
        console.log();
        return;
      }
      console.log(chalk.green("  已登录"));
      if (profile.email) console.log(`  邮箱      ${chalk.white(profile.email)}`);
      if (profile.userId) console.log(`  用户 ID   ${chalk.white(profile.userId)}`);
      console.log(`  Token     ${chalk.gray(maskToken(auth.token))}`);
      if (auth.refreshToken) {
        console.log(`  Refresh   ${chalk.gray(maskToken(auth.refreshToken))}`);
      }
      if (auth.expiresAt) {
        console.log(`  过期时间  ${chalk.white(new Date(auth.expiresAt * 1000).toISOString())}`);
      }
      console.log();
    },
  );
}

function printLoginSuccess(
  email: string,
  userId: string,
  token: string,
  hasRefreshToken: boolean,
): void {
  console.log();
  console.log(chalk.green("  已登录 ARTI CLI"));
  if (email) console.log(`  邮箱      ${chalk.white(email)}`);
  if (userId) console.log(`  用户 ID   ${chalk.white(userId)}`);
  console.log(`  Token     ${chalk.gray(maskToken(token))}`);
  if (hasRefreshToken) {
    console.log(chalk.gray("  会话      已启用自动续期"));
  }
  console.log();
}
