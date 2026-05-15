#!/bin/bash
# 测试 ARTI CLI 对三个市场的支持

set -e

echo "🧪 ARTI CLI 三市场测试"
echo "===================="
echo ""

# 设置开发模式
export ARTI_BILLING_BYPASS=true

# 测试函数
test_market() {
  local market=$1
  local symbol=$2
  local name=$3

  echo "📊 测试 $market: $name ($symbol)"

  if arti quote "$symbol" --json >/dev/null 2>&1; then
    local price=$(arti quote "$symbol" --json 2>/dev/null | jq -r '.quotes[0].last_price')
    echo "   ✅ 成功 - 价格: \$$price"
  else
    echo "   ❌ 失败"
    return 1
  fi
}

# 美股测试
echo "🇺🇸 美股测试"
test_market "美股" "AAPL" "Apple"
test_market "美股" "NVDA" "Nvidia"
echo ""

# 港股测试
echo "🇭🇰 港股测试"
test_market "港股" "0700.HK" "腾讯"
test_market "港股" "9988.HK" "阿里"
echo ""

# A 股测试
echo "🇨🇳 A 股测试"
test_market "A股" "600519.SS" "茅台"
test_market "A股" "000858.SZ" "五粮液"
echo ""

# 混合测试
echo "🌍 混合查询测试"
echo "   查询: AAPL + 0700.HK + 600519.SS"

if arti quote AAPL 0700.HK 600519.SS --json >/dev/null 2>&1; then
  local count=$(arti quote AAPL 0700.HK 600519.SS --json 2>/dev/null | jq '.quotes | length')
  if [ "$count" = "3" ]; then
    echo "   ✅ 成功 - 返回 $count 个股票"
  else
    echo "   ⚠️  部分成功 - 返回 $count/3 个股票"
  fi
else
  echo "   ❌ 失败"
fi

echo ""
echo "===================="
echo "✅ 测试完成"
echo ""
echo "📝 配置信息:"
echo "   Backend: $(arti config get backend.enabled | awk '{print $NF}')"
echo "   URL: $(arti config get backend.url | awk -F'"' '{print $2}')"
