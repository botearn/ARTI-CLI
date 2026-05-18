import { describe, expect, it } from "vitest";
import { BACKEND_MCP_TOOL_CONTRACTS } from "../src/data/mcp-client.js";

describe("backend MCP tool contracts", () => {
  it("covers the tools used by CLI hybrid data paths", () => {
    expect(Object.keys(BACKEND_MCP_TOOL_CONTRACTS).sort()).toEqual([
      "get_company_profile",
      "get_daily_bars",
      "get_dividend_history",
      "get_financial_report",
      "get_macro_indicators",
      "get_realtime_quote",
      "get_stock_fund_flow",
      "get_stock_info",
      "get_technical_indicators",
      "load_stock_context",
    ].sort());
  });

  it("keeps required arguments explicit for each wrapped backend tool", () => {
    expect(BACKEND_MCP_TOOL_CONTRACTS.get_stock_info.args).toContain("symbol");
    expect(BACKEND_MCP_TOOL_CONTRACTS.get_company_profile.args).toContain("symbol");
    expect(BACKEND_MCP_TOOL_CONTRACTS.get_financial_report.args).toEqual(
      expect.arrayContaining(["symbol", "report_type", "force_refresh"]),
    );
    expect(BACKEND_MCP_TOOL_CONTRACTS.get_macro_indicators.args).toEqual(
      expect.arrayContaining(["country", "days", "force_refresh"]),
    );
    expect(BACKEND_MCP_TOOL_CONTRACTS.load_stock_context.args).toEqual(
      expect.arrayContaining(["symbol", "include", "force_refresh"]),
    );
  });

  it("documents minimum response fields for smoke validation", () => {
    expect(BACKEND_MCP_TOOL_CONTRACTS.get_realtime_quote.requiredFields).toEqual(
      expect.arrayContaining(["symbol", "price"]),
    );
    expect(BACKEND_MCP_TOOL_CONTRACTS.get_daily_bars.requiredFields).toContain("bars");
    expect(BACKEND_MCP_TOOL_CONTRACTS.get_technical_indicators.requiredFields).toEqual(
      expect.arrayContaining(["latest_close", "ma5", "ma10", "ma20", "ma60"]),
    );
    expect(BACKEND_MCP_TOOL_CONTRACTS.get_financial_report.requiredFields).toContain("reports");
    expect(BACKEND_MCP_TOOL_CONTRACTS.get_macro_indicators.requiredFields).toContain("data");
  });
});
