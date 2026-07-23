import { loadConfig } from "../config.js";
import type { HistoricalBar, QuoteData, TechnicalData } from "./types.js";

type McpCallResult = {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export const BACKEND_MCP_TOOL_CONTRACTS = {
  get_realtime_quote: {
    args: ["symbol", "force_refresh"],
    requiredFields: ["symbol", "price"],
  },
  get_daily_bars: {
    args: ["symbol", "days", "adjust", "force_refresh"],
    requiredFields: ["bars"],
  },
  get_technical_indicators: {
    args: ["symbol", "force_refresh"],
    requiredFields: ["latest_close", "ma5", "ma10", "ma20", "ma60"],
  },
  get_stock_info: {
    args: ["symbol", "force_refresh"],
    requiredFields: ["symbol"],
  },
  get_company_profile: {
    args: ["symbol", "force_refresh"],
    requiredFields: ["symbol"],
  },
  get_financial_report: {
    args: ["symbol", "report_type", "force_refresh"],
    requiredFields: ["reports"],
  },
  get_dividend_history: {
    args: ["symbol", "force_refresh"],
    requiredFields: ["symbol"],
  },
  get_macro_indicators: {
    args: ["country", "frequency", "days", "force_refresh"],
    requiredFields: ["data"],
  },
  get_stock_fund_flow: {
    args: ["symbol", "force_refresh"],
    requiredFields: ["symbol"],
  },
  load_stock_context: {
    args: ["symbol", "include", "force_refresh"],
    requiredFields: ["symbol"],
  },
} as const;

class BackendMcpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendMcpError";
  }
}

type McpClient = {
  // 结构类型只覆盖本项目用到的最小面；method 语法走双变参数检查，与 SDK Client 结构兼容
  // connect 的 options 声明为 never：调用方从不传第二个参数
  connect(transport: any, options?: never): Promise<void>;
  request(request: any, schema: any, options?: any): Promise<McpCallResult>;
  close?(): Promise<void>;
};

let clientPromise: Promise<McpClient> | null = null;
let activeClient: McpClient | null = null;
let cachedUrl: string | null = null;
let cachedToken: string | null = null;
let failureCount = 0;
let circuitOpenUntil = 0;

async function loadSdk() {
  const [{ Client }, { StreamableHTTPClientTransport }, { CallToolResultSchema }] = await Promise.all([
    import("@modelcontextprotocol/sdk/client/index.js"),
    import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
    import("@modelcontextprotocol/sdk/types.js"),
  ]);

  return { Client, StreamableHTTPClientTransport, CallToolResultSchema };
}

