#!/bin/zsh
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "${0:A:h}"

if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 22 或更新版本：https://nodejs.org/'
  read '?按回车退出。'
  exit 1
fi

if curl -fsS --max-time 2 http://127.0.0.1:4317/api/health 2>/dev/null | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("app")=="matchcut" else 1)' 2>/dev/null; then
  open http://127.0.0.1:4317
  exit 0
fi

if [[ ! -d node_modules ]]; then
  print '首次启动，正在安装依赖…'
  npm ci
fi
if [[ ! -f dist/index.html ]]; then
  npm run build
fi

print 'Matchcut 正在启动。保留这个窗口，关闭窗口会停止本地服务。'
(
  for attempt in {1..30}; do
    if curl -fsS --max-time 1 http://127.0.0.1:4317/api/health >/dev/null 2>&1; then
      open http://127.0.0.1:4317
      break
    fi
    sleep 1
  done
) &
npm start
