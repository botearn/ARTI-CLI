#!/bin/sh
# ARTI CLI 一行安装脚本
#   curl -fsSL https://artifin.ai/cli/install.sh | bash
#
# 通过 npm 全局安装 artifin-cli（生产后端产品函数，无需本地 Python）。
# 纯 POSIX sh，无交互，对 `curl | bash` 友好。

set -e

PKG="artifin-cli"
MIN_NODE_MAJOR=18

# ── 颜色（仅 TTY 启用） ──
if [ -t 1 ]; then
  BOLD="$(printf '\033[1m')"; DIM="$(printf '\033[2m')"
  GREEN="$(printf '\033[32m')"; YELLOW="$(printf '\033[33m')"
  CYAN="$(printf '\033[36m')"; RED="$(printf '\033[31m')"; RESET="$(printf '\033[0m')"
else
  BOLD=""; DIM=""; GREEN=""; YELLOW=""; CYAN=""; RED=""; RESET=""
fi

info() { printf '%s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
err()  { printf '  %s✗%s %s\n' "$RED" "$RESET" "$*" >&2; }

printf '\n%s  ARTI CLI 安装程序%s\n' "$BOLD$CYAN" "$RESET"
printf '%s  智能投研命令行工具 — 美股 / 港股 / A 股%s\n\n' "$DIM" "$RESET"

# ── 1. 检测 Node.js（>=18） ──
if ! command -v node >/dev/null 2>&1; then
  err "未检测到 Node.js（需要 >= ${MIN_NODE_MAJOR}）"
  info ""
  info "  请先安装 Node.js，任选其一："
  info "    • 官网:     ${CYAN}https://nodejs.org/${RESET}"
  info "    • nvm:      ${CYAN}curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash${RESET}"
  info "    • Homebrew: ${CYAN}brew install node${RESET}"
  info ""
  info "  装好后重新运行本命令即可。"
  exit 1
fi

NODE_VER="$(node -v 2>/dev/null | sed 's/^v//')"
NODE_MAJOR="$(printf '%s' "$NODE_VER" | cut -d. -f1)"
if [ -z "$NODE_MAJOR" ] || ! [ "$NODE_MAJOR" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null; then
  err "Node.js 版本过低：当前 v${NODE_VER}，需要 >= ${MIN_NODE_MAJOR}"
  info "  请升级 Node.js 后重试（https://nodejs.org/）。"
  exit 1
fi
ok "Node.js v${NODE_VER}"

# ── 2. 检测 npm ──
if ! command -v npm >/dev/null 2>&1; then
  err "未检测到 npm（通常随 Node.js 一起安装）"
  info "  请重新安装 Node.js（含 npm）后重试。"
  exit 1
fi
ok "npm $(npm -v 2>/dev/null)"

# ── 3. 全局安装 ──
info ""
printf '  %s..%s 安装 %s%s%s ...\n' "$DIM" "$RESET" "$BOLD" "$PKG" "$RESET"
if ! npm install -g "$PKG" --no-fund --no-audit; then
  err "全局安装失败（多为权限问题）"
  info ""
  info "  可尝试任一方式："
  info "    • 用 sudo:    ${CYAN}sudo npm install -g ${PKG}${RESET}"
  info "    • 用 nvm（推荐，免 sudo）: ${CYAN}https://github.com/nvm-sh/nvm${RESET}"
  info "    • 改全局前缀: ${CYAN}npm config set prefix ~/.npm-global${RESET}（并把其 bin 加入 PATH）"
  exit 1
fi

# ── 4. 校验 ──
if command -v arti >/dev/null 2>&1; then
  ok "arti $(arti --version 2>/dev/null || echo '')"
else
  warn "已安装 ${PKG}，但 'arti' 不在当前 PATH 中"
  info "  请确认 npm 全局 bin 在 PATH 内：${CYAN}npm prefix -g${RESET}/bin"
fi

# ── 5. 下一步 ──
printf '\n  %s✓ 安装完成%s\n\n' "$BOLD$GREEN" "$RESET"
info "  下一步："
info "    ${CYAN}arti login${RESET}                # 浏览器登录（推荐）"
info "    ${CYAN}arti quote AAPL 0700.HK${RESET}   # 试试实时行情"
info "    ${CYAN}arti${RESET}                       # 进入交互式投研终端"
info ""
info "  文档：${CYAN}https://artifin.ai/cli${RESET}"
info ""
