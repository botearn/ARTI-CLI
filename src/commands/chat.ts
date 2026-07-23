/**
 * chat 命令 — AI 投研对话（产品 chat 函数，SSE 流式）
 * 用法：arti chat 美股今天怎么样
 */
import chalk from "chalk";
import { streamChat } from "../api.js";
import { withBilling, printDeductResult, InsufficientCreditsError } from "../billing.js";
import { printError } from "../errors.js";
import { track } from "../tracker.js";
import { dispatchNaturalText } from "../core/natural-dispatch.js";
import { isJsonMode, output } from "../output.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatCommandOptions {
  raw?: boolean;
  history?: ChatMessage[];
}

export async function rawChatCommand(
  message: string,
  options?: Pick<ChatCommandOptions, "history">,
): Promise<string | undefined> {
  const text = message?.trim();
  if (!text) {
    console.log(chalk.red("请输入问题，例如：arti chat 美股今天怎么样"));
    return;
  }

  const jsonMode = isJsonMode();
  try {
    const billed = await withBilling("chat", async () => {
      track("chat", []);
      let assistantText = "";
      // L13：JSON 模式下不流式打印（避免污染 stdout），收集全文后由末尾统一输出
      if (!jsonMode) process.stdout.write("\n  ");
      const messages = [...(options?.history ?? []), { role: "user" as const, content: text }];
      for await (const delta of streamChat(messages)) {
        if (!jsonMode) process.stdout.write(delta);
        assistantText += delta;
      }
      if (!jsonMode) process.stdout.write("\n");
      return assistantText || undefined;
    });
    if (!billed) return;
    if (jsonMode) {
      output({ answer: billed.result ?? "", deduct: billed.deduct }, () => {});
    } else {
      printDeductResult(billed.deduct);
    }
    return billed.result;
  } catch (err) {
    process.exitCode = 1;
    if (err instanceof InsufficientCreditsError) {
      console.log(chalk.red(`\n  ✗ ${err.message}\n`));
      return;
    }
    printError(err);
  }
}

export async function chatCommand(
  message: string,
  options?: ChatCommandOptions,
): Promise<string | undefined> {
  const text = message?.trim();
  if (!text) {
    console.log(chalk.red("请输入问题，例如：arti chat 美股今天怎么样"));
    return;
  }

  if (options?.raw) {
    return rawChatCommand(text, { history: options.history });
  }

  try {
    let assistantText: string | undefined;
    await dispatchNaturalText(text, {
      onGeneralChat: async (chatText) => {
        assistantText = await rawChatCommand(chatText, { history: options?.history });
      },
    });
    return assistantText;
  } catch (err) {
    printError(err);
    process.exitCode = 1;
  }
}
