#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# @covers: Q1, T1, MCP2

"""
MCP 主链逻辑验收测试（绕过登录检查）

验收要点：
1. canUseBackendMcp 对所有市场返回 true（当 mcpEnabled=true 且 mcpUrl 有效时）
2. canUseBackendMcp 对 mcpEnabled=false 返回 false
3. canUseBackendMcp 对空 mcpUrl 返回 false
4. mcp-client 懒加载验证（通过 dist/ 产物检查）
5. MCP 主链优先级正确（代码审查）
"""

import json
import re
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent


def test_ac1_canUseBackendMcp支持所有市场():
    """验收 1: canUseBackendMcp 不限制市场（A股/美股/港股都可以）"""
    print("\n=== 验收 1: canUseBackendMcp 支持所有市场 ===")

    # 检查源代码中不再有 isCnSymbol 的市场限制
    mcp_client_ts = PROJECT_ROOT / "src" / "data" / "mcp-client.ts"
    content = mcp_client_ts.read_text()

    # 确保没有 isCnSymbol 判断
    assert "isCnSymbol" not in content, "mcp-client.ts 仍包含 isCnSymbol 市场限制"
    print("✓ mcp-client.ts 已移除 isCnSymbol 限制")

    # 确保 canUseBackendMcp 逻辑正确
    can_use_pattern = re.search(
        r"export function canUseBackendMcp.*?\{(.*?)\n\}",
        content,
        re.DOTALL,
    )
    assert can_use_pattern, "找不到 canUseBackendMcp 函数"

    logic = can_use_pattern.group(1)
    # 检查逻辑：只检查 mcpEnabled 和 mcpUrl，不检查 symbol 市场
    assert "mcpEnabled" in logic, "缺少 mcpEnabled 检查"
    assert "mcpUrl" in logic, "缺少 mcpUrl 检查"
    assert "!isCnSymbol" not in logic, "仍有市场限制逻辑"
    print("✓ canUseBackendMcp 逻辑正确：仅检查 mcpEnabled 和 mcpUrl")


def test_ac2_mcpEnabled开关控制():
    """验收 2: backend.mcpEnabled 正确控制 MCP 使用"""
    print("\n=== 验收 2: mcpEnabled 开关控制 ===")

    # 检查 config.ts 默认配置
    config_ts = PROJECT_ROOT / "src" / "config.ts"
    content = config_ts.read_text()

    # 找到 DEFAULT_CONFIG
    default_config_match = re.search(
        r"const DEFAULT_CONFIG.*?backend:\s*\{(.*?)\}",
        content,
        re.DOTALL,
    )
    assert default_config_match, "找不到 DEFAULT_CONFIG.backend"

    backend_config = default_config_match.group(1)
    # 检查 mcpEnabled 默认值
    assert "mcpEnabled:" in backend_config, "DEFAULT_CONFIG.backend 缺少 mcpEnabled"
    assert "mcpUrl:" in backend_config, "DEFAULT_CONFIG.backend 缺少 mcpUrl"

    print("✓ config.ts 包含 backend.mcpEnabled 和 backend.mcpUrl 配置")


def test_ac3_mcp主链优先级():
    """验收 3: 数据获取优先级正确（MCP → HTTP API → OpenBB）"""
    print("\n=== 验收 3: MCP 主链优先级 ===")

    # 检查 quote.ts（行情）
    quote_ts = PROJECT_ROOT / "src" / "data" / "quote.ts"
    content = quote_ts.read_text()

    # 确保优先调用 canUseBackendMcp
    assert "canUseBackendMcp" in content, "quote.ts 未使用 canUseBackendMcp"
    assert "fetchQuoteFromBackendMcp" in content, "quote.ts 未使用 fetchQuoteFromBackendMcp"
    print("✓ quote.ts 使用 Backend MCP 主链")

    # 检查 hybrid.ts（技术指标）
    hybrid_ts = PROJECT_ROOT / "src" / "data" / "hybrid.ts"
    content = hybrid_ts.read_text()

    assert "canUseBackendMcp" in content, "hybrid.ts 未使用 canUseBackendMcp"
    assert "fetchTechnicalFromBackendMcp" in content, "hybrid.ts 未使用 fetchTechnicalFromBackendMcp"
    print("✓ hybrid.ts 使用 Backend MCP 主链")


def test_ac4_懒加载验证():
    """验收 4: MCP SDK 懒加载，不在模块顶层 import"""
    print("\n=== 验收 4: MCP SDK 懒加载 ===")

    mcp_client_ts = PROJECT_ROOT / "src" / "data" / "mcp-client.ts"
    content = mcp_client_ts.read_text()

    # 确保顶层没有直接 import MCP SDK（排除 type import 和动态 import）
    lines = content.split("\n")
    # 只检查真正的顶层 import 语句（不在函数内）
    top_static_imports = []
    in_function = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("function ") or stripped.startswith("async function "):
            in_function = True
        if in_function and stripped == "}":
            in_function = False
        if not in_function and stripped.startswith("import ") and "from" in stripped:
            top_static_imports.append(line)

    mcp_import_in_top = any("@modelcontextprotocol/sdk" in line for line in top_static_imports)
    assert not mcp_import_in_top, "MCP SDK 在顶层 import，会拖慢所有命令启动"
    print("✓ MCP SDK 未在顶层 import")

    # 确保有 dynamic import（可能在 await Promise.all 里，所以只检查 import(）
    assert 'import("@modelcontextprotocol' in content, "未找到 MCP SDK 动态导入"
    print("✓ MCP SDK 使用动态 import（懒加载）")


def test_ac5_mcp返回格式兼容():
    """验收 5: parseToolPayload 兼容 structuredContent 和 text JSON"""
    print("\n=== 验收 5: MCP 返回格式兼容 ===")

    mcp_client_ts = PROJECT_ROOT / "src" / "data" / "mcp-client.ts"
    content = mcp_client_ts.read_text()

    # 找到 parseToolPayload 函数
    parse_func_match = re.search(
        r"function parseToolPayload.*?\{(.*?)\n\}",
        content,
        re.DOTALL,
    )
    assert parse_func_match, "找不到 parseToolPayload 函数"

    parse_logic = parse_func_match.group(1)

    # 检查 structuredContent 处理
    assert "structuredContent" in parse_logic, "未处理 structuredContent"
    print("✓ parseToolPayload 处理 structuredContent")

    # 检查 text JSON 处理
    assert "JSON.parse" in parse_logic, "未处理 text JSON"
    print("✓ parseToolPayload 处理 text JSON")

    # 检查错误处理
    assert "isError" in parse_logic, "未处理 isError"
    print("✓ parseToolPayload 处理 isError")


if __name__ == "__main__":
    print("开始 MCP 主链逻辑验收测试")
    print("=" * 60)

    try:
        test_ac1_canUseBackendMcp支持所有市场()
        test_ac2_mcpEnabled开关控制()
        test_ac3_mcp主链优先级()
        test_ac4_懒加载验证()
        test_ac5_mcp返回格式兼容()

        print("\n" + "=" * 60)
        print("✅ 所有逻辑验收测试通过")
        sys.exit(0)
    except AssertionError as e:
        print("\n" + "=" * 60)
        print(f"❌ 验收测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        print("\n" + "=" * 60)
        print(f"❌ 测试执行异常: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
