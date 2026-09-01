#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${RELAY_PORT:-43147}"
LOG="/tmp/relay-localtunnel.log"
rm -f "$LOG"

pkill -f "localtunnel --port ${PORT}" 2>/dev/null || true
sleep 1

npx --yes localtunnel --port "$PORT" --local-host 127.0.0.1 >"$LOG" 2>&1 &
LT_PID=$!

URL=""
for _ in $(seq 1 30); do
  URL=$(rg -o 'https://[a-z0-9-]+\.loca\.lt' "$LOG" | head -1 || true)
  if [[ -n "$URL" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$URL" ]]; then
  echo "localtunnel failed to start. Log:" >&2
  cat "$LOG" >&2
  kill "$LT_PID" 2>/dev/null || true
  exit 1
fi

echo "$URL" > /tmp/relay-public-url.txt
python3 - <<PY
from pathlib import Path
url = "${URL}"
path = Path(".env.local")
lines = path.read_text().splitlines() if path.exists() else []
out = []
seen = False
for line in lines:
    if line.startswith("PUBLIC_URL="):
        out.append(f"PUBLIC_URL={url}")
        seen = True
    else:
        out.append(line)
if not seen:
    out.append(f"PUBLIC_URL={url}")
path.write_text("\n".join(out) + "\n")
PY

echo "PUBLIC_URL=$URL (pid $LT_PID, log $LOG)"
