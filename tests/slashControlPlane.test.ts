import { describe, expect, it } from "vitest";
import {
  completeSlashCommands,
  parseReplInput,
  suggestSlashCommands,
} from "../src/core/slash.js";

describe("Slash Control Plane", () => {
  it("只把行首 Slash 解析为快捷命令", () => {
    expect(parseReplInput("/deep NVDA")).toEqual({
      type: "slash",
      name: "deep",
      args: ["NVDA"],
    });
    expect(parseReplInput("  /quick AAPL  ")).toEqual({
      type: "slash",
      name: "quick",
      args: ["AAPL"],
    });
  });

  it("裸命令和文本中的 Slash 都作为普通对话", () => {
    expect(parseReplInput("deep NVDA")).toEqual({
      type: "conversation",
      text: "deep NVDA",
    });
    expect(parseReplInput("解释 /deep 是什么")).toEqual({
      type: "conversation",
      text: "解释 /deep 是什么",
    });
  });

  it("双 Slash 转义为字面量 Slash 文本", () => {
    expect(parseReplInput("//deep NVDA")).toEqual({
      type: "conversation",
      text: "/deep NVDA",
    });
  });

  it("单独 Slash 打开命令列表，空输入不产生行为", () => {
    expect(parseReplInput("/")).toEqual({
      type: "slash",
      name: "",
      args: [],
    });
    expect(parseReplInput("   ")).toBeNull();
  });

  it("未知 Slash 可以获得确定性的相近命令建议", () => {
    const commands = ["help", "quick", "full", "deep", "credits", "cls", "exit"];

    expect(suggestSlashCommands("depe", commands)).toEqual(["deep"]);
    expect(suggestSlashCommands("qui", commands)).toEqual(["quick"]);
    expect(suggestSlashCommands("unknown", commands)).toEqual([]);
  });

  it("只在 Slash 命令名位置提供补全", () => {
    const commands = ["help", "quick", "full", "deep"];

    expect(completeSlashCommands("/", commands)).toEqual([
      "/help",
      "/quick",
      "/full",
      "/deep",
    ]);
    expect(completeSlashCommands("/d", commands)).toEqual(["/deep"]);
    expect(completeSlashCommands("//deep", commands)).toEqual([]);
    expect(completeSlashCommands("/deep NV", commands)).toEqual([]);
    expect(completeSlashCommands("deep", commands)).toEqual([]);
  });
});
