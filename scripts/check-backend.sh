#!/bin/bash
# 快速检查 Backend 状态脚本

BACKEND_URL="https://api-gateway-production-b656.up.railway.app"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ARTI Backend 状态检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Backend URL: $BACKEND_URL"
echo ""

# 1. 健康检查
echo "1️⃣  健康检查:"
HEALTH=$(curl -s $BACKEND_URL/health)
if [ $? -eq 0 ]; then
  echo "$HEALTH" | jq -r '. | "   ✓ 状态: \(.status)\n   ✓ 服务: \(.service)\n   ✓ 环境: \(.env)\n   ✓ 模型: \(.default_model)\n   ✓ Real Agents: \(.real_agents)"' 2>/dev/null || echo "$HEALTH"
else
  echo "   ✗ Backend 无法连接"
  exit 1
fi

echo ""

# 2. DB 连接
echo "2️⃣  数据库连接:"
DB=$(curl -s $BACKEND_URL/v1/db-check)
if [ $? -eq 0 ]; then
  echo "$DB" | jq -r '. | "   ✓ 用户: \(.current_user)\n   ✓ 报告任务: \(.row_counts.report_tasks)\n   ✓ Agent 数据: \(.row_counts.agent_data)\n   ✓ 新闻: \(.row_counts.news)"' 2>/dev/null || echo "$DB"
else
  echo "   ✗ DB 检查失败"
fi

echo ""

# 3. CLI 配置
echo "3️⃣  CLI 配置:"
cd /Users/nicolechen/ARTI-CLI
BACKEND_CONFIG=$(./dist/index.js config get backend.url 2>/dev/null)
BACKEND_ENABLED=$(./dist/index.js config get backend.enabled 2>/dev/null)
echo "   $BACKEND_CONFIG"
echo "   $BACKEND_ENABLED"

echo ""

# 4. 认证状态
echo "4️⃣  认证状态:"
if [ -z "$ARTI_AUTH_TOKEN" ]; then
  echo "   ⚠️  未配置 JWT token"
  echo "   提示: export ARTI_AUTH_TOKEN=<token> 或 arti login --token <token>"
else
  echo "   ✓ JWT token 已配置"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  测试命令:"
echo ""
echo "  $ arti scan AAPL          # 测试 hybrid 模式"
echo "  $ arti quick-scan AAPL    # 快速研判"
echo "  $ arti full AAPL          # 全景研报 (需要 JWT)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
