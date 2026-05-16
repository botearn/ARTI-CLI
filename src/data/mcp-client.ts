import { loadConfig } from "../config.js";
import type { HistoricalBar, QuoteData, TechnicalData } from "../openbb.js";

type McpCallResult = {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

class BackendMcpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendMcpError";
  }
}

type McpClient = {
  connect: (transport: unknown) => Promise<void>;
  request: (request: Record<string, unknown>, schema: unknown) => Promise<McpCallResult>;
};

let clientPromise: Promise<McpClient> | null = null;
let cachedUrl: string | null = null;

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

  if (!url) {
    throw new BackendMcpError("Backend MCP URL 未配置");
  }

  if (clientPromise && cachedUrl === url) {
    return clientPromise;
  }

  clientPromise = (async () => {
    const { Client, StreamableHTTPClientTransport } = await loadSdk();
    const client = new Client(
      { name: "arti-cli", version: "0.3.0" },
      { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(url),
      { requestInit: { headers: { Accept: "application/json, text/event-stream" } } },
    );
    await client.connect(transport);
    return client;
  })();
  cachedUrl = url;

  try {
    return await clientPromise;
  } catch (err) {
    clientPromise = null;
    cachedUrl = null;
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
  const client = await getClient();
  const result = await client.request(
    { method: "tools/call", params: { name, arguments: args } },
    CallToolResultSchema,
  ) as McpCallResult;
  return parseToolPayload(result);
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
  return true;
}

export async function fetchQuoteFromBackendMcp(symbol: string): Promise<QuoteData> {
  const payload = await callTool("get_realtime_quote", { symbol });
  return mapMcpQuoteToQuoteData(symbol, payload);
}

export async function fetchTechnicalFromBackendMcp(symbol: string): Promise<TechnicalData> {
  const payload = await callTool("get_technical_indicators", { symbol });
  return mapMcpTechnicalToTechnicalData(symbol, payload);
}

export async function fetchDailyBarsFromBackendMcp(symbol: string, days = 60): Promise<HistoricalBar[]> {
  const payload = await callTool("get_daily_bars", { symbol, days, adjust: "qfq" });
  return mapMcpBars(payload);
}
