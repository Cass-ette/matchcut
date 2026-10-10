#!/bin/zsh
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "${0:A:h}"

if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 22.13 或更新版本：https://nodejs.org/'
  read '?按回车退出。'
  exit 1
fi

if [[ ! -d node_modules ]]; then
  print '首次启动，正在安装依赖…'
  npm ci
fi
if ! npm run service:start; then
  read '?启动失败，按回车退出。'
  exit 1
fi
open "http://127.0.0.1:${PORT:-4317}"
