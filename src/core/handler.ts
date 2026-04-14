/**
 * 统一命令处理器 — 消除各命令重复的 spinner + try-catch 模式
 * 参考 CLI-Anything 的 @handle_error 装饰器思路
 */
import ora, { type Ora } from "ora";
import { printError } from "../errors.js";
import { output } from "../output.js";

export interface CommandContext {
  spinner: Ora;
}

/**
 * 包装一个命令的执行逻辑：
 * 1. 显示 spinner
 * 2. 执行 fn
 * 3. 成功时 stop spinner
 * 4. 失败时 fail spinner + printError
 */
export async function handleCommand<T>(
  label: string,
  fn: (ctx: CommandContext) => Promise<T>,
): Promise<T | undefined> {
  const spinner = ora(label).start();
  try {
    const result = await fn({ spinner });
    spinner.stop();
    return result;
  } catch (err) {
    spinner.fail(label.replace("...", "失败"));
    printError(err);
    return undefined;
  }
}

/**
 * handleCommand + output 一步到位
 * fn 返回 { data, render }，自动处理 JSON/终端切换
 */
export async function handleCommandWithOutput<T>(
  label: string,
  fn: (ctx: CommandContext) => Promise<{ data: T; render: () => void }>,
): Promise<void> {
  const result = await handleCommand(label, fn);
  if (result) {
    output(result.data, result.render);
  }
}
