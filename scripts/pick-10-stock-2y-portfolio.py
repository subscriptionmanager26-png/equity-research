#!/usr/bin/env python3
"""Tier-balanced 10-name picker from Nifty Total Market metrics DB (NSE price universe)."""
from __future__ import annotations

import csv
import io
import json
import os
import sqlite3
import urllib.request
from collections import Counter
from pathlib import Path

NIFTY_CSV_BASE = "https://www.niftyindices.com/IndexConstituent/"

TIER_FILES = {
    "n100": "ind_nifty100list.csv",
    "mid150": "ind_niftymidcap150list.csv",
    "small250": "ind_niftysmallcap250list.csv",
    "micro250": "ind_niftymicrocap250list.csv",
    "total": "ind_niftytotalmarket_list.csv",
}

# Target slots (sum = 10): force representation beyond large-cap momentum.
TIER_QUOTAS = {
    "large": 2,
    "mid": 2,
    "small": 3,
    "micro": 3,
}

TIER_MIN_MEDVOL = {
    "large": 800_000,
    "mid": 250_000,
    "small": 80_000,
    "micro": 40_000,
}

TIER_MAX_VOL = {
    "large": 0.50,
    "mid": 0.52,
    "small": 0.62,
    "micro": 0.70,
}

TIER_RETURN_BAND = {
    "large": (0.06, 0.90),
    "mid": (0.05, 1.00),
    "small": (0.04, 1.20),
    "micro": (0.03, 1.50),
}

# Prefer mapped sectors; fall back to "other".
SECTOR: dict[str, str] = {
    "HDFCBANK": "banks",
    "ICICIBANK": "banks",
    "SBIN": "banks",
    "KOTAKBANK": "banks",
    "FEDERALBNK": "banks",
    "BANKBARODA": "banks",
    "TCS": "it",
    "INFY": "it",
    "TECHM": "it",
    "ITC": "fmcg",
    "LT": "industrials",
    "BHEL": "industrials",
    "SUNPHARMA": "pharma",
    "BSE": "financial_infra",
    "INDHOTEL": "travel",
}


def db_path() -> Path:
    p = os.environ.get("PRICES_DB_PATH")
    if p and Path(p).is_file():
        return Path(p)
    default = Path.home() / ".local/share/equity-research/prices/nifty-total-market-2y.sqlite"
    marker = default.parent / "PRICES_DB_PATH"
    if marker.is_file():
        return Path(marker.read_text().strip())
    return default


