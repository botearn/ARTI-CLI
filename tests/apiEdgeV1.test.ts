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
      backend: { url: "https://railway.invalid", timeout: 60_000 },
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
});
