import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { TerminalAnswerRenderer } from "../src/core/terminal-answer-renderer.js";

function render(chunks: string[], columns = 80): string {
  let output = "";
  const renderer = new TerminalAnswerRenderer({
    columns,
    write: text => {
      output += text;
    },
  });

  for (const chunk of chunks) renderer.write(chunk);
  renderer.end();
  return stripVTControlCharacters(output);
}

describe("TerminalAnswerRenderer", () => {
  it("完整行已经输出后标记为终端可见", () => {
    const renderer = new TerminalAnswerRenderer({ write: () => {} });

    expect(renderer.hasVisibleOutput).toBe(false);
    renderer.write("### 结论\n");

    expect(renderer.hasVisibleOutput).toBe(true);
  });

  it("跨流式分片渲染标题、粗体和引用，不暴露 Markdown 标记", () => {
    const output = render([
      "### 📡 技术",
      "面信号\n\n两只股票当前均呈**横盘整理**状态 [2]",
      "[11]\n",
    ]);

    expect(output).toContain("📡 技术面信号");
    expect(output).toContain("两只股票当前均呈横盘整理状态");
    expect(output).toContain("来源 2 · 11");
    expect(output).not.toContain("###");
    expect(output).not.toContain("**");
    expect(output).not.toContain("[2]");
  });

  it("将 Markdown 表格改成适合中文终端的纵向比较块", () => {
    const output = render([
      [
        "| 维度 | 优势方 | 说明 |",
        "|---|:---:|---|",
        "| 估值性价比 | 🏆 **腾讯** | PE/PB 均处历史低位 [2][11] |",
        "| 盈利能力 | 🏆 **Meta** | ROE、净利率全面领先 |",
        "",
      ].join("\n"),
    ]);

    expect(output).toContain("估值性价比");
    expect(output).toContain("🏆 腾讯");
    expect(output).toContain("PE/PB 均处历史低位");
    expect(output).toContain("盈利能力");
    expect(output).toContain("🏆 Meta");
    expect(output).not.toContain("|");
    expect(output).not.toContain("**");
  });

  it("将建议协议标签收敛为编号的接着问列表", () => {
    const output = render([
      "[建议]Meta 的 AI 广告业务对增速贡献有多大？\n[/建议]\n",
      "[建议]给腾讯做一次全景扫描\n[/建议]\n",
    ]);

    expect(output).toContain("接着问");
    expect(output).toContain("1. Meta 的 AI 广告业务对增速贡献有多大？");
    expect(output).toContain("2. 给腾讯做一次全景扫描");
    expect(output).not.toContain("[建议]");
    expect(output).not.toContain("[/建议]");
  });

  it("长段落按终端阅读宽度换行", () => {
    const output = render([
      "This is a deliberately long terminal paragraph that should wrap into readable lines.\n",
    ], 36);

    const contentLines = output
      .split("\n")
      .filter(line => line.trim().length > 0);
    expect(contentLines.length).toBeGreaterThan(1);
    expect(contentLines.every(line => line.length <= 36)).toBe(true);
  });

  it("将常见 LaTeX 公式降级为终端可读文本", () => {
    const output = render([
      "$$PE = \\frac{100}{5} = \\textbf{20 倍}$$\n",
      "$$\nP/E = \\frac{Price}{EPS}\n$$\n",
    ]);

    expect(output).toContain("PE = 100 / 5 = 20 倍");
    expect(output).toContain("P/E = Price / EPS");
    expect(output).not.toContain("$$");
    expect(output).not.toContain("\\frac");
    expect(output).not.toContain("\\textbf");
  });
});
