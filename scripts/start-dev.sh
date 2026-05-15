#!/bin/bash
# ARTI CLI 开发模式启动脚本

set -e

echo "🚀 启动 ARTI CLI 开发环境"
echo ""

# 检查 Backend MCP 服务
if ! lsof -i :8001 >/dev/null 2>&1; then
  echo "📡 启动 Backend MCP 服务..."

  BACKEND_DIR="/Users/nicolechen/ARTI_backend"
  MCP_DIR="$BACKEND_DIR/mcp-market"

  if [ ! -d "$MCP_DIR" ]; then
    echo "❌ Backend MCP 目录不存在: $MCP_DIR"
    exit 1
  fi

  # 加载 .env
  if [ -f "$BACKEND_DIR/.env" ]; then
    export $(grep -v '^#' "$BACKEND_DIR/.env" | xargs)
    echo "   ✓ 加载 .env 配置"
  fi

  # 启动 MCP 服务
  cd "$MCP_DIR"
  nohup python server.py > mcp-server.log 2>&1 &
  MCP_PID=$!
  echo "   ✓ MCP 服务已启动 (PID: $MCP_PID)"

  # 等待服务就绪
  sleep 3
  if ps -p $MCP_PID > /dev/null; then
    echo "   ✓ MCP 服务运行中 (http://localhost:8001/mcp)"
  else
    echo "   ❌ MCP 服务启动失败，查看日志: $MCP_DIR/mcp-server.log"
    exit 1
  fi
else
  echo "✓ Backend MCP 服务已在运行 (端口 8001)"
fi

echo ""
echo "📋 配置检查:"
echo "   Backend API: $(arti config get backend.enabled | awk '{print $NF}')"
echo "   Backend URL: $(arti config get backend.url | awk -F'"' '{print $2}')"
echo ""

# 设置开发环境变量
export ARTI_BILLING_BYPASS=true

echo "✅ 开发环境就绪"
echo ""
echo "💡 使用示例:"
echo "   arti quote AAPL 0700.HK 600519.SS"
echo "   arti scan 600519.SS"
echo "   arti market"
echo ""
echo "🛑 停止服务: pkill -f 'python server.py'"
