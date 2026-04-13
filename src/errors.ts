/**
 * 统一错误处理 — 将底层错误转为友好提示
 */
import chalk from "chalk";

interface ErrorInfo {
  title: string;
  detail: string;
  suggestion: string;
}

export function classifyError(err: unknown): ErrorInfo {
  if (err instanceof TypeError && String(err.message).includes("fetch")) {
    return {
      title: "网络请求失败",
      detail: String(err.message),
      suggestion: "请检查网络连接是否正常，或是否需要配置代理",
    };
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    // DNS / 网络层
    if (msg.includes("getaddrinfo") || msg.includes("enotfound")) {
      return {
        title: "DNS 解析失败",
        detail: `无法解析服务器地址`,
        suggestion: "请检查网络连接或 DNS 设置，如使用代理请确认代理配置正确",
      };
    }
    if (msg.includes("econnrefused")) {
      return {
        title: "连接被拒绝",
        detail: "服务器拒绝连接",
        suggestion: "服务可能未启动或端口不正确，可尝试 arti config get api.baseUrl 确认地址",
      };
    }
    if (msg.includes("econnreset") || msg.includes("socket hang up")) {
      return {
        title: "连接中断",
        detail: "与服务器的连接意外断开",
        suggestion: "可能是网络不稳定，请稍后重试",
      };
    }
    if (msg.includes("timeout") || msg.includes("abort")) {
      return {
        title: "请求超时",
        detail: "服务器响应时间过长",
        suggestion: "可尝试 arti config set api.timeout 60000 增大超时时间",
      };
    }

    // HTTP 状态码（来自 ApiError）
    if ("status" in err) {
      const status = (err as { status: number }).status;
      if (status === 401 || status === 403) {
        return {
          title: `认证失败 (${status})`,
          detail: err.message,
          suggestion: "接口需要认证，请确认 API 配置是否正确",
        };
      }
      if (status === 429) {
        return {
          title: "请求过于频繁 (429)",
          detail: err.message,
          suggestion: "请稍等几秒后重试",
        };
      }
      if (status >= 500) {
        return {
          title: `服务端错误 (${status})`,
          detail: err.message,
          suggestion: "后端服务异常，请稍后重试。如持续出现请反馈",
        };
      }
    }
  }

  // 兜底
  return {
    title: "未知错误",
    detail: err instanceof Error ? err.message : String(err),
    suggestion: "请检查网络和配置，如问题持续请反馈",
  };
}

export function printError(err: unknown): void {
  const info = classifyError(err);
  console.error("");
  console.error(chalk.red.bold(`  x ${info.title}`));
  console.error(chalk.gray(`    ${info.detail}`));
  console.error(chalk.yellow(`    -> ${info.suggestion}`));
  console.error("");
}
