#!/usr/bin/env bash
# Fail when committed data/prices-manifest.json drifts from the published blob manifest.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST_FILE="${PRICES_MANIFEST_FILE:-$ROOT/data/prices-manifest.json}"

python3 - "$MANIFEST_FILE" <<'PY'
import json
import sys
import urllib.request

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    local = json.load(f)

url = local.get("manifest_url")
if not url:
    print("[prices-manifest] manifest_url missing in local file", file=sys.stderr)
    sys.exit(1)

with urllib.request.urlopen(url, timeout=120) as resp:
    remote = json.load(resp)

local_sha = (local.get("sha256") or "").lower()
remote_sha = (remote.get("sha256") or "").lower()
if local_sha == remote_sha:
    print(f"[prices-manifest] ok (sha256 matches published manifest)")
    sys.exit(0)

print(
    "[prices-manifest] committed manifest is stale:\n"
    f"  local sha256:  {local_sha}\n"
    f"  remote sha256: {remote_sha}\n"
    "  fix: bash scripts/sync-prices-manifest.sh",
    file=sys.stderr,
)
sys.exit(1)
PY
