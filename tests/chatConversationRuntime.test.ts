import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("rawChatCommand conversation runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("只在会话调用时附加 conversation、usage capability 和回调", async () => {
    async function* fakeStream() {
      yield "回答";
    }
    const streamChat = vi.fn(() => fakeStream());
    const onUsage = vi.fn();

    vi.doMock("../src/api.js", () => ({ streamChat }));
    vi.doMock("../src/output.js", () => ({
      isJsonMode: () => false,
      output: vi.fn(),
    }));
    vi.doMock("../src/billing.js", () => ({
      InsufficientCreditsError: class extends Error {},
    }));
    vi.doMock("../src/errors.js", () => ({ printError: vi.fn() }));
    vi.doMock("../src/tracker.js", () => ({ track: vi.fn() }));
    vi.doMock("../src/core/natural-dispatch.js", () => ({ dispatchNaturalText: vi.fn() }));

    const { rawChatCommand } = await import("../src/commands/chat.js");
    await rawChatCommand("继续", {
      history: [{ role: "assistant", content: "上一轮" }],
      conversation: {
        sessionId: "session_12345678",
        activeSymbols: ["NVDA"],
        artifacts: [],
      },
      onUsage,
    });

    expect(streamChat).toHaveBeenCalledWith(
      [
        { role: "assistant", content: "上一轮" },
        { role: "user", content: "继续" },
      ],
      {
        conversation: {
          sessionId: "session_12345678",
          activeSymbols: ["NVDA"],
          artifacts: [],
        },
        clientCapabilities: { usageEvents: true },
        onUsage,
      },
    );
  });
});
