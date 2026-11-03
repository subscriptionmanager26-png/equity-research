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
print(manifest.get("manifest_url", ""))
print(manifest.get("gzip_size_bytes", ""))
PY
}

mapfile -t MANIFEST_VALUES < <(read_manifest)
EXPECTED_SHA="${MANIFEST_VALUES[0]:-}"
DOWNLOAD_URL="${MANIFEST_VALUES[1]:-}"
MANIFEST_URL="${MANIFEST_VALUES[2]:-}"
GZIP_SIZE="${MANIFEST_VALUES[3]:-}"

if [[ -z "$EXPECTED_SHA" || -z "$DOWNLOAD_URL" ]]; then
  echo "[prices-db] manifest missing sha256 or download_url" >&2
  exit 1
fi

if [[ "${PRICES_SKIP_REMOTE_MANIFEST_CHECK:-0}" != "1" && -n "$MANIFEST_URL" ]]; then
  REMOTE_SHA="$(curl -fsSL "$MANIFEST_URL" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sha256','').lower())")"
  if [[ -n "$REMOTE_SHA" && "$REMOTE_SHA" != "${EXPECTED_SHA,,}" ]]; then
    echo "[prices-db] committed manifest sha256 (${EXPECTED_SHA}) does not match published manifest (${REMOTE_SHA})" >&2
    echo "[prices-db] update data/prices-manifest.json: bash scripts/sync-prices-manifest.sh" >&2
    exit 1
  fi
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

if [[ -n "$GZIP_SIZE" ]]; then
  ACTUAL_GZ_SIZE="$(stat -c%s "$GZ_FILE" 2>/dev/null || stat -f%z "$GZ_FILE")"
  if [[ "$ACTUAL_GZ_SIZE" != "$GZIP_SIZE" ]]; then
    echo "[prices-db] warning: gzip size ${ACTUAL_GZ_SIZE} != manifest gzip_size_bytes ${GZIP_SIZE} (blob may have been republished)" >&2
  fi
fi

echo "[prices-db] decompressing"
gunzip -f "$GZ_FILE"

ACTUAL_SHA="$(file_sha256 "$DB_FILE")"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "[prices-db] sha256 mismatch after install (expected ${EXPECTED_SHA}, got ${ACTUAL_SHA})" >&2
  if [[ -n "$MANIFEST_URL" ]]; then
    echo "[prices-db] sync committed manifest: bash scripts/sync-prices-manifest.sh" >&2
  fi
  exit 1
fi

printf '%s\n' "$DB_FILE" > "$PATH_FILE"
echo "[prices-db] installed at $DB_FILE"
