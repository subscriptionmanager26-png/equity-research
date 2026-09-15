#!/usr/bin/env python3
"""
Backtest and optimize a 4-asset MF portfolio using MFAPI NAV history.

Core sleeve (user request):
  - Invesco India Mid Cap Fund (Direct Growth)
  - Invesco India Small Cap Fund (Direct Growth)
  - Gold: longest-history option (SBI Gold ETF)
  - Nasdaq 100: longest-history Motilal option (Nasdaq 100 ETF)

Also tests candidate additions from prior research / category peers.
"""

from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from itertools import product
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.optimize import minimize

# ---------------------------------------------------------------------------
# Scheme registry (MFAPI codes, Direct Growth / longest-history variants)
# ---------------------------------------------------------------------------

SCHEMES: Dict[str, dict] = {
    "invesco_midcap": {
        "code": 120403,
        "label": "Invesco India Mid Cap (Direct Growth)",
        "role": "core",
    },
    "invesco_smallcap": {
        "code": 145137,
        "label": "Invesco India Small Cap (Direct Growth)",
        "role": "core",
    },
    # FoF chosen over ETF: MFAPI ETF series has unadjusted unit-change glitches
    # (e.g. SBI Gold ETF -99% day Jan-2022; Motilal Nasdaq ETF -90% day Jun-2021).
    # FoF NAVs are clean; gold FoF history from 2013, Nasdaq FoF from Dec-2018.
    "sbi_gold": {
        "code": 119788,
        "label": "SBI Gold Fund (Direct Growth) — clean proxy, data from 2013",
        "role": "core",
    },
    "motilal_nasdaq": {
        "code": 145552,
        "label": "Motilal Oswal Nasdaq 100 FoF (Direct Growth) — clean proxy, data from Dec-2018",
        "role": "core",
    },
    # Prior-session research + category challengers
    "boi_flexicap": {
        "code": 148404,
        "label": "Bank of India Flexi Cap (Direct Growth)",
        "role": "candidate",
    },
    "hdfc_midcap": {
        "code": 118989,
        "label": "HDFC Mid-Cap Opportunities (Direct Growth)",
        "role": "candidate",
    },
    "motilal_midcap": {
        "code": 127042,
        "label": "Motilal Oswal Midcap (Direct Growth)",
        "role": "candidate",
    },
    "nippon_smallcap": {
        "code": 145096,
        "label": "Nippon India Small Cap (Direct Growth)",
        "role": "candidate",
    },
    "ppfas_flexicap": {
        "code": 122639,
        "label": "Parag Parikh Flexi Cap (Direct Growth)",
        "role": "candidate",
    },
}

CORE_KEYS = [
    "invesco_midcap",
    "invesco_smallcap",
    "sbi_gold",
    "motilal_nasdaq",
]

RISK_FREE_ANNUAL = 0.065  # ~India 10Y / MIBOR proxy for long-run backtest
MIN_WEIGHT = 0.05
MAX_WEIGHT = 0.55
GRID_STEP = 0.05


@dataclass
class BacktestResult:
    weights: Dict[str, float]
    cagr: float
    vol: float
    sharpe: float
    max_drawdown: float
    calmar: float
    period_start: str
    period_end: str
    months: int


def fetch_nav_series(scheme_code: int) -> pd.Series:
    url = f"https://api.mfapi.in/mf/{scheme_code}"
    with urllib.request.urlopen(url, timeout=60) as resp:
        payload = json.load(resp)
    rows = []
    for row in payload["data"]:
        rows.append(
            {
                "date": datetime.strptime(row["date"], "%d-%m-%Y"),
                "nav": float(row["nav"]),
            }
        )
    df = pd.DataFrame(rows).sort_values("date").drop_duplicates("date", keep="last")
    s = df.set_index("date")["nav"]
    s.name = str(scheme_code)
    return s


def to_monthly_returns(nav: pd.Series, max_monthly_move: float = 0.35) -> pd.Series:
    """Month-end returns with outlier months flattened (MFAPI ETF glitches)."""
    month_end = nav.resample("ME").last().dropna()
    rets = month_end.pct_change()
    bad = rets.abs() > max_monthly_move
    if bad.any():
        cleaned = month_end.copy()
        for idx in rets.index[bad]:
            prev = cleaned.index[cleaned.index.get_loc(idx) - 1]
            cleaned.loc[idx] = cleaned.loc[prev]
        rets = cleaned.pct_change()
    return rets.dropna()


