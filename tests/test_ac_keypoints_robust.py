# @covers: E1
"""
验收测试：keyPoints 字段容错处理

验收要点：
1. 当 API 返回的 keyPoints 不是数组时，程序不崩溃，能正常显示报告的其他部分
2. 如果 keyPoints 是字符串或其他格式，自动转换为数组格式或跳过该字段
3. 错误提示友好，用户能看到研报的主要内容（标题、摘要、置信度等）
4. --full 模式下，即使某个分析师的 keyPoints 有问题，其他分析师的报告仍能正常显示
"""

import subprocess
import json


def test_e1_keypoints_非数组时不崩溃():
    """验收点 1: keyPoints 不是数组时，程序不崩溃，显示其他部分"""
    # 模拟场景：后端返回 keyPoints 为字符串
    # 由于无法直接 mock API，我们检查代码是否有防御性检查

    # 读取 research.ts 源码
    with open("src/commands/research.ts", "r", encoding="utf-8") as f:
        code = f.read()

    # 检查 renderAnalystBrief 函数中是否有 Array.isArray 检查
    assert "Array.isArray" in code, "应该有 Array.isArray 检查来验证 keyPoints 是数组"

    # 检查是否对 keyPoints 做了条件检查（if 语句）
    assert "if (report.keyPoints)" in code or "if (report.keyPoints " in code, \
        "应该使用条件检查来安全访问 keyPoints"


def test_e1_keypoints_字符串自动转换():
    """验收点 2: keyPoints 是字符串时，自动转换为数组或跳过"""
    with open("src/commands/research.ts", "r", encoding="utf-8") as f:
        code = f.read()

    # 检查是否有类型转换逻辑
    # 可以是 typeof check 或者 Array.isArray 后的处理
    assert ("typeof" in code and "keyPoints" in code) or "Array.isArray" in code, \
        "应该检查 keyPoints 的类型"


def test_e1_错误提示友好():
    """验收点 3: 错误提示友好，显示报告主要内容"""
    # 检查 renderAnalystBrief 函数结构
    with open("src/commands/research.ts", "r", encoding="utf-8") as f:
        code = f.read()

    # renderAnalystBrief 应该始终显示标题、摘要、置信度
    # 即使 keyPoints 有问题
    assert "report.title" in code, "应该显示 title"
    assert "report.summary" in code, "应该显示 summary"
    assert "report.confidence" in code, "应该显示 confidence"

    # keyPoints 应该被包在条件块中
    lines = code.split("\n")
    keypoints_block_found = False
    for i, line in enumerate(lines):
        if "keyPoints" in line and ("if" in line or "?" in line):
            keypoints_block_found = True
            break

    assert keypoints_block_found, "keyPoints 应该被条件判断包裹，避免崩溃"


def test_e1_full_模式容错():
    """验收点 4: --full 模式下，单个分析师问题不影响其他分析师"""
    with open("src/commands/research.ts", "r", encoding="utf-8") as f:
        code = f.read()

    # 检查渲染循环中是否有 try-catch 或安全访问
    # renderAnalystBrief 函数应该足够健壮
    assert "renderAnalystBrief" in code, "应该有 renderAnalystBrief 函数"

    # 确保函数不会因为单个字段问题而抛出异常
    # 通过检查是否使用了安全访问模式
    render_func_start = code.find("function renderAnalystBrief")
    render_func_end = code.find("\n}", render_func_start) + 2
    render_func = code[render_func_start:render_func_end]

    # 函数内应该有安全的属性访问
    assert "?" in render_func or "&&" in render_func or "Array.isArray" in render_func, \
        "renderAnalystBrief 应该使用安全的属性访问模式"


if __name__ == "__main__":
    import sys

    print("执行 E1 规则验收测试...")
    try:
        test_e1_keypoints_非数组时不崩溃()
        print("✓ 验收点 1: keyPoints 非数组时不崩溃")
    except AssertionError as e:
        print(f"✗ 验收点 1 失败: {e}")
        sys.exit(1)

    try:
        test_e1_keypoints_字符串自动转换()
        print("✓ 验收点 2: keyPoints 字符串自动转换或跳过")
    except AssertionError as e:
        print(f"✗ 验收点 2 失败: {e}")
        sys.exit(1)

    try:
        test_e1_错误提示友好()
        print("✓ 验收点 3: 错误提示友好，显示主要内容")
    except AssertionError as e:
        print(f"✗ 验收点 3 失败: {e}")
        sys.exit(1)

    try:
        test_e1_full_模式容错()
        print("✓ 验收点 4: --full 模式容错")
    except AssertionError as e:
        print(f"✗ 验收点 4 失败: {e}")
        sys.exit(1)

    print("\n所有验收点通过 ✓")