async function getClient(): Promise<McpClient> {
  const config = loadConfig();
  const url = config.backend.mcpUrl.trim();
  const token = config.auth.token.trim();

  if (!url) {
    throw new BackendMcpError("Backend MCP URL 未配置");
  }

  if (clientPromise && cachedUrl === url && cachedToken === token) {
    return clientPromise;
  }

  // M-C7：token/url 变化触发重建时，先关闭旧连接，避免泄漏。不阻塞新连接建立。
  const staleClient = activeClient;
  activeClient = null;
  if (staleClient?.close) {
    void Promise.resolve(staleClient.close()).catch(() => { /* 旧连接关闭失败忽略 */ });
  }

  const promise = (async () => {
    const { Client, StreamableHTTPClientTransport } = await loadSdk();
    const client = new Client(
      { name: "artifin-cli", version: "0.4.0" },
      { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(url),
      {
        requestInit: {
          headers: {
            Accept: "application/json, text/event-stream",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      },
    );
    await client.connect(transport);
    activeClient = client;
    return client;
  })();
  clientPromise = promise;
  cachedUrl = url;
  cachedToken = token;

  try {
    return await promise;
  } catch (err) {
    // 仅清理本次创建的缓存，避免清掉并发 getClient 刚写入的新连接
    if (clientPromise === promise) {
      clientPromise = null;
      activeClient = null;
      cachedUrl = null;
      cachedToken = null;
    }
    throw err;
  }
}

function parseToolPayload(result: McpCallResult): Record<string, unknown> {
  if (result.isError) {
    const text = result.content
      .filter((item) => item.type === "text" && item.text)
      .map((item) => item.text)
      .join("\n");
    throw new BackendMcpError(text || "Backend MCP tool 调用失败");
  }

  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    return result.structuredContent;
  }

  for (const item of result.content) {
    if (item.type === "text" && item.text) {
      try {
        return JSON.parse(item.text) as Record<string, unknown>;
      } catch {
        // keep scanning; some servers may mix text blocks
      }
    }
  }

  throw new BackendMcpError("Backend MCP 返回内容无法解析为 JSON");
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { CallToolResultSchema } = await loadSdk();
  const timeout = loadConfig().backend.mcpTimeout;
  const client = await getClient();
  const result = await client.request(
    { method: "tools/call", params: { name, arguments: args } },
    CallToolResultSchema,
    { timeout },
  ) as McpCallResult;
  return parseToolPayload(result);
}

async function callToolWithCircuit(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!canUseBackendMcp()) {
    throw new BackendMcpError("Backend MCP 当前不可用");
  }

  try {
    const payload = await callTool(name, args);
    failureCount = 0;
    circuitOpenUntil = 0;
    return payload;
  } catch (err) {
    failureCount += 1;
    if (failureCount >= 3) {
      circuitOpenUntil = Date.now() + loadConfig().backend.mcpFailureCooldown;
    }
    throw err;
  }
}

export async function callBackendMcpTool(
  name: keyof typeof BACKEND_MCP_TOOL_CONTRACTS,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return callToolWithCircuit(name, args);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapMcpQuoteToQuoteData(symbol: string, payload: Record<string, unknown>): QuoteData {
  const price = asNumber(payload.price) ?? 0;
  const prevClose = asNumber(payload.prev_close) ?? 0;

  return {
    symbol: String(payload.symbol ?? symbol).toUpperCase(),
    name: String(payload.name ?? symbol),
    last_price: price,
    open: asNumber(payload.open) ?? 0,
    high: asNumber(payload.high) ?? 0,
    low: asNumber(payload.low) ?? 0,
    prev_close: prevClose,
    volume: asNumber(payload.volume) ?? 0,
    change: asNumber(payload.change) ?? (price - prevClose),
    change_percent: asNumber(payload.change_pct) ?? 0,
    year_high: 0,
    year_low: 0,
    ma_50d: 0,
    ma_200d: 0,
    volume_average: 0,
    currency: null,
  };
}

function mapMcpTechnicalToTechnicalData(symbol: string, payload: Record<string, unknown>): TechnicalData {
  const macd = payload.macd as Record<string, unknown> | undefined;
  const boll = payload.boll as Record<string, unknown> | undefined;
  const kdj = payload.kdj as Record<string, unknown> | undefined;

  const price = asNumber(payload.latest_close) ?? 0;

  return {
    symbol: String(payload.symbol ?? symbol).toUpperCase(),
    price,
    change: 0,
    change_percent: 0,
    ma: {
      MA5: asNumber(payload.ma5) ?? 0,
      MA10: asNumber(payload.ma10) ?? 0,
      MA20: asNumber(payload.ma20) ?? 0,
      MA60: asNumber(payload.ma60) ?? 0,
    },
    rsi: asNumber(payload.rsi14),
    macd: macd ? {
      MACD: asNumber(macd.macd) ?? 0,
      signal: asNumber(macd.dea) ?? 0,
      histogram: asNumber(macd.dif) ?? 0,
    } : null,
    bbands: boll ? {
      upper: asNumber(boll.upper) ?? 0,
      middle: asNumber(boll.mid) ?? 0,
      lower: asNumber(boll.lower) ?? 0,
    } : null,
    atr: asNumber(payload.atr14),
    adx: null,
    obv: null,
    stochastic: kdj ? {
      K: asNumber(kdj.k) ?? 0,
      D: asNumber(kdj.d) ?? 0,
    } : null,
    recent: [],
    signals: [],
    overall_signal: "中性",
  };
}

function mapMcpBars(payload: Record<string, unknown>): HistoricalBar[] {
  const bars = Array.isArray(payload.bars) ? payload.bars : [];
  return bars
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const date = typeof item.date === "string" ? item.date : null;
      const open = asNumber(item.open);
      const high = asNumber(item.high);
      const low = asNumber(item.low);
      const close = asNumber(item.close);
      const volume = asNumber(item.volume);

      if (!date || open === null || high === null || low === null || close === null || volume === null) {
        return null;
      }

      return { date, open, high, low, close, volume };
    })
    .filter((row): row is HistoricalBar => row !== null);
}

