import chalk from "chalk";
import { output } from "../output.js";
import { getBackendMcpStatus, probeBackendMcp } from "../data/mcp-client.js";
import { loadConfig } from "../config.js";

export async function doctorCommand(target?: string, options?: { symbol?: string; refresh?: boolean }): Promise<void> {
  const subject = target || "mcp";
  if (subject !== "mcp") {
    console.log(chalk.red(`暂不支持 doctor ${subject}，目前可用: doctor mcp`));
    return;
  }

  const config = loadConfig();
  const status = getBackendMcpStatus();
  const symbol = options?.symbol || "AAPL";
  const result: {
    target: "mcp";
    config: ReturnType<typeof getBackendMcpStatus> & { hasAuthToken: boolean };
    probe?: {
      symbol: string;
      quotePrice: number;
      bars: number;
      latencyMs: number;
    };
    error?: string;
  } = {
    target: "mcp",
    config: {
      ...status,
      hasAuthToken: Boolean(config.auth.token.trim()),
    },
  };

  if (status.usable) {
    try {
      const probe = await probeBackendMcp(symbol, options?.refresh);
      result.probe = {
        symbol: probe.quote.symbol,
        quotePrice: probe.quote.last_price,
        bars: probe.bars.length,
        latencyMs: probe.latencyMs,
      };
    } catch (err) {
      result.error = formatError(err);
    }
  }

  output(result, () => {
    console.log(chalk.cyan("\n  Backend MCP Doctor\n"));
    console.log(`  enabled:       ${status.enabled ? chalk.green("true") : chalk.red("false")}`);
    console.log(`  usable:        ${status.usable ? chalk.green("true") : chalk.red("false")}`);
    console.log(`  url:           ${chalk.white(status.url || "(empty)")}`);
    console.log(`  timeout:       ${chalk.white(`${status.timeout}ms`)}`);
    console.log(`  auth token:    ${result.config.hasAuthToken ? chalk.green("present") : chalk.yellow("missing")}`);
    console.log(`  failures:      ${chalk.white(String(status.failureCount))}`);
    if (status.circuitOpenUntil) {
      console.log(`  circuit:       ${chalk.yellow(`open until ${new Date(status.circuitOpenUntil).toISOString()}`)}`);
    }

    if (result.probe) {
      console.log(`\n  probe symbol:  ${chalk.white(result.probe.symbol)}`);
      console.log(`  quote price:   ${chalk.white(String(result.probe.quotePrice))}`);
      console.log(`  daily bars:    ${chalk.white(String(result.probe.bars))}`);
      console.log(`  latency:       ${chalk.white(`${result.probe.latencyMs}ms`)}`);
    }
    if (result.error) {
      console.log(`\n  error:         ${chalk.red(result.error)}`);
    }
    console.log("");
  });
}

function formatError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message) {
    return `${err.message}: ${cause.message}`;
  }
  return err.message;
}
