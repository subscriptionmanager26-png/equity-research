#!/usr/bin/env python3
"""Pick a diversified 10-name 2Y book from the Nifty Total Market prices DB."""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

SECTOR: dict[str, str] = {
    "HDFCBANK": "banks",
    "ICICIBANK": "banks",
    "SBIN": "banks",
    "KOTAKBANK": "banks",
    "AXISBANK": "banks",
    "FEDERALBNK": "banks",
    "BANKBARODA": "banks",
    "TCS": "it",
    "INFY": "it",
    "HCLTECH": "it",
    "WIPRO": "it",
    "TECHM": "it",
    "ITC": "fmcg",
    "HINDUNILVR": "fmcg",
    "BRITANNIA": "fmcg",
    "LT": "industrials",
    "ABB": "industrials",
    "BHEL": "industrials",
    "SIEMENS": "industrials",
    "HAL": "defence",
    "BEL": "defence",
    "M&M": "auto",
    "MARUTI": "auto",
    "SUNPHARMA": "pharma",
    "DRREDDY": "pharma",
    "POWERGRID": "utilities",
    "NTPC": "utilities",
    "CDSL": "financial_infra",
    "BSE": "financial_infra",
    "BHARTIARTL": "telecom",
    "INDHOTEL": "travel",
}

# Quality ballast for 2Y holds when 1Y momentum screen is thin (still in universe metrics).
BALLAST = ["ICICIBANK", "SUNPHARMA", "LT", "ITC", "HDFCBANK"]


def db_path() -> Path:
    p = os.environ.get("PRICES_DB_PATH")
    if p and Path(p).is_file():
        return Path(p)
    default = Path.home() / ".local/share/equity-research/prices/nifty-total-market-2y.sqlite"
    marker = default.parent / "PRICES_DB_PATH"
    if marker.is_file():
        return Path(marker.read_text().strip())
    return default


def load(conn: sqlite3.Connection) -> dict[str, dict]:
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
        out[sym] = {
            "symbol": sym,
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


def score(row: dict) -> float | None:
    if row["above_ma_200"] is not True:
        return None
    if row["median_volume"] < 2_000_000:
        return None
    if row["return_1y"] > 0.85 or row["return_1y"] < 0.08:
        return None
    if row["volatility_1y"] > 0.45:
        return None
    return (
        row["sharpe_12_6m"] * 0.55
        + row["return_1y"] * 0.35
        - row["volatility_1y"] * 0.1
    )


def pick_ten(rows: dict[str, dict]) -> list[dict]:
    ranked = []
    for sym, row in rows.items():
        sc = score(row)
        if sc is None:
            continue
        ranked.append({**row, "score": sc, "source": "momentum_screen"})
    ranked.sort(key=lambda x: x["score"], reverse=True)

    picked: list[dict] = []
    sector_count: dict[str, int] = {}

    def add(row: dict, source: str) -> bool:
        sec = row["sector"]
        if sector_count.get(sec, 0) >= 2:
            return False
        if any(p["symbol"] == row["symbol"] for p in picked):
            return False
        picked.append({**row, "source": source})
        sector_count[sec] = sector_count.get(sec, 0) + 1
        return True

    for row in ranked:
        add(row, "momentum_screen")
        if len(picked) >= 10:
            break

    if len(picked) < 10:
        for sym in BALLAST:
            if sym not in rows:
                continue
            row = rows[sym]
            if row["above_ma_200"] is not True:
                continue
            ballast = {
                **row,
                "score": row["sharpe_12_6m"],
                "source": "quality_ballast",
            }
            add(ballast, "quality_ballast")
            if len(picked) >= 10:
                break

    for row in ranked:
        if len(picked) >= 10:
            break
        if any(p["symbol"] == row["symbol"] for p in picked):
            continue
        picked.append(row)
    return picked[:10]


def main() -> None:
    path = db_path()
    if not path.is_file():
        raise SystemExit(f"Prices DB not found: {path}")

    conn = sqlite3.connect(path)
    rows = load(conn)
    as_of = conn.execute("SELECT computed_at FROM symbol_metrics LIMIT 1").fetchone()
    meta_adj = conn.execute(
        "SELECT value FROM build_meta WHERE key='adjusted_build' LIMIT 1"
    ).fetchone()
    conn.close()

    picks = pick_ten(rows)
    payload = {
        "db_path": str(path),
        "metrics_as_of": as_of[0] if as_of else None,
        "adjusted_build": json.loads(meta_adj[0]) if meta_adj else None,
        "methodology": {
            "universe": "Nifty Total Market (~752 symbols)",
            "filters": "MA200, med vol >=2M, 1Y return 8-85%, vol <=45%",
            "rank": "0.55*avg_sharpe_12_6m + 0.35*1Y_return - 0.1*vol",
            "diversification": "max 2 per sector; quality ballast if <10",
        },
        "picks": picks,
    }
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()