export function canUseBackendMcp(symbol?: string): boolean {
  const config = loadConfig();
  if (!config.backend.mcpEnabled) return false;
  if (!config.backend.mcpUrl.trim()) return false;
  if (circuitOpenUntil > Date.now()) return false;
  return true;
}

export function getBackendMcpStatus(): {
  enabled: boolean;
  url: string;
  timeout: number;
  failureCount: number;
  circuitOpenUntil: number | null;
  usable: boolean;
} {
  const config = loadConfig();
  return {
    enabled: config.backend.mcpEnabled,
    url: config.backend.mcpUrl,
    timeout: config.backend.mcpTimeout,
    failureCount,
    circuitOpenUntil: circuitOpenUntil > Date.now() ? circuitOpenUntil : null,
    usable: canUseBackendMcp(),
  };
}

export async function fetchQuoteFromBackendMcp(symbol: string, forceRefresh = false): Promise<QuoteData> {
  const payload = await callToolWithCircuit("get_realtime_quote", { symbol, force_refresh: forceRefresh });
  return mapMcpQuoteToQuoteData(symbol, payload);
}

export async function fetchTechnicalFromBackendMcp(symbol: string, forceRefresh = false): Promise<TechnicalData> {
  const payload = await callToolWithCircuit("get_technical_indicators", { symbol, force_refresh: forceRefresh });
  return mapMcpTechnicalToTechnicalData(symbol, payload);
}

export async function fetchDailyBarsFromBackendMcp(symbol: string, days = 60, forceRefresh = false): Promise<HistoricalBar[]> {
  const payload = await callToolWithCircuit("get_daily_bars", { symbol, days, adjust: "qfq", force_refresh: forceRefresh });
  return mapMcpBars(payload);
}

export async function fetchStockInfoFromBackendMcp(symbol: string, forceRefresh = false): Promise<Record<string, unknown>> {
  return callBackendMcpTool("get_stock_info", { symbol, force_refresh: forceRefresh });
}

export async function fetchCompanyProfileFromBackendMcp(symbol: string, forceRefresh = false): Promise<Record<string, unknown>> {
  return callBackendMcpTool("get_company_profile", { symbol, force_refresh: forceRefresh });
}

export async function fetchFinancialReportFromBackendMcp(
  symbol: string,
  reportType: "income" | "balance" | "cashflow",
  forceRefresh = false,
): Promise<Record<string, unknown>> {
  return callBackendMcpTool("get_financial_report", {
    symbol,
    report_type: reportType,
    force_refresh: forceRefresh,
  });
}

export async function fetchDividendHistoryFromBackendMcp(symbol: string, forceRefresh = false): Promise<Record<string, unknown>> {
  return callBackendMcpTool("get_dividend_history", { symbol, force_refresh: forceRefresh });
}

export async function fetchMacroIndicatorsFromBackendMcp(
  country: "us" | "cn" = "us",
  options?: { frequency?: string; days?: number; forceRefresh?: boolean },
): Promise<Record<string, unknown>> {
  return callBackendMcpTool("get_macro_indicators", {
    country,
    frequency: options?.frequency,
    days: options?.days ?? 90,
    force_refresh: options?.forceRefresh ?? false,
  });
}

export async function fetchStockFundFlowFromBackendMcp(symbol: string, forceRefresh = false): Promise<Record<string, unknown>> {
  return callBackendMcpTool("get_stock_fund_flow", { symbol, force_refresh: forceRefresh });
}

export async function fetchStockContextFromBackendMcp(
  symbol: string,
  include?: string[],
  forceRefresh = false,
): Promise<Record<string, unknown>> {
  return callBackendMcpTool("load_stock_context", { symbol, include, force_refresh: forceRefresh });
}

export async function probeBackendMcp(symbol = "AAPL", forceRefresh = false): Promise<{
  quote: QuoteData;
  bars: HistoricalBar[];
  latencyMs: number;
}> {
  const started = Date.now();
  const quote = await fetchQuoteFromBackendMcp(symbol, forceRefresh);
  const bars = await fetchDailyBarsFromBackendMcp(symbol, 5, forceRefresh);
  return { quote, bars, latencyMs: Date.now() - started };
}

export async function shutdownBackendMcp(): Promise<void> {
  const client = activeClient;
  activeClient = null;
  clientPromise = null;
  cachedUrl = null;
  cachedToken = null;
  failureCount = 0;
  circuitOpenUntil = 0;
  if (client?.close) {
    await client.close();
  }
}
