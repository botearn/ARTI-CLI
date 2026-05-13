import { describe, expect, it } from "vitest";
import { isLoggedIn, maskToken } from "../src/auth.js";

describe("auth helpers", () => {
  it("maskToken 会保留前后各 4 位", () => {
    expect(maskToken("1234567890abcdef")).toBe("1234...cdef");
  });

  it("短 token 会被全部脱敏", () => {
    expect(maskToken("12345678")).toBe("********");
  });

  it("isLoggedIn 仅在 token 存在时返回 true", () => {
    expect(isLoggedIn({ token: "abc", userId: "", email: "" })).toBe(true);
    expect(isLoggedIn({ token: "", userId: "", email: "" })).toBe(false);
  });
});
