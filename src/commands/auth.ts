import chalk from "chalk";
import { clearAuthState, getAuthState, isLoggedIn, maskToken, saveAuthState } from "../auth.js";
import { output } from "../output.js";

interface LoginOptions {
  token?: string;
  email?: string;
  userId?: string;
}

export function loginCommand(options?: LoginOptions): void {
  const token = options?.token?.trim() || process.env.ARTI_AUTH_TOKEN?.trim() || "";
  const email = options?.email?.trim() || process.env.ARTI_USER_EMAIL?.trim() || "";
  const userId = options?.userId?.trim() || process.env.ARTI_USER_ID?.trim() || "";

  if (!token) {
    console.log(chalk.red("请提供 access token，例如：arti login --token <token>"));
    console.log(chalk.gray("也可通过环境变量 ARTI_AUTH_TOKEN 注入。"));
    return;
  }

  saveAuthState({ token, email, userId });

  console.log();
  console.log(chalk.green("  已登录 ARTI CLI"));
  if (email) console.log(`  邮箱      ${chalk.white(email)}`);
  if (userId) console.log(`  用户 ID   ${chalk.white(userId)}`);
  console.log(`  Token     ${chalk.gray(maskToken(token))}`);
  console.log();
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

export function whoamiCommand(): void {
  const auth = getAuthState();

  output(
    {
      loggedIn: isLoggedIn(auth),
      email: auth.email || null,
      userId: auth.userId || null,
      tokenMasked: auth.token ? maskToken(auth.token) : null,
    },
    () => {
      console.log();
      console.log(chalk.bold.white("  ARTI Account"));
      console.log(chalk.gray("  ─────────────────────────────────────"));
      if (!isLoggedIn(auth)) {
        console.log(chalk.yellow("  未登录"));
        console.log(chalk.gray("  使用 arti login --token <token> 登录"));
        console.log();
        return;
      }
      console.log(chalk.green("  已登录"));
      if (auth.email) console.log(`  邮箱      ${chalk.white(auth.email)}`);
      if (auth.userId) console.log(`  用户 ID   ${chalk.white(auth.userId)}`);
      console.log(`  Token     ${chalk.gray(maskToken(auth.token))}`);
      console.log();
    },
  );
}
