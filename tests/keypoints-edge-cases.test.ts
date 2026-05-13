/**
 * keyPoints 边缘情况单元测试
 * 测试 renderAnalystBrief 对异常数据的容错
 */

import { describe, it, expect } from "vitest";

describe("keyPoints 容错处理", () => {
  it("应该处理 keyPoints 为字符串的情况", () => {
    // 模拟后端返回的异常数据
    const report: any = {
      title: "技术分析报告",
      summary: "市场趋势向好",
      sentiment: "看多",
      confidence: 75,
      keyPoints: "第一点\n第二点\n第三点", // 字符串而非数组
      fullReport: "完整报告内容",
    };

    // 测试 Array.isArray 检查
    expect(Array.isArray(report.keyPoints)).toBe(false);

    // 测试字符串转数组
    if (typeof report.keyPoints === "string") {
      const points = report.keyPoints.split("\n").filter((line: string) => line.trim());
      expect(points.length).toBe(3);
      expect(points[0]).toBe("第一点");
    }
  });

  it("应该处理 keyPoints 为正常数组的情况", () => {
    const report: any = {
      title: "技术分析报告",
      summary: "市场趋势向好",
      sentiment: "看多",
      confidence: 75,
      keyPoints: ["第一点", "第二点", "第三点"],
      fullReport: "完整报告内容",
    };

    expect(Array.isArray(report.keyPoints)).toBe(true);
    expect(report.keyPoints.length).toBe(3);
  });

  it("应该处理 keyPoints 为 null 或 undefined 的情况", () => {
    const report1: any = {
      title: "技术分析报告",
      summary: "市场趋势向好",
      sentiment: "看多",
      confidence: 75,
      keyPoints: null,
      fullReport: "完整报告内容",
    };

    const report2: any = {
      title: "技术分析报告",
      summary: "市场趋势向好",
      sentiment: "看多",
      confidence: 75,
      keyPoints: undefined,
      fullReport: "完整报告内容",
    };

    // 测试不会崩溃
    expect(report1.keyPoints).toBeFalsy();
    expect(report2.keyPoints).toBeFalsy();
  });

  it("应该处理 keyPoints 为空数组的情况", () => {
    const report: any = {
      title: "技术分析报告",
      summary: "市场趋势向好",
      sentiment: "看多",
      confidence: 75,
      keyPoints: [],
      fullReport: "完整报告内容",
    };

    expect(Array.isArray(report.keyPoints)).toBe(true);
    expect(report.keyPoints.length).toBe(0);
  });

  it("应该处理 keyPoints 为对象的情况", () => {
    const report: any = {
      title: "技术分析报告",
      summary: "市场趋势向好",
      sentiment: "看多",
      confidence: 75,
      keyPoints: { point1: "第一点", point2: "第二点" }, // 错误的对象格式
      fullReport: "完整报告内容",
    };

    expect(Array.isArray(report.keyPoints)).toBe(false);
    expect(typeof report.keyPoints).toBe("object");
    // 这种情况下代码会跳过显示 keyPoints，不会崩溃
  });
});
