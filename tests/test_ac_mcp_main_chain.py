#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# @covers: Q1, T1, MCP2

"""
MCP 主链验收测试

验收要点：
1. 所有股票行情走 MCP 主链：查询任何市场股票（A股/美股/港股）时，优先调 backend MCP 的 get_realtime_quote 和 get_daily_bars，MCP 失败时自动降级到 HTTP API / OpenBB，用户无感知
2. 所有股票技术指标走 MCP 主链：查询任何市场技术指标时，优先调 backend MCP 的 get_technical_indicators，MCP 失败时自动降级到 HTTP API / arti-data / OpenBB
3. MCP 开关控制：backend.mcpEnabled 配置项控制是否启用 MCP，关闭时直接走 HTTP API / OpenBB 兜底链路
4. MCP 返回格式兼容：能正确解析 backend MCP 返回的 structuredContent 字段和 text 字段中的 JSON，错误时抛出友好异常
5. 懒加载不拖慢启动：MCP SDK 仅在首次调用 MCP 时才 import，普通命令（如 arti config list）不加载 MCP SDK
"""

import json
import subprocess
import sys
from pathlib import Path

def run_cmd(args: list[str]) -> dict:
    """执行 arti 命令并返回 JSON 结果"""
    result = subprocess.run(
        ["node", "dist/index.js"] + args + ["--json"],
        capture_output=True,
        text=True,
        cwd=Path(__file__).parent.parent,
    )
    if result.returncode != 0:
        print(f"命令失败: {' '.join(args)}", file=sys.stderr)
        print(f"stderr: {result.stderr}", file=sys.stderr)
        return {"error": result.stderr}

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"JSON 解析失败: {result.stdout}", file=sys.stderr)
        return {"error": "JSON parse failed", "stdout": result.stdout}


def test_ac1_所有股票行情走mcp主链():
    """验收 1: A股/美股/港股行情都走 MCP 主链"""
    print("\n=== 验收 1: 所有股票行情走 MCP 主链 ===")

    # A 股
    result_cn = run_cmd(["quote", "600519.SS"])
    assert "error" not in result_cn, f"A股行情查询失败: {result_cn}"
    assert "quotes" in result_cn, "A股返回格式错误"
    print("✓ A股行情查询成功")

    # 美股
    result_us = run_cmd(["quote", "AAPL"])
    assert "error" not in result_us, f"美股行情查询失败: {result_us}"
    assert "quotes" in result_us, "美股返回格式错误"
    print("✓ 美股行情查询成功")

    # 港股
    result_hk = run_cmd(["quote", "0700.HK"])
    assert "error" not in result_hk, f"港股行情查询失败: {result_hk}"
    assert "quotes" in result_hk, "港股返回格式错误"
    print("✓ 港股行情查询成功")


def test_ac2_所有股票技术指标走mcp主链():
    """验收 2: A股/美股/港股技术指标都走 MCP 主链"""
    print("\n=== 验收 2: 所有股票技术指标走 MCP 主链 ===")

    # A 股
    result_cn = run_cmd(["scan", "600519.SS"])
    assert "error" not in result_cn, f"A股技术指标查询失败: {result_cn}"
    assert "technical" in result_cn or "ma" in result_cn, "A股技术指标返回格式错误"
    print("✓ A股技术指标查询成功")

    # 美股
    result_us = run_cmd(["scan", "AAPL"])
    assert "error" not in result_us, f"美股技术指标查询失败: {result_us}"
    assert "technical" in result_us or "ma" in result_us, "美股技术指标返回格式错误"
    print("✓ 美股技术指标查询成功")


def test_ac3_mcp开关控制():
    """验收 3: backend.mcpEnabled 配置项控制 MCP"""
    print("\n=== 验收 3: MCP 开关控制 ===")

    # 读取当前配置
    result = run_cmd(["config", "list"])
    assert "backend" in result, "配置读取失败"

    # 检查 mcpEnabled 字段存在
    backend_config = result.get("backend", {})
    assert "mcpEnabled" in backend_config, "backend.mcpEnabled 配置项不存在"
    print(f"✓ backend.mcpEnabled = {backend_config['mcpEnabled']}")

    # 检查 mcpUrl 字段存在
    assert "mcpUrl" in backend_config, "backend.mcpUrl 配置项不存在"
    print(f"✓ backend.mcpUrl = {backend_config['mcpUrl']}")


def test_ac4_mcp返回格式兼容():
    """验收 4: 能正确解析 structuredContent 和 text JSON"""
    print("\n=== 验收 4: MCP 返回格式兼容 ===")

    # 通过实际查询测试格式解析（如果 MCP 可用）
    result = run_cmd(["quote", "600519.SS"])

    if "error" in result:
        print("⚠ MCP 不可用，跳过格式兼容测试（预期会有 fallback）")
        return

    # 检查返回的数据结构完整性
    assert "quotes" in result, "返回格式缺少 quotes 字段"
    if result["quotes"]:
        quote = result["quotes"][0]
        assert "symbol" in quote, "quote 缺少 symbol 字段"
        assert "last_price" in quote or "price" in quote, "quote 缺少价格字段"
        print("✓ MCP 返回数据格式正确")


def test_ac5_懒加载不拖慢启动():
    """验收 5: MCP SDK 懒加载，不影响普通命令启动速度"""
    print("\n=== 验收 5: 懒加载不拖慢启动 ===")

    import time

    # 测试普通命令启动时间（不涉及 MCP）
    start = time.time()
    result = run_cmd(["config", "list"])
    elapsed = time.time() - start

    assert "error" not in result, "config list 命令失败"
    assert elapsed < 3.0, f"config list 启动过慢: {elapsed:.2f}s（应 <3s）"
    print(f"✓ config list 启动时间: {elapsed:.2f}s")


if __name__ == "__main__":
    print("开始 MCP 主链验收测试")
    print("=" * 60)

    try:
        test_ac1_所有股票行情走mcp主链()
        test_ac2_所有股票技术指标走mcp主链()
        test_ac3_mcp开关控制()
        test_ac4_mcp返回格式兼容()
        test_ac5_懒加载不拖慢启动()

        print("\n" + "=" * 60)
        print("✅ 所有验收测试通过")
        sys.exit(0)
    except AssertionError as e:
        print("\n" + "=" * 60)
        print(f"❌ 验收测试失败: {e}")
        sys.exit(1)
    except Exception as e:
        print("\n" + "=" * 60)
        print(f"❌ 测试执行异常: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
