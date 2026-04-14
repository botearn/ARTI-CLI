#!/usr/bin/env bash
set -e

REPO="https://github.com/YuqingNicole/ARTI-CLI.git"
INSTALL_DIR="${ARTI_HOME:-$HOME/.arti}"

echo ""
echo "  ARTI CLI Installer"
echo "  ─────────────────────────────"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "  [x] Node.js not found. Please install Node.js >= 18 first."
  echo "      https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "  [x] Node.js >= 18 required (found v$(node -v))"
  exit 1
fi
echo "  [ok] Node.js $(node -v)"

# Check Python
PYTHON=""
if command -v python3 &>/dev/null; then
  PYTHON="python3"
elif command -v python &>/dev/null; then
  PYTHON="python"
fi

if [ -z "$PYTHON" ]; then
  echo "  [x] Python not found. Please install Python >= 3.9 first."
  exit 1
fi
echo "  [ok] $($PYTHON --version)"

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
  echo "  [..] Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull --ff-only
else
  echo "  [..] Cloning ARTI CLI..."
  git clone "$REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Node dependencies + build
echo "  [..] Installing dependencies..."
npm install --no-fund --no-audit 2>/dev/null
echo "  [..] Building..."
npm run build 2>/dev/null

# Python venv + OpenBB
if [ ! -d ".venv" ]; then
  echo "  [..] Creating Python venv..."
  $PYTHON -m venv .venv
fi
echo "  [..] Installing OpenBB (this may take a minute)..."
.venv/bin/pip install -q openbb

# Link globally
echo "  [..] Linking arti command..."
npm link 2>/dev/null

echo ""
echo "  [ok] ARTI CLI installed successfully!"
echo ""
echo "  Run:  arti --help"
echo ""
