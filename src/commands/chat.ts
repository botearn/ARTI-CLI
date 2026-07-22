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

  try {
    const billed = await withBilling("chat", async () => {
      track("chat", []);
      let assistantText = "";
      process.stdout.write("\n  ");
      const messages = [...(options?.history ?? []), { role: "user" as const, content: text }];
      for await (const delta of streamChat(messages)) {
        process.stdout.write(delta);
        assistantText += delta;
      }
      process.stdout.write("\n");
      return assistantText || undefined;
    });
    if (!billed) return;
    printDeductResult(billed.deduct);
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
