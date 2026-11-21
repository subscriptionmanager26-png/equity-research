#!/usr/bin/env bash
# Build Nifty Total Market ~2Y SQLite locally when Vercel Blob download is unavailable (403).
# Uses kushagra-agarwal-a/momentum-screen-builder engine (NSE bhavcopy + CA adjust + metrics).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${PRICES_DATA_DIR:-$HOME/.local/share/equity-research/prices}"
DB_FILE="$DATA_DIR/nifty-total-market-2y.sqlite"
PATH_FILE="$DATA_DIR/PRICES_DB_PATH"
BUILDER_DIR="${PRICES_BUILDER_DIR:-$HOME/.local/share/equity-research/momentum-screen-builder}"
BUILDER_REPO="${PRICES_BUILDER_GIT_URL:-https://github.com/kushagra-agarwal-a/momentum-screen-builder.git}"
YEARS="${PRICES_BUILD_YEARS:-2}"

mkdir -p "$DATA_DIR"

if [[ ! -d "$BUILDER_DIR/.git" ]]; then
  echo "[prices-build] cloning momentum-screen-builder into $BUILDER_DIR"
  git clone --depth 1 "$BUILDER_REPO" "$BUILDER_DIR"
else
  echo "[prices-build] updating momentum-screen-builder"
  git -C "$BUILDER_DIR" pull --ff-only origin main || true
fi

echo "[prices-build] installing Python deps"
python3 -m pip install --user -q -r "$BUILDER_DIR/requirements.txt"

export PRICES_MANIFEST_URL=""
export USE_SHARED_PRICES_DB=0
export PYTHONPATH="$BUILDER_DIR"

echo "[prices-build] syncing ~${YEARS}Y Nifty Total Market bhavcopy (this takes several minutes)"
python3 -m engine.adjusted_db "$YEARS"

echo "[prices-build] computing symbol_metrics"
(cd "$BUILDER_DIR" && PYTHONPATH=. python3 -c "
import json
from engine.adjusted_db import DB_PATH, _conn
from engine.metrics_store import compute_universe_metrics
from engine.universe import fetch_index_symbols
symbols = fetch_index_symbols('is_nifty_total_market')
conn = _conn()
result = compute_universe_metrics(conn, symbols)
conn.close()
print(json.dumps({'metrics': result, 'db_path': str(DB_PATH)}, indent=2))
")

SRC_DB="$BUILDER_DIR/data/prices.sqlite"
if [[ ! -f "$SRC_DB" ]]; then
  echo "[prices-build] expected DB missing: $SRC_DB" >&2
  exit 1
fi

cp -f "$SRC_DB" "$DB_FILE"
ACTUAL_SHA="$(sha256sum "$DB_FILE" | awk '{print $1}')"
printf '%s\n' "$DB_FILE" > "$PATH_FILE"
echo "[prices-build] installed at $DB_FILE (sha256=$ACTUAL_SHA)"
echo "[prices-build] note: run sync-prices-manifest only after republishing blob; local sha256 may differ from data/prices-manifest.json"