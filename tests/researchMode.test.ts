import { describe, expect, it } from "vitest";
import { normalizeResearchMode } from "../src/commands/research.js";

describe("normalizeResearchMode", () => {
  it("兼容 deep / full 到后端 full 模式", () => {
    expect(normalizeResearchMode("deep")).toBe("full");
    expect(normalizeResearchMode("full")).toBe("full");
    expect(normalizeResearchMode(undefined)).toBe("full");
  });

  it("兼容 panorama / layer1-only 到后端 layer1-only 模式", () => {
    expect(normalizeResearchMode("panorama")).toBe("layer1-only");
    expect(normalizeResearchMode("layer1-only")).toBe("layer1-only");
  });

  it("未知模式默认回退到 full", () => {
    expect(normalizeResearchMode("unknown")).toBe("full");
  });
});
