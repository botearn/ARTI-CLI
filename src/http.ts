/**
 * 带超时的 fetch 封装。
 *
 * auth / billing / browser-login 的裸 fetch 在后端不响应时会永久挂起
 * （M-S3）。统一用 AbortController 加超时，超时抛出可识别的错误。
 */

const DEFAULT_TIMEOUT_MS = 30_000;

export class RequestTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`请求超时（${Math.round(timeoutMs / 1000)}s）: ${url}`);
    this.name = "RequestTimeoutError";
  }
}

/** 与原生 fetch 同签名，额外支持 timeoutMs（默认 30s）。超时抛 RequestTimeoutError。 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 保留调用方自带的 abort 信号
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted && !callerSignal?.aborted) {
      throw new RequestTimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
