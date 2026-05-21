#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BRIDGE="$ROOT/apps/bridge/dist/index.js"
if [ ! -f "$BRIDGE" ]; then
  BRIDGE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/dist/index.js"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js，请先安装 Node.js 20 或更高版本。" >&2
  exit 1
fi

if [ ! -f "$BRIDGE" ]; then
  echo "未找到 bridge 构建产物：$BRIDGE" >&2
  echo "请先在项目根目录运行 npm install 和 npm run build。" >&2
  exit 1
fi

exec node "$BRIDGE" "$@"
