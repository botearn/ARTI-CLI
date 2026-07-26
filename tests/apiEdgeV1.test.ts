import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.fn();
const ensureValidAccessToken = vi.fn();

vi.mock("../src/config.js", () => ({ loadConfig }));
vi.mock("../src/auth.js", () => ({ ensureValidAccessToken }));

function sseResponse(frames: string[]): Response {
  return new Response(frames.join(""), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function collect(stream: AsyncGenerator<string>): Promise<string[]> {
  const values: string[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

describe("Edge v1 API", () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({
      api: { baseUrl: "https://edge.example/functions/v1", timeout: 30_000 },
      backend: { enabled: true, url: "https://railway.invalid", timeout: 60_000 },
      auth: { token: "old-token", refreshToken: "refresh-token" },
    });
    ensureValidAccessToken.mockResolvedValue("user-jwt");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    loadConfig.mockReset();
    ensureValidAccessToken.mockReset();
  });

  it("chat 只请求 Edge，并解析 typed SSE 事件", async () => {
    const fetchMock = vi.fn(async () => sseResponse([
      "event: message.delta\ndata: {\"content\":\"你好\"}\n\n",
      "event: billing\ndata: {\"charged\":true,\"cost\":1}\n\n",
      "event: future.event\ndata: {\"value\":1}\n\n",
      "event: message.delta\ndata: {\"content\":\"，世界\"}\n\n",
      "event: message.done\ndata: {\"requestId\":\"req-1\"}\n\n",
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const { streamChat } = await import("../src/api.js");
    await expect(collect(streamChat([{ role: "user", content: "你好" }]))).resolves.toEqual(["你好", "，世界"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://edge.example/functions/v1/v1-chat");
    expect(fetchMock.mock.calls[0][0]).not.toContain("railway.invalid");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer user-jwt" });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      messages: [{ role: "user", content: "你好" }],
      agentId: "general",
    });
  });

  it("chat 遇到 401 时刷新用户 JWT 后重试", async () => {
    ensureValidAccessToken.mockImplementation(async (options?: { forceRefresh?: boolean }) =>
      options?.forceRefresh ? "fresh-jwt" : "expired-jwt"
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(sseResponse([
        "event: message.delta\ndata: {\"content\":\"ok\"}\n\n",
        "event: message.done\ndata: {\"requestId\":\"req-2\"}\n\n",
      ]));
    vi.stubGlobal("fetch", fetchMock);

    const { streamChat } = await import("../src/api.js");
    await expect(collect(streamChat([{ role: "user", content: "test" }]))).resolves.toEqual(["ok"]);

    expect(ensureValidAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: "Bearer fresh-jwt" });
  });

  it("chat 可发送 conversation context 并消费服务端 usage 事件", async () => {
    const onUsage = vi.fn();
    const fetchMock = vi.fn(async () => sseResponse([
      "event: message.delta\ndata: {\"content\":\"风险上升\"}\n\n",
      "event: usage\ndata: {\"requestId\":\"req-usage\",\"model\":\"claude-sonnet\",\"inputTokens\":1200,\"outputTokens\":320,\"cachedInputTokens\":400,\"totalTokens\":1520,\"contextWindow\":128000}\n\n",
      "event: message.done\ndata: {\"requestId\":\"req-usage\",\"model\":\"claude-sonnet\"}\n\n",
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const { streamChat } = await import("../src/api.js");
    await expect(collect(streamChat(
      [{ role: "user", content: "主要风险是什么？" }],
      {
        conversation: {
          schemaVersion: 1,
          mode: "client-managed",
          sessionId: "session_12345678",
          activeSymbols: ["NVDA"],
          artifacts: [],
        },
        clientCapabilities: { usageEvents: true },
        onUsage,
      },
    ))).resolves.toEqual(["风险上升"]);

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      messages: [{ role: "user", content: "主要风险是什么？" }],
      agentId: "general",
      conversation: {
        schemaVersion: 1,
        mode: "client-managed",
        sessionId: "session_12345678",
        activeSymbols: ["NVDA"],
        artifacts: [],
      },
      clientCapabilities: { usageEvents: true },
    });
    expect(onUsage).toHaveBeenCalledWith({
      requestId: "req-usage",
      model: "claude-sonnet",
      inputTokens: 1_200,
      outputTokens: 320,
      cachedInputTokens: 400,
      totalTokens: 1_520,
      contextWindow: 128_000,
    });
  });

  it("chat 将 error 事件转为 ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([
      "event: error\ndata: {\"code\":\"INSUFFICIENT_CREDITS\",\"message\":\"余额不足\",\"status\":402}\n\n",
    ])));

    const { ApiError, streamChat } = await import("../src/api.js");
    await expect(collect(streamChat([{ role: "user", content: "test" }]))).rejects.toMatchObject({
      constructor: ApiError,
      functionName: "v1-chat",
      status: 402,
      message: "[v1-chat] 余额不足",
    });
  });

  it("chat 忽略 total 与 input/output 不一致的 usage", async () => {
    const onUsage = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([
      "event: usage\ndata: {\"requestId\":\"req-invalid\",\"inputTokens\":100,\"outputTokens\":20,\"totalTokens\":999}\n\n",
      "event: message.done\ndata: {\"requestId\":\"req-invalid\"}\n\n",
    ])));

    const { streamChat } = await import("../src/api.js");
    await expect(collect(streamChat(
      [{ role: "user", content: "test" }],
      { onUsage },
    ))).resolves.toEqual([]);
    expect(onUsage).not.toHaveBeenCalled();
  });

  it("quick-scan 只请求 Edge 并解开 v1 envelope", async () => {
    const scan = { code: "NVDA", price: 180, pct: 1.2 };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: { scan },
      meta: { requestId: "req-scan", apiVersion: "v1", billing: { charged: true } },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { scanStockBackend } = await import("../src/api.js");
    await expect(scanStockBackend("NVDA")).resolves.toEqual({ scan });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://edge.example/functions/v1/v1-scan-stock");
    expect(fetchMock.mock.calls[0][0]).not.toContain("railway.invalid");
  });

  it("full 通过 Backend 创建 panorama 任务且不由 CLI 指定执行路径", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      taskId: "task-1",
      status: "pending",
      cached: false,
      ready: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { createReportTaskBackend } = await import("../src/api.js");
    await expect(createReportTaskBackend({
      symbol: "NVDA",
      reportType: "panorama",
      rawSymbolText: "nvda",
      rawUserInput: "重点看估值风险",
    })).resolves.toMatchObject({
      taskId: "task-1",
      status: "pending",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://railway.invalid/v1/generate-report");
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      symbol: "NVDA",
      reportType: "panorama",
      allowCache: true,
      rawUserInput: "重点看估值风险",
      rawSymbolText: "nvda",
    });
    expect(String(request.body)).not.toContain("executionPath");
    expect(String(request.body)).not.toContain("stockData");
  });

  it("查询 Backend 研报任务时编码 task ID 并携带用户 JWT", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      taskId: "task/1",
      symbol: "NVDA",
      reportType: "deep",
      status: "processing",
      progress: { execution_path: "agent_harness" },
      result: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { getReportTaskBackend } = await import("../src/api.js");
    await expect(getReportTaskBackend("task/1")).resolves.toMatchObject({
      taskId: "task/1",
      status: "processing",
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://railway.invalid/v1/report/task%2F1");
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer user-jwt");
  });
});