def align_returns(keys: List[str], nav_map: Dict[str, pd.Series]) -> pd.DataFrame:
    monthly = {k: to_monthly_returns(nav_map[k]) for k in keys}
    df = pd.DataFrame(monthly).dropna()
    return df


def portfolio_stats(
    weights: np.ndarray, returns: pd.DataFrame, ann_factor: int = 12
) -> Tuple[float, float, float, float, float]:
    w = np.asarray(weights, dtype=float)
    port_rets = returns.values @ w
    cum = np.cumprod(1 + port_rets)
    years = len(port_rets) / ann_factor
    cagr = cum[-1] ** (1 / years) - 1 if years > 0 else 0.0
    vol = port_rets.std(ddof=1) * math.sqrt(ann_factor)
    sharpe = (cagr - RISK_FREE_ANNUAL) / vol if vol > 0 else 0.0
    running_max = np.maximum.accumulate(cum)
    drawdowns = cum / running_max - 1
    max_dd = drawdowns.min()
    calmar = cagr / abs(max_dd) if max_dd < 0 else np.nan
    return cagr, vol, sharpe, max_dd, calmar


def make_result(
    keys: List[str], weights: Dict[str, float], returns: pd.DataFrame
) -> BacktestResult:
    w = np.array([weights[k] for k in keys])
    cagr, vol, sharpe, max_dd, calmar = portfolio_stats(w, returns)
    return BacktestResult(
        weights=weights,
        cagr=cagr,
        vol=vol,
        sharpe=sharpe,
        max_drawdown=max_dd,
        calmar=calmar,
        period_start=returns.index[0].strftime("%Y-%m-%d"),
        period_end=returns.index[-1].strftime("%Y-%m-%d"),
        months=len(returns),
    )


def optimize_max_sharpe(
    keys: List[str], returns: pd.DataFrame
) -> Dict[str, float]:
    n = len(keys)
    mu = returns.mean().values * 12
    cov = returns.cov().values * 12

    def neg_sharpe(w: np.ndarray) -> float:
        ret = w @ mu
        vol = math.sqrt(w @ cov @ w)
        return -(ret - RISK_FREE_ANNUAL) / vol if vol > 0 else 0.0

    cons = {"type": "eq", "fun": lambda w: np.sum(w) - 1.0}
    bounds = [(MIN_WEIGHT, MAX_WEIGHT)] * n
    x0 = np.ones(n) / n
    res = minimize(neg_sharpe, x0, method="SLSQP", bounds=bounds, constraints=cons)
    w = res.x if res.success else x0
    w = np.clip(w, MIN_WEIGHT, MAX_WEIGHT)
    w = w / w.sum()
    return {k: round(float(v), 4) for k, v in zip(keys, w)}


def optimize_min_variance(
    keys: List[str], returns: pd.DataFrame
) -> Dict[str, float]:
    n = len(keys)
    cov = returns.cov().values * 12

    def variance(w: np.ndarray) -> float:
        return w @ cov @ w

    cons = {"type": "eq", "fun": lambda w: np.sum(w) - 1.0}
    bounds = [(MIN_WEIGHT, MAX_WEIGHT)] * n
    x0 = np.ones(n) / n
    res = minimize(variance, x0, method="SLSQP", bounds=bounds, constraints=cons)
    w = res.x if res.success else x0
    w = np.clip(w, MIN_WEIGHT, MAX_WEIGHT)
    w = w / w.sum()
    return {k: round(float(v), 4) for k, v in zip(keys, w)}


def risk_parity_weights(keys: List[str], returns: pd.DataFrame) -> Dict[str, float]:
    vols = returns.std() * math.sqrt(12)
    inv = 1 / vols
    w = inv / inv.sum()
    w = w.clip(MIN_WEIGHT, MAX_WEIGHT)
    w = w / w.sum()
    return {k: round(float(v), 4) for k, v in w.items()}


