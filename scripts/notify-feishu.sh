#!/bin/bash
# 飞书发布通知。Webhook 从环境变量 FEISHU_WEBHOOK_URL 读取（在 CI secret 中配置），
# 不再硬编码入库。未设置时跳过通知，不阻塞发布。
if [ -z "${FEISHU_WEBHOOK_URL}" ]; then
  echo "FEISHU_WEBHOOK_URL 未设置，跳过飞书发布通知"
  exit 0
fi
VERSION=$(node -p "require('./package.json').version")
curl -s -X POST "${FEISHU_WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"🚀 artifin-cli v${VERSION} 已发布到 npm\nhttps://www.npmjs.com/package/artifin-cli\"}}"
