#!/usr/bin/env bash
# Copy published blob manifest fields into data/prices-manifest.json (keeps repo-only keys).
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

keep_local = ("manifest_url", "proxy_manifest_url", "install_path")
for key, value in remote.items():
    if key in keep_local:
        continue
    local[key] = value

with open(path, "w", encoding="utf-8") as f:
    json.dump(local, f, indent=2)
    f.write("\n")

print(f"[prices-manifest] synced {path} from {url}")
print(f"[prices-manifest] sha256={local.get('sha256', '')}")
PY
