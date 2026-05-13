import { describe, it, expect } from "vitest";
import { extractReportPoints } from "../src/commands/research.js";

describe("keyPoints 容错处理", () => {
  it("应该处理按换行分隔的字符串", () => {
    expect(extractReportPoints("第一点\n第二点\n第三点")).toEqual([
      "第一点",
      "第二点",
      "第三点",
    ]);
  });

  it("应该处理正常数组并去重", () => {
    expect(extractReportPoints(["第一点", "第二点", "第一点"])).toEqual([
      "第一点",
      "第二点",
    ]);
  });

  it("应该处理 JSON 数组字符串", () => {
    expect(extractReportPoints('["第一点","第二点","第三点"]')).toEqual([
      "第一点",
      "第二点",
      "第三点",
    ]);
  });

  it("应该处理带符号和管道分隔的字符串", () => {
    expect(extractReportPoints("• 第一点 | 2. 第二点 | - 第三点")).toEqual([
      "第一点",
      "第二点",
      "第三点",
    ]);
  });

  it("应该清理 pretty-printed JSON 数组里的括号和尾部引号", () => {
    expect(extractReportPoints('[\n  "第一点",\n  "第二点",\n  "第三点"\n]')).toEqual([
      "第一点",
      "第二点",
      "第三点",
    ]);
  });

  it("应该处理 null、undefined 和对象输入", () => {
    expect(extractReportPoints(null)).toEqual([]);
    expect(extractReportPoints(undefined)).toEqual([]);
    expect(extractReportPoints({ point1: "第一点" })).toEqual([]);
  });
});
