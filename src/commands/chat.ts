/**
 * chat 命令 — AI 投研对话（产品 chat 函数，SSE 流式）
 * 用法：arti chat 美股今天怎么样
 */
import chalk from "chalk";
import { streamChat } from "../api.js";
import { InsufficientCreditsError } from "../billing.js";
import { printError } from "../errors.js";
import { track } from "../tracker.js";
import { dispatchNaturalText } from "../core/natural-dispatch.js";
import { isJsonMode, output } from "../output.js";
import type {
  ChatUsageEvent,
  ConversationContext,
} from "../core/conversation-types.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRuntimeOptions {
  history?: ChatMessage[];
  conversation?: ConversationContext;
  onUsage?: (usage: ChatUsageEvent) => void;
}

export interface ChatCommandOptions extends ChatRuntimeOptions {
  raw?: boolean;
}

export async function rawChatCommand(
  message: string,
  options?: ChatRuntimeOptions,
): Promise<string | undefined> {
  const text = message?.trim();
  if (!text) {
    console.log(chalk.red("请输入问题，例如：arti chat 美股今天怎么样"));
    return;
  }

  const jsonMode = isJsonMode();
  try {
    // 计费由服务端权威处理（RFC-2026-0007），CLI 不再本地扣费/展示消耗
    track("chat", []);
    let assistantText = "";
    // JSON 模式下不流式打印（避免污染 stdout），收集全文后由末尾统一输出
    if (!jsonMode) process.stdout.write("\n  ");
    const messages = [...(options?.history ?? []), { role: "user" as const, content: text }];
    const streamOptions = options?.conversation || options?.onUsage
      ? {
          ...(options.conversation ? { conversation: options.conversation } : {}),
          clientCapabilities: { usageEvents: true },
          ...(options.onUsage ? { onUsage: options.onUsage } : {}),
        }
      : undefined;
    const stream = streamOptions
      ? streamChat(messages, streamOptions)
      : streamChat(messages);
    for await (const delta of stream) {
      if (!jsonMode) process.stdout.write(delta);
      assistantText += delta;
    }
    if (!jsonMode) process.stdout.write("\n");

    const result = assistantText || undefined;
    if (jsonMode) {
      output({ answer: result ?? "" }, () => {});
    }
    return result;
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
    return rawChatCommand(text, {
      history: options.history,
      conversation: options.conversation,
      onUsage: options.onUsage,
    });
  }

  try {
    let assistantText: string | undefined;
    await dispatchNaturalText(text, {
      onGeneralChat: async (chatText) => {
        assistantText = await rawChatCommand(chatText, {
          history: options?.history,
          conversation: options?.conversation,
          onUsage: options?.onUsage,
        });
      },
    });
    return assistantText;
  } catch (err) {
    printError(err);
    process.exitCode = 1;
  }
}