def grid_search_best_sharpe(
    keys: List[str], returns: pd.DataFrame, step: float = GRID_STEP
) -> Dict[str, float]:
    """Exhaustive grid on 5% increments for n=4 assets."""
    n = len(keys)
    levels = np.arange(0, 1 + step, step)
    best_w: Optional[np.ndarray] = None
    best_sharpe = -np.inf

    # Generate compositions summing to 1
    if n == 4:
        for a, b, c in product(levels, repeat=3):
            d = 1.0 - a - b - c
            if d < 0 or d > 1:
                continue
            w = np.array([a, b, c, d])
            if (w < MIN_WEIGHT - 1e-9).any() or (w > MAX_WEIGHT + 1e-9).any():
                continue
            _, _, sharpe, _, _ = portfolio_stats(w, returns)
            if sharpe > best_sharpe:
                best_sharpe = sharpe
                best_w = w
    else:
        # fallback equal weight for n != 4
        best_w = np.ones(n) / n

    if best_w is None:
        best_w = np.ones(n) / n
    return {k: round(float(v), 4) for k, v in zip(keys, best_w)}


def replace_asset_test(
    base_keys: List[str],
    replace_key: str,
    candidate_key: str,
    nav_map: Dict[str, pd.Series],
) -> Optional[BacktestResult]:
    keys = [candidate_key if k == replace_key else k for k in base_keys]
    try:
        rets = align_returns(keys, nav_map)
    except Exception:
        return None
    if len(rets) < 36:
        return None
    w = optimize_max_sharpe(keys, rets)
    return make_result(keys, w, rets)


def run_constraint_sensitivity(returns: pd.DataFrame) -> dict:
    """Grid search under practical allocation floors/caps."""
    scenarios = {
        "unconstrained": {"min_eq": 0.0, "max_gold": 0.55, "max_n100": 0.55},
        "practical_caps": {"min_eq": 0.60, "max_gold": 0.20, "max_n100": 0.20},
        "moderate_caps": {"min_eq": 0.50, "max_gold": 0.25, "max_n100": 0.25},
        "conservative": {"min_eq": 0.70, "max_gold": 0.15, "max_n100": 0.15},
    }
    keys = list(returns.columns)
    out = {}
    levels = np.arange(0, 1.05, GRID_STEP)
    idx = {k: i for i, k in enumerate(keys)}

    for name, cfg in scenarios.items():
        best_w = None
        best_sharpe = -np.inf
        for a, b, c, d in product(levels, repeat=4):
            if abs(a + b + c + d - 1.0) > 1e-9:
                continue
            w = np.array([a, b, c, d])
            indian_eq = w[idx["invesco_midcap"]] + w[idx["invesco_smallcap"]]
            if indian_eq < cfg["min_eq"]:
                continue
            if w[idx["sbi_gold"]] > cfg["max_gold"]:
                continue
            if w[idx["motilal_nasdaq"]] > cfg["max_n100"]:
                continue
            if (w < MIN_WEIGHT).any() or (w > MAX_WEIGHT).any():
                continue
            _, _, sharpe, _, _ = portfolio_stats(w, returns)
            if sharpe > best_sharpe:
                best_sharpe = sharpe
                best_w = w
        if best_w is None:
            best_w = np.ones(4) / 4
        weights = {k: round(float(v), 4) for k, v in zip(keys, best_w)}
        out[name] = make_result(keys, weights, returns)

    # Hand-picked robust allocations (not optimizer output)
    presets = {
        "equal_weight_25": {k: 0.25 for k in keys},
        "recommended_35_30_15_20": {
            "invesco_midcap": 0.35,
            "invesco_smallcap": 0.30,
            "sbi_gold": 0.15,
            "motilal_nasdaq": 0.20,
        },
    }
    for name, weights in presets.items():
        out[name] = make_result(keys, weights, returns)
    return out


def compare_gold_nasdaq_variants(nav_map: Dict[str, pd.Series]) -> dict:
    """ETF (cleaned) vs FoF for gold and Nasdaq sleeves."""
    variants = []
    base = ["invesco_midcap", "invesco_smallcap"]
    etf_codes = {"sbi_gold": 111954, "motilal_nasdaq": 114984}
    fof_keys = ["sbi_gold", "motilal_nasdaq"]

    # FoF version (already in nav_map under sbi_gold / motilal_nasdaq)
    fof_returns = align_returns(base + fof_keys, nav_map)
    w = grid_search_best_sharpe(list(fof_returns.columns), fof_returns)
    variants.append(
        {
            "label": "FoF proxies (SBI Gold FoF + Motilal Nasdaq FoF)",
            "period_months": len(fof_returns),
            "result": make_result(list(fof_returns.columns), w, fof_returns),
        }
    )

    # ETF version with cleaned monthly returns
    etf_nav = dict(nav_map)
    for k, code in etf_codes.items():
        etf_nav[k] = fetch_nav_series(code)
    etf_returns = align_returns(base + fof_keys, etf_nav)
    w = grid_search_best_sharpe(list(etf_returns.columns), etf_returns)
    variants.append(
        {
            "label": "ETF proxies (cleaned monthly outliers)",
            "period_months": len(etf_returns),
            "result": make_result(list(etf_returns.columns), w, etf_returns),
        }
    )
    return {"variants": variants}


