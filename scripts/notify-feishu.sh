#!/bin/bash
VERSION=$(node -p "require('./package.json').version")
curl -s -X POST "https://open.feishu.cn/open-apis/bot/v2/hook/b6a871a8-0488-4e11-8519-743ae458a452" \
  -H "Content-Type: application/json" \
  -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"🚀 artifin-cli v${VERSION} 已发布到 npm\nhttps://www.npmjs.com/package/artifin-cli\"}}"
