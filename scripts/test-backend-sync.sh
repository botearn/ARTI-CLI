#!/bin/bash
# Backend 同步功能测试脚本
# 用法: ./scripts/test-backend-sync.sh

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ARTI CLI Backend 同步功能测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
PASS=0
FAIL=0

test_case() {
  echo -e "\n${YELLOW}▶ $1${NC}"
}

assert_success() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
  else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
  fi
}

assert_file_exists() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓ $1 存在${NC}"
    ((PASS++))
  else
    echo -e "${RED}✗ $1 缺失${NC}"
    ((FAIL++))
  fi
}

# ━━━ Phase 1: 构建验证 ━━━
test_case "测试 1: 项目构建"
npm run build > /dev/null 2>&1
assert_success

# ━━━ Phase 2: 文件完整性检查 ━━━
test_case "测试 2: 核心文件存在性"
assert_file_exists "dist/index.js"
assert_file_exists "src/api.ts"
assert_file_exists "src/config.ts"
assert_file_exists "src/data/hybrid.ts"
assert_file_exists "src/commands/product.ts"

test_case "测试 3: Prompts 同步验证"
assert_file_exists "prompts/layer1/natasha.yaml"
assert_file_exists "prompts/layer1/steve_a.yaml"
assert_file_exists "prompts/layer1/tony.yaml"
assert_file_exists "prompts/layer2/value_guardian.yaml"
assert_file_exists "prompts/panorama_synthesizer.yaml"
assert_file_exists "prompts/synthesizer.yaml"
assert_file_exists "prompts/TERMINOLOGY.md"

# ━━━ Phase 3: 配置验证 ━━━
test_case "测试 4: 配置系统"
node -e "
const { loadConfig } = require('./dist/index.js');
const config = loadConfig();
if (!config.backend) {
  console.error('backend 配置缺失');
  process.exit(1);
}
if (typeof config.backend.enabled !== 'boolean') {
  console.error('backend.enabled 类型错误');
  process.exit(1);
}
console.log('✓ 配置结构正确');
" 2>&1
assert_success

# ━━━ Phase 4: API 客户端函数检查 ━━━
test_case "测试 5: Backend API 函数导出"
node -e "
const api = require('./dist/index.js');
const functions = [
  'callBackend',
  'scanStockBackend',
  'generateReport',
  'streamOrchestratorBackend',
  'routeIntent',
];
for (const fn of functions) {
  if (typeof api[fn] !== 'function') {
    console.error(\`函数 \${fn} 未导出或类型错误\`);
    process.exit(1);
  }
}
console.log('✓ 所有 Backend API 函数已导出');
" 2>&1
assert_success

# ━━━ Phase 5: 环境变量测试 ━━━
test_case "测试 6: 环境变量覆盖"
ARTI_BACKEND_URL="https://test.example.com" \
ARTI_BACKEND_ENABLED="true" \
node -e "
const { loadConfig } = require('./dist/index.js');
const config = loadConfig();
if (config.backend.url !== 'https://test.example.com') {
  console.error('ARTI_BACKEND_URL 未生效');
  process.exit(1);
}
if (config.backend.enabled !== true) {
  console.error('ARTI_BACKEND_ENABLED 未生效');
  process.exit(1);
}
console.log('✓ 环境变量覆盖正常');
" 2>&1
assert_success

# ━━━ Phase 6: CLI 命令注册检查 ━━━
test_case "测试 7: 主产品命令注册"
./dist/index.js --help 2>&1 | grep -q "quick-scan"
assert_success

./dist/index.js --help 2>&1 | grep -q "full"
assert_success

./dist/index.js --help 2>&1 | grep -q "deep"
assert_success

# ━━━ 总结 ━━━
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  测试结果: ${GREEN}${PASS} 通过${NC} / ${RED}${FAIL} 失败${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ 所有测试通过！Backend 同步功能基础验证完成。${NC}"
  echo ""
  echo "下一步:"
  echo "  1. 配置 Backend URL:"
  echo "     export ARTI_BACKEND_URL=https://api-gateway-xxx.up.railway.app"
  echo ""
  echo "  2. 测试 scan 命令:"
  echo "     arti scan AAPL"
  echo ""
  echo "  3. 测试主产品命令:"
  echo "     arti quick-scan AAPL"
  echo "     arti full AAPL"
  echo "     arti deep AAPL"
  exit 0
else
  echo -e "${RED}✗ 部分测试失败，请检查上述错误。${NC}"
  exit 1
fi
