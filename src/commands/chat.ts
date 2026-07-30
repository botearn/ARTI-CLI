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
import { TerminalAnswerRenderer } from "../core/terminal-answer-renderer.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRuntimeOptions {
  history?: ChatMessage[];
  conversation?: ConversationContext;
  onUsage?: (usage: ChatUsageEvent) => void;
  signal?: AbortSignal;
}

export interface ChatCommandOptions extends ChatRuntimeOptions {
  raw?: boolean;
}

interface ActiveChatLoading {
  stop: () => void;
  fail: () => void;
}

function canRenderInteractiveStatus(jsonMode: boolean): boolean {
  const stdoutColumns = process.stdout.columns;
  const stderrColumns = process.stderr.columns;
  return !jsonMode
    && Boolean(process.stdout.isTTY && process.stderr.isTTY)
    && (stdoutColumns === undefined || stdoutColumns > 0)
    && (stderrColumns === undefined || stderrColumns > 0);
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
    discardStdin: false,
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
    canCancel: Boolean(options?.signal),
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

function buildInterruptedAnswer(answer: string): string {
  return `${answer.trimEnd()}\n\n[回答中断]`;
}

function printInterruptedHint(cancelled: boolean): void {
  console.log(chalk.gray(
    cancelled
      ? "  已取消当前回答，可继续输入下一条问题。"
      : "  回答中途断开，已生成的部分已保存在当前 Session。",
  ));
}

function printPaidResearchSuggestion(
  capability: "full" | "deep",
  symbol: string,
): void {
  const label = capability === "full" ? "全景研报" : "深度研报";
  const command = `arti ${capability} ${symbol}`;
  output({
    status: "confirmation_required",
    capability,
    symbol,
    command,
  }, () => {
    console.log(chalk.yellow(`  ${label}会创建后端任务，并可能按账号套餐扣费。`));
    console.log(chalk.cyan(`  请显式确认后运行：${command}`));
  });
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

function buildChatJsonPayload(
  answer: string,
  usage?: ChatUsageEvent,
): Record<string, unknown> {
  if (!usage) return { answer };
  return {
    answer,
    requestId: usage.requestId,
    ...(usage.model ? { model: usage.model } : {}),
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ...(usage.cachedInputTokens !== undefined
        ? { cachedInputTokens: usage.cachedInputTokens }
        : {}),
      ...(usage.reasoningTokens !== undefined
        ? { reasoningTokens: usage.reasoningTokens }
        : {}),
      totalTokens: usage.totalTokens,
      ...(usage.contextWindow !== undefined
        ? { contextWindow: usage.contextWindow }
        : {}),
    },
  };
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
  const answerRenderer = interactive
    ? new TerminalAnswerRenderer()
    : undefined;
  let bodyStarted = false;
  let firstDeltaAcknowledged = false;
  let lastUsage: ChatUsageEvent | undefined;
  let assistantText = "";
  try {
    // 计费由服务端权威处理（RFC-2026-0007），CLI 不再本地扣费/展示消耗
    track("chat", []);
    const messages = [...(options?.history ?? []), { role: "user" as const, content: text }];
    const streamOptions = {
      ...(options?.conversation ? { conversation: options.conversation } : {}),
      clientCapabilities: { usageEvents: true },
      onUsage: (usage: ChatUsageEvent) => {
        lastUsage = usage;
        options?.onUsage?.(usage);
      },
      ...(options?.signal ? { signal: options.signal } : {}),
    };
    const stream = streamChat(messages, streamOptions);
    for await (const delta of stream) {
      if (!jsonMode && delta) {
        if (!bodyStarted) {
          loading?.stop();
          process.stdout.write(interactive ? "\n" : "\n  ");
          bodyStarted = true;
        }
        if (answerRenderer) {
          answerRenderer.write(delta);
          if (!answerRenderer.hasVisibleOutput && !firstDeltaAcknowledged) {
            process.stdout.write(chalk.dim("  已收到首段回答，继续生成中…\n\n"));
            firstDeltaAcknowledged = true;
          }
        } else {
          process.stdout.write(delta);
        }
      }
      assistantText += delta;
    }
    loading?.stop();
    answerRenderer?.end();
    if (!jsonMode && bodyStarted && !interactive) process.stdout.write("\n");

    const result = assistantText || undefined;
    if (jsonMode) {
      output(buildChatJsonPayload(result ?? "", lastUsage), () => {});
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
    const cancelled = Boolean(options?.signal?.aborted);
    if (!bodyStarted) {
      if (cancelled) loading?.stop();
      else loading?.fail();
    }
    answerRenderer?.end();
    if (!jsonMode && bodyStarted && !interactive) process.stdout.write("\n");

    const partialAnswer = assistantText
      ? buildInterruptedAnswer(assistantText)
      : undefined;
    if (partialAnswer) {
      if (jsonMode) {
        output({
          answer: partialAnswer,
          status: "incomplete",
          cancelled,
        }, () => {});
      } else {
        printInterruptedHint(cancelled);
      }
    }

    if (cancelled) {
      if (!partialAnswer && !jsonMode) printInterruptedHint(true);
      return partialAnswer;
    }

    process.exitCode = 1;
    if (err instanceof InsufficientCreditsError) {
      console.log(chalk.red(`\n  ✗ ${err.message}\n`));
      if (!partialAnswer) printStoredQuestionHint(interactive, options);
      return partialAnswer;
    }
    printError(err);
    if (!partialAnswer) printStoredQuestionHint(interactive, options);
    return partialAnswer;
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
      signal: options.signal,
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
          signal: options?.signal,
        });
      },
      onPaidResearchSuggested: async (capability, symbol) => {
        printPaidResearchSuggestion(capability, symbol);
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
