/**
 * 三股市测试——验证数据源优先级
 *
 * 测试场景：
 * 1. 美股（AAPL）：Backend API → OpenBB
 * 2. 港股（0700.HK）：Backend API → OpenBB
 * 3. A股（600519.SS）：Backend MCP → Backend API → arti-data → OpenBB
 */
import { getHybridQuote, getHybridTechnical, usingMcp } from "../src/data/index.js";

async function testThreeMarkets() {
  const testCases = [
    { symbol: "AAPL", market: "美股", type: "US Stock" },
    { symbol: "0700.HK", market: "港股", type: "HK Stock" },
    { symbol: "600519.SS", market: "A股", type: "CN Stock" },
  ];

  console.log("=".repeat(60));
  console.log("三股市数据源优先级测试");
  console.log("=".repeat(60));
  console.log();

  for (const { symbol, market, type } of testCases) {
    console.log(`📊 ${market} (${symbol}) - ${type}`);
    console.log("─".repeat(40));

    try {
      // 测试 Quote
      console.log("  获取实时行情...");
      const quoteResult = await getHybridQuote(symbol);
      console.log(`  ✓ 来源: ${quoteResult.source.toUpperCase()}`);
      console.log(`    价格: $${quoteResult.quote.last_price}`);
      console.log(`    涨跌: ${quoteResult.quote.change_percent}%`);

      // 测试 Technical (仅 A 股有 MCP)
      if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) {
        console.log("  获取技术指标...");
        const techResult = await getHybridTechnical(symbol);
        console.log(`  ✓ 来源: ${techResult.source.toUpperCase()}`);
        console.log(`    价格: $${techResult.technical.price}`);
        if (techResult.technical.ma["MA5"]) {
          console.log(`    MA5: ${techResult.technical.ma["MA5"]}`);
        }
      }
    } catch (err) {
      console.log(`  ✗ 错误: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log();
  }

  console.log("=".repeat(60));
  console.log(`MCP 使用状态: ${usingMcp() ? "✓ 已启用" : "✗ 禁用"}`);
  console.log("=".repeat(60));
}

// 运行测试
testThreeMarkets().catch(console.error);
