import chalk from "chalk";
import ora from "ora";
import {
  loginWithBrowser,
  startLoginSession,
  pollLoginSession,
  saveApprovedSession,
  savePendingLogin,
  loadPendingLogin,
  clearPendingLogin,
} from "../browser-login.js";
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
  start?: boolean;
  poll?: boolean;
  session?: string;
  pollToken?: string;
}

/** device flow 第一步：取授权链接，落盘待确认会话，立即返回（不开浏览器、不阻塞）。供 agent 用 */
async function loginStart(): Promise<void> {
  const started = await startLoginSession();
  savePendingLogin({
    session_id: started.session_id,
    poll_token: started.poll_token,
    login_url: started.login_url,
    code: started.code,
    expires_at: started.expires_at,
    poll_interval_ms: started.poll_interval_ms,
  });
  output(
    {
      status: "authorize_pending",
      login_url: started.login_url,
      user_code: started.code,
      session_id: started.session_id,
      expires_at: started.expires_at ?? null,
      poll_interval_ms: started.poll_interval_ms ?? 2000,
    },
    () => {
      console.log();
      console.log(chalk.bold.cyan("📱 在浏览器打开以授权（或把链接交给用户点击）："));
      console.log(chalk.blue.underline(`  ${started.login_url}`));
      console.log(chalk.gray("  验证码: ") + chalk.bgWhite.bold.black(` ${started.code} `));
      console.log(chalk.gray("  授权后运行: ") + chalk.cyan("arti login --poll"));
      console.log();
    },
  );
}

/** device flow 第二步：单次轮询，返回当前状态（pending/authorized/expired）。agent 循环调用直到 authorized */
async function loginPoll(options: LoginOptions): Promise<void> {
  const pending = options.session && options.pollToken
    ? { session_id: options.session, poll_token: options.pollToken, poll_interval_ms: 2000 }
    : loadPendingLogin();
  if (!pending) {
    output(
      { status: "no_pending", message: "无进行中的登录会话，请先运行 arti login --start" },
      () => console.log(chalk.yellow("  无进行中的登录会话，请先运行 arti login --start")),
    );
    return;
  }

  const polled = await pollLoginSession(pending.session_id, pending.poll_token);

  if (polled.status === "approved" && polled.session?.access_token) {
    const auth = saveApprovedSession(polled.session);
    clearPendingLogin();
    output(
      { status: "authorized", email: auth.email || null, userId: auth.userId || null },
      () => printLoginSuccess(auth.email, auth.userId, auth.token, Boolean(auth.refreshToken)),
    );
    return;
  }

  if (polled.status === "expired" || polled.status === "consumed") {
    clearPendingLogin();
    output(
      { status: polled.status, message: "登录会话已失效，请重新运行 arti login --start" },
      () => console.log(chalk.red(`  登录会话已${polled.status === "expired" ? "过期" : "失效"}，请重新运行 arti login --start`)),
    );
    return;
  }

  // 仍在等待用户确认
  output(
    { status: "pending", poll_interval_ms: polled.poll_after_ms || pending.poll_interval_ms || 2000 },
    () => console.log(chalk.gray("  等待用户在浏览器确认中… 授权后再次运行 arti login --poll")),
  );
}

export async function loginCommand(options?: LoginOptions): Promise<void> {
  // device flow 两步式（agent 用）：先 --start 取链接，再 --poll 等确认
  if (options?.start) { await loginStart(); return; }
  if (options?.poll) { await loginPoll(options); return; }

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
      // headless（agent / 非 TTY）：不自动开浏览器，只打印链接后阻塞等待确认
      const headless = !process.stdout.isTTY || process.env.ARTI_HEADLESS === "1";
      const spinner = ora({ text: "等待浏览器确认…", indent: 2 });
      const auth = await loginWithBrowser({
        webAuthUrl,
        onOpenUrl: headless ? () => { /* headless：不自动打开浏览器 */ } : undefined,
        onLoginUrl: (loginUrl) => {
          console.log();
          console.log(chalk.bold.cyan("📱 步骤 1：打开浏览器"));
          console.log(chalk.gray("  如未自动弹出，请手动打开："));
          console.log(chalk.blue.underline(`  ${loginUrl}`));
          console.log();
        },
        onCode: (code) => {
          console.log(chalk.bold.cyan("✓ 步骤 2：核对验证码"));
          console.log(chalk.bgWhite.bold.black(`    ${code}    `));
          console.log(chalk.gray("  请在浏览器页面中核对上述验证码一致后点击确认"));
          console.log();
          spinner.start();
        },
        onApproved: () => {
          spinner.succeed(chalk.green("✓ 已确认"));
        },
      });
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
    console.log();
    console.log(chalk.red("✗ 登录失败"));
    console.log(chalk.gray(`  原因: ${message}`));
    console.log();
    if (message.includes("超时")) {
      console.log(chalk.yellow("  💡 提示:"));
      console.log(chalk.gray("  • 确认浏览器已打开正确的登录页面"));
      console.log(chalk.gray("  • 检查网络连接是否正常"));
      console.log(chalk.gray("  • 重新登录（交互终端 /login；外层 arti login）"));
    } else if (message.includes("过期")) {
      console.log(chalk.yellow("  💡 提示: 请重新登录（交互终端 /login；外层 arti login）"));
    }
    console.log();
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

/** 打印当前登录 token，方便取出后通过环境变量喂给 agent 做非交互鉴权 */
export function tokenCommand(): void {
  const auth = getAuthState();
  if (!isLoggedIn(auth)) {
    console.log(chalk.yellow("  当前未登录，先运行 arti login"));
    return;
  }
  output(
    {
      token: auth.token || null,
      refreshToken: auth.refreshToken || null,
      expiresAt: auth.expiresAt || null,
    },
    () => {
      console.log(chalk.gray("  # 设置到 agent 环境即可非交互鉴权（token 等同密码，勿外泄）"));
      console.log(`  export ARTI_AUTH_TOKEN=${auth.token}`);
      if (auth.refreshToken) console.log(`  export ARTI_AUTH_REFRESH_TOKEN=${auth.refreshToken}`);
      if (auth.expiresAt) console.log(`  export ARTI_AUTH_EXPIRES_AT=${auth.expiresAt}`);
    },
  );
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
