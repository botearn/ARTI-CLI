#!/bin/bash
# 创建新 RFC 的辅助脚本

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RFC_DIR="$PROJECT_ROOT/rfcs"

# 获取下一个 RFC 编号
get_next_rfc_number() {
    local year=$(date +%Y)
    local max_num=0

    if [ -d "$RFC_DIR/$year" ]; then
        for file in "$RFC_DIR/$year"/RFC-$year-*.md; do
            if [ -f "$file" ]; then
                num=$(basename "$file" | sed -n "s/RFC-$year-\([0-9]\{4\}\)-.*/\1/p")
                if [ -n "$num" ]; then
                    num=$((10#$num))  # 转换为十进制
                    if [ $num -gt $max_num ]; then
                        max_num=$num
                    fi
                fi
            fi
        done
    fi

    next_num=$((max_num + 1))
    printf "%04d" $next_num
}

# 交互式输入
echo -e "${BLUE}=== ARTI CLI RFC 创建工具 ===${NC}\n"

# 1. RFC 标题
echo -e "${GREEN}1. 请输入 RFC 标题（英文，kebab-case）：${NC}"
echo -e "   示例: backend-mcp-integration, credit-system-v2"
read -p "   标题: " TITLE

if [ -z "$TITLE" ]; then
    echo -e "${YELLOW}错误：标题不能为空${NC}"
    exit 1
fi

# 2. RFC 中文描述
echo -e "\n${GREEN}2. 请输入 RFC 简短描述（中文，1-2句话）：${NC}"
read -p "   描述: " DESCRIPTION

# 3. 作者
echo -e "\n${GREEN}3. 请输入作者名称：${NC}"
read -p "   作者 [默认: $(git config user.name || echo "Unknown")]: " AUTHOR
AUTHOR=${AUTHOR:-$(git config user.name || echo "Unknown")}

# 4. 生成 RFC 编号和文件名
YEAR=$(date +%Y)
RFC_NUM=$(get_next_rfc_number)
RFC_ID="RFC-$YEAR-$RFC_NUM"
RFC_FILENAME="$RFC_ID-$TITLE.md"
RFC_PATH="$RFC_DIR/$YEAR/$RFC_FILENAME"
CURRENT_DATE=$(date +%Y-%m-%d)

# 5. 确认信息
echo -e "\n${BLUE}=== 确认信息 ===${NC}"
echo -e "RFC 编号: ${GREEN}$RFC_ID${NC}"
echo -e "标题: ${GREEN}$TITLE${NC}"
echo -e "描述: ${GREEN}$DESCRIPTION${NC}"
echo -e "作者: ${GREEN}$AUTHOR${NC}"
echo -e "文件路径: ${GREEN}$RFC_PATH${NC}"
echo ""
read -p "确认创建？[y/N] " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}已取消${NC}"
    exit 0
fi

# 6. 创建年份目录（如果不存在）
mkdir -p "$RFC_DIR/$YEAR"

# 7. 从模板创建 RFC
if [ ! -f "$RFC_DIR/template.md" ]; then
    echo -e "${YELLOW}警告：模板文件不存在，使用基础模板${NC}"
    cat > "$RFC_PATH" << EOF
# $RFC_ID: $TITLE

## 元数据

- **RFC 编号**: $RFC_ID
- **标题**: $DESCRIPTION
- **作者**: $AUTHOR
- **状态**: Draft
- **创建日期**: $CURRENT_DATE
- **最后更新**: $CURRENT_DATE

## 摘要

[用 2-3 句话描述这个 RFC]

## 动机

### 问题陈述

[当前存在什么问题？]

## 详细设计

[设计方案]

## 权衡与替代方案

[为什么选择这个方案？]
EOF
else
    # 使用模板并替换占位符
    cp "$RFC_DIR/template.md" "$RFC_PATH"

    # macOS 和 Linux 兼容的 sed
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/RFC-YYYY-NNNN/$RFC_ID/g" "$RFC_PATH"
        sed -i '' "s/YYYY-MM-DD/$CURRENT_DATE/g" "$RFC_PATH"
        sed -i '' "s/\[你的名字\]/$AUTHOR/g" "$RFC_PATH"
        sed -i '' "s/\[简短标题\]/$DESCRIPTION/g" "$RFC_PATH"
        sed -i '' "1s/.*/# $RFC_ID: $TITLE/" "$RFC_PATH"
    else
        sed -i "s/RFC-YYYY-NNNN/$RFC_ID/g" "$RFC_PATH"
        sed -i "s/YYYY-MM-DD/$CURRENT_DATE/g" "$RFC_PATH"
        sed -i "s/\[你的名字\]/$AUTHOR/g" "$RFC_PATH"
        sed -i "s/\[简短标题\]/$DESCRIPTION/g" "$RFC_PATH"
        sed -i "1s/.*/# $RFC_ID: $TITLE/" "$RFC_PATH"
    fi
fi

# 8. 更新 INDEX.md
INDEX_FILE="$RFC_DIR/INDEX.md"

# 在 Draft 部分添加
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "/^## 📝 Draft（草稿）/a\\
\\
| RFC | 标题 | 创建日期 | 作者 |\\
|---|---|---|---|\\
| [$RFC_ID]($YEAR/$RFC_FILENAME) | $DESCRIPTION | $CURRENT_DATE | $AUTHOR |
" "$INDEX_FILE"
else
    sed -i "/^## 📝 Draft（草稿）/a\\
\\
| RFC | 标题 | 创建日期 | 作者 |\\
|---|---|---|---|\\
| [$RFC_ID]($YEAR/$RFC_FILENAME) | $DESCRIPTION | $CURRENT_DATE | $AUTHOR |
" "$INDEX_FILE"
fi

# 更新统计信息
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/^| Draft | [0-9]* |/| Draft | 1 |/" "$INDEX_FILE"
    sed -i '' "s/^| \*\*总计\*\* | \*\*[0-9]*\*\* |/| **总计** | **$(grep -c "^| \[RFC-" "$INDEX_FILE" || echo 0)** |/" "$INDEX_FILE"
else
    sed -i "s/^| Draft | [0-9]* |/| Draft | 1 |/" "$INDEX_FILE"
    sed -i "s/^| \*\*总计\*\* | \*\*[0-9]*\*\* |/| **总计** | **$(grep -c "^| \[RFC-" "$INDEX_FILE" || echo 0)** |/" "$INDEX_FILE"
fi

# 9. 完成
echo -e "\n${GREEN}✅ RFC 创建成功！${NC}"
echo -e "\n下一步："
echo -e "  1. 编辑 RFC: ${BLUE}$RFC_PATH${NC}"
echo -e "  2. 填写完整后，更新状态为 Proposed"
echo -e "  3. 提交更改: ${BLUE}git add rfcs/ && git commit -m \"$RFC_ID: $DESCRIPTION\"${NC}"
echo -e "\n推荐使用 VS Code 或其他 Markdown 编辑器打开文件。"
