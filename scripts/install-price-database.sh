#!/usr/bin/env bash
# Download the Nifty Total Market price database into the agent environment.
# Idempotent: skips download when the installed SQLite file matches manifest sha256.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST_FILE="${PRICES_MANIFEST_FILE:-$ROOT/data/prices-manifest.json}"
DATA_DIR="${PRICES_DATA_DIR:-$HOME/.local/share/equity-research/prices}"
DB_FILE="$DATA_DIR/nifty-total-market-2y.sqlite"
GZ_FILE="$DATA_DIR/nifty-total-market-2y.sqlite.gz"
PATH_FILE="$DATA_DIR/PRICES_DB_PATH"

if [[ ! -f "$MANIFEST_FILE" ]]; then
  echo "[prices-db] manifest not found: $MANIFEST_FILE" >&2
  exit 1
fi

read_manifest() {
  python3 - "$MANIFEST_FILE" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1], encoding="utf-8"))
print(manifest.get("sha256", ""))
print(manifest.get("download_url", ""))
PY
}

mapfile -t MANIFEST_VALUES < <(read_manifest)
EXPECTED_SHA="${MANIFEST_VALUES[0]:-}"
DOWNLOAD_URL="${MANIFEST_VALUES[1]:-}"

if [[ -z "$EXPECTED_SHA" || -z "$DOWNLOAD_URL" ]]; then
  echo "[prices-db] manifest missing sha256 or download_url" >&2
  exit 1
fi

mkdir -p "$DATA_DIR"

file_sha256() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo ""
    return 0
  fi
  sha256sum "$file" | awk '{print $1}'
}

CURRENT_SHA="$(file_sha256 "$DB_FILE")"
if [[ "$CURRENT_SHA" == "$EXPECTED_SHA" ]]; then
  echo "[prices-db] already installed at $DB_FILE"
  printf '%s\n' "$DB_FILE" > "$PATH_FILE"
  exit 0
fi

echo "[prices-db] downloading $(basename "$GZ_FILE")"
curl -fsSL -o "$GZ_FILE" "$DOWNLOAD_URL"

echo "[prices-db] decompressing"
gunzip -f "$GZ_FILE"

if [[ "$(file_sha256 "$DB_FILE")" != "$EXPECTED_SHA" ]]; then
  echo "[prices-db] sha256 mismatch after install (expected $EXPECTED_SHA)" >&2
  exit 1
fi

printf '%s\n' "$DB_FILE" > "$PATH_FILE"
echo "[prices-db] installed at $DB_FILE"