def run_core_analysis(nav_map: Dict[str, pd.Series]) -> dict:
    keys = CORE_KEYS
    returns = align_returns(keys, nav_map)
    equal_w = {k: round(1 / len(keys), 4) for k in keys}

    strategies = {
        "equal_weight_25pct": equal_w,
        "max_sharpe_continuous": optimize_max_sharpe(keys, returns),
        "min_variance": optimize_min_variance(keys, returns),
        "risk_parity": risk_parity_weights(keys, returns),
        "grid_max_sharpe_5pct": grid_search_best_sharpe(keys, returns),
    }

    results = {
        name: make_result(keys, w, returns) for name, w in strategies.items()
    }

    # Train / test split (60/40) on grid winner to check overfitting
    split = int(len(returns) * 0.6)
    train = returns.iloc[:split]
    test = returns.iloc[split:]
    train_w = grid_search_best_sharpe(keys, train)
    test_result = make_result(keys, train_w, test)

    # 5-asset with BOI Flexi Cap
    five_keys = CORE_KEYS + ["boi_flexicap"]
    five_returns = align_returns(five_keys, nav_map)
    five_w = optimize_max_sharpe(five_keys, five_returns)
    five_result = make_result(five_keys, five_w, five_returns)

    # Candidate replacement tests (swap one core equity sleeve)
    replacements = []
    for cand in ["boi_flexicap", "hdfc_midcap", "motilal_midcap", "nippon_smallcap", "ppfas_flexicap"]:
        for replace in ["invesco_midcap", "invesco_smallcap"]:
            r = replace_asset_test(CORE_KEYS, replace, cand, nav_map)
            if r:
                replacements.append(
                    {
                        "replace": replace,
                        "with": cand,
                        "label": f"{SCHEMES[cand]['label']} replaces {SCHEMES[replace]['label']}",
                        "result": r,
                    }
                )

    return {
        "returns": returns,
        "strategies": results,
        "sensitivity": run_constraint_sensitivity(returns),
        "gold_nasdaq_variants": compare_gold_nasdaq_variants(nav_map),
        "train_test": {
            "train_weights": train_w,
            "train_period": make_result(keys, train_w, train),
            "test_period": test_result,
        },
        "five_asset": five_result,
        "replacements": replacements,
    }


def fmt_pct(x: float) -> str:
    return f"{x * 100:.2f}%"


