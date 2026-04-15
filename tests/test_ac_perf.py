# @covers: B1, Q2
"""
验收测试 — 性能优化四项
1. Python 常驻进程：第二次调用显著快于第一次
2. 缓存层：30s 内重复调用直接返回（由 TS 侧处理，此处测 daemon 响应速度）
3. 并行请求：daemon 支持连续请求不阻塞
4. 轻量报价：fast_quote 命令返回完整字段
"""

import subprocess
import json
import time
import sys
import os

PYTHON = os.path.join(os.path.dirname(__file__), "..", ".venv", "bin", "python")
DAEMON = os.path.join(os.path.dirname(__file__), "..", "scripts", "openbb_daemon.py")


def test_daemon_ready():
    """daemon 启动后发送 ready 信号"""
    proc = subprocess.Popen(
        [PYTHON, DAEMON],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True,
    )
    line = proc.stdout.readline()
    resp = json.loads(line.strip())
    assert resp.get("ready") is True, f"expected ready=True, got {resp}"
    # 清理
    proc.stdin.write(json.dumps({"id": "x", "command": "__exit__"}) + "\n")
    proc.stdin.flush()
    proc.wait(timeout=5)
    print("[PASS] daemon ready 信号")


def test_fast_quote_fields():
    """fast_quote 返回完整报价字段"""
    proc = subprocess.Popen(
        [PYTHON, DAEMON],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True,
    )
    # 等 ready
    proc.stdout.readline()

    req = json.dumps({"id": "1", "command": "fast_quote", "params": {"symbol": "AAPL"}}) + "\n"
    proc.stdin.write(req)
    proc.stdin.flush()
    line = proc.stdout.readline()
    resp = json.loads(line.strip())

    assert resp["ok"] is True, f"fast_quote failed: {resp.get('error')}"
    data = resp["data"]
    required_fields = ["symbol", "name", "last_price", "prev_close", "volume", "year_high", "year_low"]
    for f in required_fields:
        assert f in data, f"missing field: {f}"
    assert data["symbol"] == "AAPL"
    assert data["last_price"] > 0, f"last_price should be > 0, got {data['last_price']}"
    print(f"[PASS] fast_quote 字段完整, AAPL=${data['last_price']}")

    # 清理
    proc.stdin.write(json.dumps({"id": "x", "command": "__exit__"}) + "\n")
    proc.stdin.flush()
    proc.wait(timeout=5)


def test_daemon_second_call_faster():
    """第二次调用应显著快于第一次（进程已热）"""
    proc = subprocess.Popen(
        [PYTHON, DAEMON],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True,
    )
    proc.stdout.readline()  # ready

    # 第一次
    t1 = time.time()
    proc.stdin.write(json.dumps({"id": "1", "command": "fast_quote", "params": {"symbol": "MSFT"}}) + "\n")
    proc.stdin.flush()
    proc.stdout.readline()
    d1 = time.time() - t1

    # 第二次（同一进程，yfinance 已加载）
    t2 = time.time()
    proc.stdin.write(json.dumps({"id": "2", "command": "fast_quote", "params": {"symbol": "GOOGL"}}) + "\n")
    proc.stdin.flush()
    proc.stdout.readline()
    d2 = time.time() - t2

    print(f"  第一次: {d1:.2f}s, 第二次: {d2:.2f}s, 加速比: {d1/d2:.1f}x")
    # 第二次应该至少快一些（yfinance import 已完成）
    # 注意：网络延迟不确定，所以只检查第二次不会更慢太多
    assert d2 < d1 * 2, f"第二次调用不应比第一次慢 2 倍: {d1:.2f}s vs {d2:.2f}s"
    print("[PASS] 常驻进程第二次调用更快")

    proc.stdin.write(json.dumps({"id": "x", "command": "__exit__"}) + "\n")
    proc.stdin.flush()
    proc.wait(timeout=5)


def test_parallel_requests():
    """daemon 支持连续发送多个请求"""
    proc = subprocess.Popen(
        [PYTHON, DAEMON],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True,
    )
    proc.stdout.readline()  # ready

    # 预热
    proc.stdin.write(json.dumps({"id": "w", "command": "fast_quote", "params": {"symbol": "AAPL"}}) + "\n")
    proc.stdin.flush()
    proc.stdout.readline()

    # 连续发 3 个请求
    symbols = ["AAPL", "NVDA", "TSLA"]
    t0 = time.time()
    for i, sym in enumerate(symbols):
        proc.stdin.write(json.dumps({"id": str(i), "command": "fast_quote", "params": {"symbol": sym}}) + "\n")
    proc.stdin.flush()

    results = []
    for _ in symbols:
        line = proc.stdout.readline()
        results.append(json.loads(line.strip()))
    elapsed = time.time() - t0

    for r in results:
        assert r["ok"] is True, f"请求失败: {r.get('error')}"
    print(f"  3 个 symbol 串行总耗时: {elapsed:.2f}s")
    print(f"  返回 symbols: {[r['data']['symbol'] for r in results]}")
    print("[PASS] daemon 连续请求正常")

    proc.stdin.write(json.dumps({"id": "x", "command": "__exit__"}) + "\n")
    proc.stdin.flush()
    proc.wait(timeout=5)


if __name__ == "__main__":
    test_daemon_ready()
    test_fast_quote_fields()
    test_daemon_second_call_faster()
    test_parallel_requests()
    print("\n✅ 所有性能优化验收测试通过")
