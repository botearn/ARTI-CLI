import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printError } from "../src/errors.js";

// L3：服务端错误文本可能含 ANSI/控制序列，printError 输出前应剥离，防终端注入。
describe("printError 清洗服务端错误文本", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it("剥离 ANSI 转义序列与控制字符", () => {
    // 恶意后端返回：含 CSI 颜色序列 + 回车覆盖 + 响铃
    const malicious = "服务端错误 \x1b[31m\x1b[2J危险\x07\x08 \x1b]0;title\x07";
    printError(new Error(malicious));

    const printed = errSpy.mock.calls.map(c => String(c[0])).join("\n");
    // 不应残留 ESC / 响铃 / 退格等控制字符
    expect(printed).not.toMatch(/\x1b/);
    expect(printed).not.toMatch(/\x07/);
    expect(printed).not.toMatch(/\x08/);
    // 可见文本保留
    expect(printed).toContain("危险");
  });

  it("超长错误文本被截断", () => {
    const long = "x".repeat(2000);
    printError(new Error(long));
    const printed = errSpy.mock.calls.map(c => String(c[0])).join("\n");
    expect(printed).toMatch(/已截断/);
  });
});