def print_summary(analysis: dict) -> None:
    print("\n=== CORE 4-ASSET BACKTEST ===")
    print(
        f"Period: {analysis['returns'].index[0].date()} -> "
        f"{analysis['returns'].index[-1].date()} ({len(analysis['returns'])} months)"
    )
    print("\n=== PRACTICAL CONSTRAINT SENSITIVITY ===")
    for name, res in analysis["sensitivity"].items():
        w_str = ", ".join(f"{k}={res.weights[k]*100:.0f}%" for k in CORE_KEYS)
        print(
            f"{name}: {w_str} | CAGR {fmt_pct(res.cagr)} Sharpe {res.sharpe:.2f} "
            f"maxDD {fmt_pct(res.max_drawdown)}"
        )

    print("\n=== GOLD / NASDAQ PROXY COMPARISON ===")
    for v in analysis["gold_nasdaq_variants"]["variants"]:
        r = v["result"]
        print(
            f"{v['label']} ({v['period_months']} mo): Sharpe {r.sharpe:.2f} "
            f"CAGR {fmt_pct(r.cagr)}"
        )

    for name, res in sorted(
        analysis["strategies"].items(), key=lambda x: x[1].sharpe, reverse=True
    ):
        w_str = ", ".join(f"{k}={res.weights[k]*100:.0f}%" for k in CORE_KEYS)
        print(
            f"\n{name}:\n  weights: {w_str}\n"
            f"  CAGR {fmt_pct(res.cagr)} | vol {fmt_pct(res.vol)} | "
            f"Sharpe {res.sharpe:.2f} | maxDD {fmt_pct(res.max_drawdown)} | "
            f"Calmar {res.calmar:.2f}"
        )

    tt = analysis["train_test"]
    print("\n=== TRAIN/TEST (grid weights fit on first 60%) ===")
    print(f"Train: {tt['train_period'].period_start} -> {tt['train_period'].period_end}")
    print(
        f"  CAGR {fmt_pct(tt['train_period'].cagr)} Sharpe {tt['train_period'].sharpe:.2f}"
    )
    print(f"Test:  {tt['test_period'].period_start} -> {tt['test_period'].period_end}")
    print(
        f"  CAGR {fmt_pct(tt['test_period'].cagr)} Sharpe {tt['test_period'].sharpe:.2f}"
    )

    fa = analysis["five_asset"]
    print("\n=== 5-ASSET (core + BOI Flexi Cap) max-Sharpe ===")
    for k, v in fa.weights.items():
        print(f"  {k}: {v*100:.1f}%")
    print(
        f"  CAGR {fmt_pct(fa.cagr)} | Sharpe {fa.sharpe:.2f} | maxDD {fmt_pct(fa.max_drawdown)}"
    )

    print("\n=== TOP REPLACEMENT CANDIDATES (max-Sharpe, same period) ===")
    reps = sorted(analysis["replacements"], key=lambda x: x["result"].sharpe, reverse=True)
    for item in reps[:8]:
        r = item["result"]
        print(
            f"{item['label']}: Sharpe {r.sharpe:.2f} CAGR {fmt_pct(r.cagr)} "
            f"maxDD {fmt_pct(r.max_drawdown)}"
        )


def main() -> dict:
    print("Fetching NAV data from MFAPI...")
    nav_map: Dict[str, pd.Series] = {}
    meta = {}
    for key, info in SCHEMES.items():
        nav = fetch_nav_series(info["code"])
        nav_map[key] = nav
        meta[key] = {
            "code": info["code"],
            "label": info["label"],
            "start": nav.index.min().strftime("%Y-%m-%d"),
            "end": nav.index.max().strftime("%Y-%m-%d"),
            "points": len(nav),
        }
        print(f"  {info['label']}: {meta[key]['start']} -> {meta[key]['end']}")

    analysis = run_core_analysis(nav_map)
    print_summary(analysis)

    # Individual asset stats for report
    indiv = {}
    rets = analysis["returns"]
    for k in CORE_KEYS:
        r = rets[k]
        cagr = (1 + r).prod() ** (12 / len(r)) - 1
        vol = r.std() * math.sqrt(12)
        indiv[k] = {"cagr": cagr, "vol": vol, "sharpe": (cagr - RISK_FREE_ANNUAL) / vol}

    output = {
        "meta": meta,
        "core_keys": CORE_KEYS,
        "individual_assets": indiv,
        "analysis": {
            "strategies": {
                name: res.__dict__ for name, res in analysis["strategies"].items()
            },
            "sensitivity": {
                name: res.__dict__ for name, res in analysis["sensitivity"].items()
            },
            "gold_nasdaq_variants": [
                {
                    "label": v["label"],
                    "period_months": v["period_months"],
                    "result": v["result"].__dict__,
                }
                for v in analysis["gold_nasdaq_variants"]["variants"]
            ],
            "train_test": {
                "train_weights": analysis["train_test"]["train_weights"],
                "train": analysis["train_test"]["train_period"].__dict__,
                "test": analysis["train_test"]["test_period"].__dict__,
            },
            "five_asset": analysis["five_asset"].__dict__,
            "top_replacements": [
                {
                    "replace": x["replace"],
                    "with": x["with"],
                    "label": x["label"],
                    "sharpe": x["result"].sharpe,
                    "cagr": x["result"].cagr,
                    "max_drawdown": x["result"].max_drawdown,
                    "weights": x["result"].weights,
                }
                for x in sorted(
                    analysis["replacements"], key=lambda z: z["result"].sharpe, reverse=True
                )[:10]
            ],
        },
    }
    out_path = "/workspace/artifacts/portfolio-optimization-results.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\nWrote {out_path}")
    return output


if __name__ == "__main__":
    main()
