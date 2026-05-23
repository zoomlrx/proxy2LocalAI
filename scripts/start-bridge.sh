#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BRIDGE="$ROOT/apps/bridge/dist/index.js"
if [ ! -f "$BRIDGE" ]; then
  BRIDGE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/dist/index.js"
fi

# 检查 Node.js 是否已安装
if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 Node.js，请先安装 Node.js 20 或更高版本。" >&2
  echo "  下载地址: https://nodejs.org/" >&2
  exit 1
fi

# 检查 Node.js 版本
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "错误：Node.js 版本过低 (当前 $(node --version))，需要 v20 或更高版本。" >&2
  echo "  下载地址: https://nodejs.org/" >&2
  exit 1
fi

# 检查构建产物是否存在
if [ ! -f "$BRIDGE" ]; then
  echo "错误：未找到 bridge 构建产物：$BRIDGE" >&2
  echo "  请先在项目根目录运行以下命令:" >&2
  echo "    npm install" >&2
  echo "    npm run build" >&2
  exit 1
fi

# 检查 node_modules 是否存在（仅在源码模式下）
REPO_BRIDGE="$ROOT/apps/bridge/dist/index.js"
if [ -f "$REPO_BRIDGE" ] && [ ! -d "$ROOT/node_modules" ]; then
  echo "警告：未检测到 node_modules，依赖可能未安装。" >&2
  echo "  建议运行: npm install" >&2
fi

# 运行 bridge，捕获失败并输出诊断提示
exec node "$BRIDGE" "$@"
