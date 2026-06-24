#!/bin/bash
# ARTI CLI 开发模式启动脚本
#
# CLI 是生产后端的瘦客户端，直接使用线上生产函数，
# 不再需要本地 Backend MCP / Python 服务。

set -e

echo "🚀 准备 ARTI CLI 开发环境"
echo ""

npm install
npm run build
npm link

echo ""
echo "✅ 构建完成。下一步："
echo "   arti login            # 登录"
echo "   arti quick-scan AAPL  # 快速扫描"
echo "   arti                  # 进入交互终端（直接打字）"
