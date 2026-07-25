/**
 * chat 命令 — AI 投研对话（产品 chat 函数，SSE 流式）
 * 用法：arti chat 美股今天怎么样
 */
import chalk from "chalk";
import ora, { type Ora } from "ora";
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
import {
  buildChatCompletionText,
  buildChatFailureText,
  buildChatLoadingLines,
  buildResearchGuideLines,
  shouldShowResearchGuide,
  type ChatLoadingContext,
} from "../core/chat-display.js";

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

interface ActiveChatLoading {
  stop: () => void;
  fail: () => void;
}

function canRenderInteractiveStatus(jsonMode: boolean): boolean {
  return !jsonMode && Boolean(process.stdout.isTTY && process.stderr.isTTY);
}

function renderChatLoadingText(
  elapsedMs: number,
  context: ChatLoadingContext,
): string {
  const [status, ...details] = buildChatLoadingLines(elapsedMs, context);
  return [
    status,
    ...details.map(line => chalk.dim(line)),
  ].join("\n  ");
}

function startChatLoading(
  startedAt: number,
  context: ChatLoadingContext,
): ActiveChatLoading {
  const spinner = ora({
    text: renderChatLoadingText(0, context),
    indent: 2,
  }).start();
  let active = true;
  const timer = setInterval(() => {
    spinner.text = renderChatLoadingText(Date.now() - startedAt, context);
  }, 1_000);

  const stop = () => {
    if (!active) return;
    active = false;
    clearInterval(timer);
    spinner.stop();
  };

  const fail = () => {
    if (!active) return;
    active = false;
    clearInterval(timer);
    spinner.fail(buildChatFailureText(Date.now() - startedAt));
  };

  return { stop, fail };
}

function buildLoadingContext(options?: ChatRuntimeOptions): ChatLoadingContext {
  return {
    historyMessages: options?.history?.length ?? 0,
    hasSummary: Boolean(options?.conversation?.summary),
    artifactCount: options?.conversation?.artifacts.length ?? 0,
    activeSymbols: [...(options?.conversation?.activeSymbols ?? [])],
  };
}

function printStoredQuestionHint(
  interactive: boolean,
  options?: ChatRuntimeOptions,
): void {
  if (!interactive || !options?.conversation) return;
  console.log(chalk.gray(
    "  本轮问题已保存在当前 Session，但没有收到回答；处理后请重新发送。",
  ));
}

function printResearchGuide(): void {
  const lines = buildResearchGuideLines();
  const context = lines[0];
  const title = lines[1];
  const commands = lines.slice(2, -1);
  const disclosure = lines.at(-1);

  console.log();
  console.log(chalk.gray(`  ${context}`));
  console.log(chalk.bold(`  ${title}`));
  for (const line of commands) {
    console.log(chalk.cyan(`  ${line}`));
  }
  if (disclosure) console.log(chalk.dim(`  ${disclosure}`));
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
  const startedAt = Date.now();
  const interactive = canRenderInteractiveStatus(jsonMode);
  const loading = interactive
    ? startChatLoading(startedAt, buildLoadingContext(options))
    : undefined;
  let bodyStarted = false;
  let lastUsage: ChatUsageEvent | undefined;
  try {
    // 计费由服务端权威处理（RFC-2026-0007），CLI 不再本地扣费/展示消耗
    track("chat", []);
    let assistantText = "";
    const messages = [...(options?.history ?? []), { role: "user" as const, content: text }];
    const streamOptions = options?.conversation || options?.onUsage
      ? {
          ...(options.conversation ? { conversation: options.conversation } : {}),
          clientCapabilities: { usageEvents: true },
          onUsage: (usage: ChatUsageEvent) => {
            lastUsage = usage;
            options?.onUsage?.(usage);
          },
        }
      : undefined;
    const stream = streamOptions
      ? streamChat(messages, streamOptions)
      : streamChat(messages);
    for await (const delta of stream) {
      if (!jsonMode && delta) {
        if (!bodyStarted) {
          loading?.stop();
          process.stdout.write("\n  ");
          bodyStarted = true;
        }
        process.stdout.write(delta);
      }
      assistantText += delta;
    }
    loading?.stop();
    if (!jsonMode && bodyStarted) process.stdout.write("\n");

    const result = assistantText || undefined;
    if (jsonMode) {
      output({ answer: result ?? "" }, () => {});
    } else if (result) {
      console.log(chalk.gray(
        `  ${buildChatCompletionText(Date.now() - startedAt, lastUsage)}`,
      ));
      if (interactive && shouldShowResearchGuide(options ?? {})) {
        printResearchGuide();
      }
    }
    return result;
  } catch (err) {
    if (!bodyStarted) loading?.fail();
    process.exitCode = 1;
    if (err instanceof InsufficientCreditsError) {
      console.log(chalk.red(`\n  ✗ ${err.message}\n`));
      printStoredQuestionHint(interactive, options);
      return;
    }
    printError(err);
    printStoredQuestionHint(interactive, options);
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

  let routingSpinner: Ora | undefined;
  let routingActive = false;
  const stopRouting = () => {
    if (!routingActive) return;
    routingActive = false;
    routingSpinner?.stop();
  };

  try {
    let assistantText: string | undefined;
    const jsonMode = isJsonMode();
    if (canRenderInteractiveStatus(jsonMode)) {
      routingSpinner = ora({ text: "正在识别问题类型…", indent: 2 }).start();
      routingActive = true;
    }
    await dispatchNaturalText(text, {
      onClassified: stopRouting,
      onGeneralChat: async (chatText) => {
        assistantText = await rawChatCommand(chatText, {
          history: options?.history,
          conversation: options?.conversation,
          onUsage: options?.onUsage,
        });
      },
    });
    stopRouting();
    return assistantText;
  } catch (err) {
    if (routingActive) {
      routingActive = false;
      routingSpinner?.fail("问题识别失败");
    }
    printError(err);
    process.exitCode = 1;
  }
}