def fetch_index_symbols(filename: str) -> set[str]:
    url = NIFTY_CSV_BASE + filename
    req = urllib.request.Request(url, headers={"User-Agent": "equity-research/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    return {(row.get("Symbol") or "").strip() for row in reader if (row.get("Symbol") or "").strip()}


def build_tier_map() -> dict[str, str]:
  sets = {k: fetch_index_symbols(fn) for k, fn in TIER_FILES.items()}
  n100 = sets["n100"]
  mid = sets["mid150"] - n100
  small = sets["small250"] - sets["mid150"] - n100
  micro = sets["micro250"] - sets["small250"] - sets["mid150"] - n100
  # Remaining Total Market names not in explicit size indices → treat as micro/smaller.
  total_rest = sets["total"] - sets["n100"] - sets["mid150"] - sets["small250"] - sets["micro250"]

  def tier(sym: str) -> str:
    if sym in n100:
      return "large"
    if sym in mid:
      return "mid"
    if sym in small:
      return "small"
    if sym in micro or sym in total_rest:
      return "micro"
    return "micro"

  all_syms = sets["total"] | sets["micro250"] | sets["small250"]
  return {sym: tier(sym) for sym in all_syms}


def load(conn: sqlite3.Connection, tier_map: dict[str, str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for sym, close, mjson, ejson in conn.execute(
        "SELECT symbol, close, metrics_json, extras_json FROM symbol_metrics"
    ):
        m = json.loads(mjson)
        e = json.loads(ejson)
        sh = m.get("average_sharpe_return_12_6_months")
        r1 = m.get("absolute_return_1_year")
        vol = m.get("volatility_1_year")
        if sh is None or r1 is None or vol is None:
            continue
        cap_tier = tier_map.get(sym, "micro")
        out[sym] = {
            "symbol": sym,
            "cap_tier": cap_tier,
            "sector": SECTOR.get(sym, "other"),
            "close": close,
            "sharpe_12_6m": sh,
            "return_1y": r1,
            "volatility_1y": vol,
            "median_volume": e.get("median_volume") or 0,
            "above_ma_200": e.get("above_ma_200"),
            "pct_pos_1y": e.get("pct_pos_1y"),
        }
    return out


def passes_filters(row: dict) -> bool:
    tier = row["cap_tier"]
    if row["above_ma_200"] is not True:
        return False
    mv = row["median_volume"]
    if mv < TIER_MIN_MEDVOL.get(tier, 40_000):
        return False
    lo, hi = TIER_RETURN_BAND.get(tier, (0.03, 1.5))
    if row["return_1y"] < lo or row["return_1y"] > hi:
        return False
    if row["volatility_1y"] > TIER_MAX_VOL.get(tier, 0.7):
        return False
    return True


def score_row(row: dict) -> float:
    return row["sharpe_12_6m"] * 0.55 + row["return_1y"] * 0.35 - row["volatility_1y"] * 0.08


def pick_ten(rows: dict[str, dict]) -> tuple[list[dict], dict[str, int]]:
    buckets: dict[str, list[dict]] = {t: [] for t in TIER_QUOTAS}
    funnel = Counter()

    for sym, row in rows.items():
        funnel["universe"] += 1
        if row["above_ma_200"] is True:
            funnel["above_ma200"] += 1
        if not passes_filters(row):
            continue
        funnel[f"eligible_{row['cap_tier']}"] += 1
        buckets[row["cap_tier"]].append({**row, "score": score_row(row)})

    for tier in buckets:
        buckets[tier].sort(key=lambda x: x["score"], reverse=True)

    picked: list[dict] = []
    sector_count: dict[str, int] = {}

    def try_add(row: dict) -> bool:
        if any(p["symbol"] == row["symbol"] for p in picked):
            return False
        sec = row["sector"]
        if sector_count.get(sec, 0) >= 2 and sec != "other":
            return False
        picked.append({**row, "source": "tier_momentum"})
        sector_count[sec] = sector_count.get(sec, 0) + 1
        return True

    for tier, quota in TIER_QUOTAS.items():
        n = 0
        for row in buckets.get(tier, []):
            if n >= quota:
                break
            if try_add(row):
                n += 1

    # Fill any empty slots from global ranked pool (still tier-aware order).
    if len(picked) < 10:
        pool = []
        for tier in ("large", "mid", "small", "micro"):
            pool.extend(buckets.get(tier, []))
        pool.sort(key=lambda x: x["score"], reverse=True)
        tier_counts = Counter(p["cap_tier"] for p in picked)
        for row in pool:
            if len(picked) >= 10:
                break
            if tier_counts[row["cap_tier"]] >= TIER_QUOTAS[row["cap_tier"]]:
                continue
            if try_add(row):
                tier_counts[row["cap_tier"]] += 1

    return picked[:10], dict(funnel)


def main() -> None:
    path = db_path()
    if not path.is_file():
        raise SystemExit(f"Prices DB not found: {path}")

    tier_map = build_tier_map()
    conn = sqlite3.connect(path)
    rows = load(conn, tier_map)
    as_of = conn.execute("SELECT computed_at FROM symbol_metrics LIMIT 1").fetchone()
    conn.close()

    picks, funnel = pick_ten(rows)
    payload = {
        "db_path": str(path),
        "metrics_as_of": as_of[0] if as_of else None,
        "universe_note": (
            "Metrics cover Nifty Total Market (~746 NSE symbols with 2Y adjusted EOD). "
            "Full NSE EQ (~3.5k) and BSE listings are not in this SQLite; "
            "bhavcopy-wide build is a separate job."
        ),
        "tier_quotas": TIER_QUOTAS,
        "filter_funnel": funnel,
        "methodology": {
            "rank": "0.55*avg_sharpe_12_6m + 0.35*1Y_return - 0.08*vol",
            "liquidity": TIER_MIN_MEDVOL,
            "diversification": "cap-tier quotas + max 2 per mapped sector",
            "no_large_cap_ballast": True,
        },
        "picks": picks,
    }
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()