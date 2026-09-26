#!/usr/bin/env python3
"""Compare Indian Multi Asset Allocation funds (Direct Growth)."""

from __future__ import annotations

import json
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import indiafactorlibrary as ifl
import numpy as np
import pandas as pd
import requests
import statsmodels.api as sm

MFAPI = "https://api.mfapi.in/mf"
WORKSPACE = Path("/workspace")
RESEARCH = Path.home() / "research" / "MULTI_ASSET_FUNDS"
OUTPUT_JSON = RESEARCH / "analysis_results.json"

# Benchmark proxies (index TRI unavailable from this environment)
NIFTY50_INDEX_FUND = (120716, "UTI Nifty 50 Index Fund - Direct Plan - Growth")
COMPOSITE_COMPONENTS = {
    "nifty500_tri": (147625, "Motilal Oswal Nifty 500 Index Fund - Direct Plan - Growth"),
    "composite_debt": (
        149210,
        "ICICI Prudential Nifty PSU Bond Plus SDL Sep 2027 40:60 Index Fund - Direct Plan - Growth",
    ),
    "icomdex": (147662, "ICICI Prudential Commodities Fund - Direct Plan - Growth"),
}
COMPOSITE_WEIGHTS = {"nifty500_tri": 0.50, "composite_debt": 0.25, "icomdex": 0.25}

RISK_FREE_ANNUAL = 0.065  # fallback if RF missing in regression window


@dataclass
class FundMetrics:
    scheme_code: int
    scheme_name: str
    inception: str
    history_years: float
    window: str
    ann_return_pct: float
    ann_vol_pct: float
    sharpe: float
    max_drawdown_pct: float
    ff5_alpha_ann_pct: float | None
    ff5_alpha_tstat: float | None
    ff5_r2: float | None
    ff5_months: int
    vs_nifty50_bps: float | None
    vs_composite_bps: float | None
    beats_nifty50: bool | None
    beats_composite: bool | None


def fetch_all_schemes() -> list[dict]:
    schemes: list[dict] = []
    offset = 0
    while True:
        resp = requests.get(f"{MFAPI}?limit=500&offset={offset}", timeout=60)
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        schemes.extend(batch)
        offset += 500
        if len(batch) < 500:
            break
    return schemes


def get_multi_asset_direct_growth(schemes: list[dict]) -> list[dict]:
    pattern = re.compile(r"multi.?asset.?alloc", re.I)
    out: list[dict] = []
    seen: set[str] = set()
    for s in schemes:
        name = s["schemeName"]
        if not pattern.search(name):
            continue
        if "Direct" not in name:
            continue
        if "Growth" not in name and "GROWTH" not in name:
            continue
        if any(x in name for x in ["IDCW", "Regular", "Bonus", "Weekly", "Daily", "Monthly", "Quarterly", "Half Yearly", "Annual"]):
            continue
        key = re.sub(r"\s+", " ", name.lower().replace(" option", ""))
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return sorted(out, key=lambda x: x["schemeName"])


def fetch_nav_series(scheme_code: int) -> pd.Series:
    resp = requests.get(f"{MFAPI}/{scheme_code}", timeout=60)
    resp.raise_for_status()
    payload = resp.json()
    rows = payload.get("data") or []
    if not rows:
        return pd.Series(dtype=float, name=str(scheme_code))
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"], format="%d-%m-%Y", errors="coerce")
    df["nav"] = pd.to_numeric(df["nav"], errors="coerce")
    df = df.dropna(subset=["date", "nav"]).sort_values("date")
    s = df.set_index("date")["nav"]
    s = s[~s.index.duplicated(keep="last")]
    s.name = str(scheme_code)
    return s


def load_nav_map(codes: list[int]) -> dict[int, pd.Series]:
    nav_map: dict[int, pd.Series] = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(fetch_nav_series, c): c for c in codes}
        for fut in as_completed(futures):
            code = futures[fut]
            try:
                nav_map[code] = fut.result()
            except Exception as exc:  # noqa: BLE001
                print(f"WARN nav fetch failed {code}: {exc}")
                nav_map[code] = pd.Series(dtype=float)
            time.sleep(0.05)
    return nav_map


def daily_to_monthly_returns(nav: pd.Series) -> pd.Series:
    if nav.empty:
        return pd.Series(dtype=float)
    month_end = nav.resample("ME").last().dropna()
    return month_end.pct_change().dropna()


def pick_window(monthly: pd.Series) -> tuple[pd.Series, str]:
    if monthly.empty:
        return monthly, "NA"
    end = monthly.index.max()
    for years, label in [(3, "3Y"), (2, "2Y"), (1, "1Y")]:
        start = end - pd.DateOffset(years=years)
        window = monthly[monthly.index > start]
        if len(window) >= 9:
            return window, label
    return monthly, "MAX"


def annualized_return(monthly: pd.Series) -> float:
    if monthly.empty:
        return float("nan")
    total = (1 + monthly).prod() - 1
    years = len(monthly) / 12
    if years <= 0:
        return float("nan")
    return ((1 + total) ** (1 / years) - 1) * 100


def annualized_vol(monthly: pd.Series) -> float:
    if len(monthly) < 2:
        return float("nan")
    return monthly.std(ddof=1) * math.sqrt(12) * 100


def sharpe_ratio(monthly: pd.Series, rf_annual: float = RISK_FREE_ANNUAL) -> float:
    if len(monthly) < 6:
        return float("nan")
    rf_m = (1 + rf_annual) ** (1 / 12) - 1
    excess = monthly - rf_m
    vol = excess.std(ddof=1)
    if vol == 0 or np.isnan(vol):
        return float("nan")
    return (excess.mean() / vol) * math.sqrt(12)


def max_drawdown(nav: pd.Series) -> float:
    if nav.empty:
        return float("nan")
    roll_max = nav.cummax()
    dd = nav / roll_max - 1
    return dd.min() * 100


def load_ff6_monthly() -> pd.DataFrame:
    ff6 = ifl.IndiaFactorLibrary().read("ff6")[0].copy()
    ff6.index = pd.to_datetime(ff6.index) + pd.offsets.MonthEnd(0)
    for col in ff6.columns:
        ff6[col] = pd.to_numeric(ff6[col], errors="coerce") / 100.0
    return ff6


def ff5_alpha(fund_monthly: pd.Series, factors: pd.DataFrame) -> tuple[float | None, float | None, float | None, int]:
    merged = pd.concat([fund_monthly.rename("fund"), factors], axis=1, join="inner").dropna()
    if len(merged) < 24:
        return None, None, None, len(merged)
    y = merged["fund"] - merged["RF"]
    x = merged[["MKT", "SMB5", "HML", "RMW", "CMA"]]
    x = sm.add_constant(x)
    model = sm.OLS(y, x).fit()
    alpha_m = model.params["const"]
    alpha_ann = ((1 + alpha_m) ** 12 - 1) * 100
    return alpha_ann, float(model.tvalues["const"]), float(model.rsquared), len(merged)


def build_composite_monthly(nav_map: dict[int, pd.Series]) -> pd.Series:
    parts = []
    for key, (code, _) in COMPOSITE_COMPONENTS.items():
        nav = nav_map.get(code, pd.Series(dtype=float))
        ret = daily_to_monthly_returns(nav)
        ret.name = key
        parts.append(ret)
    if not parts:
        return pd.Series(dtype=float)
    df = pd.concat(parts, axis=1, join="inner").dropna()
    if df.empty:
        return pd.Series(dtype=float)
    composite = sum(df[k] * COMPOSITE_WEIGHTS[k] for k in df.columns)
    composite.name = "composite_benchmark"
    return composite


def compute_metrics(
    scheme_code: int,
    scheme_name: str,
    nav: pd.Series,
    nifty50_monthly: pd.Series,
    composite_monthly: pd.Series,
    factors: pd.DataFrame,
) -> FundMetrics:
    monthly_all = daily_to_monthly_returns(nav)
    window_rets, window_label = pick_window(monthly_all)
    nav_window = nav[nav.index >= (window_rets.index.min() - pd.DateOffset(days=5))]

    alpha, tstat, r2, ff_months = ff5_alpha(monthly_all, factors)

    vs_n50 = vs_comp = None
    beats_n50 = beats_comp = None
    if not window_rets.empty:
        n50_w, _ = pick_window(nifty50_monthly)
        comp_w, _ = pick_window(composite_monthly)
        common_n50 = window_rets.index.intersection(n50_w.index)
        common_comp = window_rets.index.intersection(comp_w.index)
        if len(common_n50) >= 6:
            fund_ann = annualized_return(window_rets.loc[common_n50])
            n50_ann = annualized_return(n50_w.loc[common_n50])
            vs_n50 = (fund_ann - n50_ann) * 100
            beats_n50 = fund_ann > n50_ann
        if len(common_comp) >= 6:
            fund_ann = annualized_return(window_rets.loc[common_comp])
            comp_ann = annualized_return(comp_w.loc[common_comp])
            vs_comp = (fund_ann - comp_ann) * 100
            beats_comp = fund_ann > comp_ann

    history_years = (nav.index.max() - nav.index.min()).days / 365.25 if not nav.empty else 0

    return FundMetrics(
        scheme_code=scheme_code,
        scheme_name=scheme_name,
        inception=nav.index.min().strftime("%d-%b-%Y") if not nav.empty else "NA",
        history_years=round(history_years, 2),
        window=window_label,
        ann_return_pct=round(annualized_return(window_rets), 2),
        ann_vol_pct=round(annualized_vol(window_rets), 2),
        sharpe=round(sharpe_ratio(window_rets), 3),
        max_drawdown_pct=round(max_drawdown(nav_window), 2),
        ff5_alpha_ann_pct=round(alpha, 2) if alpha is not None else None,
        ff5_alpha_tstat=round(tstat, 2) if tstat is not None else None,
        ff5_r2=round(r2, 3) if r2 is not None else None,
        ff5_months=ff_months,
        vs_nifty50_bps=round(vs_n50, 1) if vs_n50 is not None else None,
        vs_composite_bps=round(vs_comp, 1) if vs_comp is not None else None,
        beats_nifty50=beats_n50,
        beats_composite=beats_comp,
    )


def rank_funds(metrics: list[FundMetrics]) -> list[FundMetrics]:
    eligible = [m for m in metrics if not math.isnan(m.sharpe) and m.ff5_alpha_ann_pct is not None]
    eligible.sort(
        key=lambda m: (
            m.sharpe,
            m.ff5_alpha_ann_pct or -999,
            -(m.max_drawdown_pct or -999),
        ),
        reverse=True,
    )
    return eligible


def metrics_to_dict(m: FundMetrics) -> dict:
    d = m.__dict__.copy()
    for k, v in d.items():
        if isinstance(v, (np.bool_, bool)):
            d[k] = bool(v) if v is not None else None
        elif isinstance(v, (np.floating, float)) and v is not None and (isinstance(v, float) and math.isnan(v) or str(v) == "nan"):
            d[k] = None
    return d


def build_markdown(results: dict) -> str:
    top3 = results["ranked"][:3]
    all_funds = results["all_metrics"]
    as_of = results["as_of"]

    lines = [
        "# Multi Asset Allocation Funds — Direct Growth Comparison",
        "",
        f"**As of:** {as_of}  ",
        f"**Universe:** {len(all_funds)} SEBI Multi Asset Allocation schemes (Direct Growth, ex-IDCW)  ",
        "**Data:** NAV from [mfapi.in](https://www.mfapi.in); Fama-French 5-factor (+ momentum library `ff6`) from [Invespar](https://invespar.com/research) via `indiafactorlibrary`  ",
        "",
        "## Methodology",
        "",
        "| Metric | Definition |",
        "|---|---|",
        "| **Sharpe ratio** | Excess return over 6.5% p.a. risk-free (fallback) ÷ annualized vol; window = **3Y** if ≥9 monthly obs, else **2Y**, else **1Y** |",
        "| **FF5 alpha** | Intercept from OLS: `(fund monthly return − RF) ~ MKT + SMB5 + HML + RMW + CMA` using Invespar `ff6` factors; annualized |",
        "| **Volatility** | Annualized stdev of monthly returns (same window as Sharpe) |",
        "| **Max drawdown** | Peak-to-trough on daily NAV over the Sharpe window |",
        "| **vs Nifty 50** | Fund annualized return minus **UTI Nifty 50 Index Fund (Direct Growth)** over the same window |",
        "| **vs Composite benchmark** | Fund minus weighted blend (see below) over the same window |",
        "",
        "### Composite benchmark (proxy construction)",
        "",
        "Direct TRI downloads from Nifty Indices / MCX were blocked in this environment. Composite benchmark is built from **index-fund NAV proxies** (mfapi):",
        "",
        "| Component | Weight | Proxy fund |",
        "|---|---|---|",
        f"| NIFTY 500 TRI | 50% | {COMPOSITE_COMPONENTS['nifty500_tri'][1]} |",
        f"| NIFTY Composite Debt Index | 25% | {COMPOSITE_COMPONENTS['composite_debt'][1]} *(SDL+PSU debt index proxy; no passive fund on mfapi tracks NIFTY Composite Debt Index directly)* |",
        f"| MCX iCOMDEX Composite | 25% | {COMPOSITE_COMPONENTS['icomdex'][1]} *(active commodities fund proxy; not iCOMDEX)* |",
        "",
        "Monthly composite return = 0.50×R500 + 0.25×Rdebt + 0.25×Rcommodities on overlapping months.",
        "",
        "## Top 3 funds",
        "",
    ]

    for i, f in enumerate(top3, 1):
        vs_n = f['vs_nifty50_bps']
        vs_c = f['vs_composite_bps']
        n50_txt = f"{vs_n} bps ({'beats' if f['beats_nifty50'] else 'trails'})" if vs_n is not None else "NA"
        comp_txt = f"{vs_c} bps ({'beats' if f['beats_composite'] else 'trails'})" if vs_c is not None else "NA (insufficient composite overlap)"
        lines.extend(
            [
                f"### {i}. {f['scheme_name']}",
                "",
                f"- **Sharpe ({f['window']}):** {f['sharpe']}",
                f"- **FF5 alpha (ann.):** {f['ff5_alpha_ann_pct']}% (t={f['ff5_alpha_tstat']}, R²={f['ff5_r2']}, {f['ff5_months']} months)",
                f"- **Return / Vol / Max DD ({f['window']}):** {f['ann_return_pct']}% / {f['ann_vol_pct']}% / {f['max_drawdown_pct']}%",
                f"- **vs Nifty 50 index fund:** {n50_txt}",
                f"- **vs composite benchmark:** {comp_txt}",
                f"- **Inception:** {f['inception']} ({f['history_years']} yrs history)",
                "",
            ]
        )

    lines.extend(["## Full universe ranking", ""])
    lines.append(
        "| Rank | Fund | Window | Sharpe | FF5 α (ann.) | Return% | Vol% | MaxDD% | vs N50 (bps) | vs Comp (bps) |"
    )
    lines.append("|---:|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|")

    for i, f in enumerate(results["ranked"], 1):
        alpha = f["ff5_alpha_ann_pct"] if f["ff5_alpha_ann_pct"] is not None else "NA"
        vs_n = f["vs_nifty50_bps"] if f["vs_nifty50_bps"] is not None else "NA"
        vs_c = f["vs_composite_bps"] if f["vs_composite_bps"] is not None else "NA"
        short = f["scheme_name"].replace(" - Direct Plan - Growth Option", "").replace(" - Direct Plan - Growth", "").replace(" - Direct Plan - GROWTH Option", "")
        lines.append(
            f"| {i} | {short} | {f['window']} | {f['sharpe']} | {alpha} | {f['ann_return_pct']} | {f['ann_vol_pct']} | {f['max_drawdown_pct']} | {vs_n} | {vs_c} |"
        )

    lines.extend(
        [
            "",
            "## Funds excluded from ranking",
            "",
        ]
    )
    excluded = [f for f in all_funds if f["scheme_code"] not in {x["scheme_code"] for x in results["ranked"]}]
    if excluded:
        for f in excluded:
            lines.append(f"- {f['scheme_name']} — insufficient history for FF5 alpha (<24 overlapping months) or missing NAV")
    else:
        lines.append("- None")

    lines.extend(
        [
            "",
            "## Key observations",
            "",
            "1. **Sharpe ranking** prioritizes risk-adjusted return; **FF5 alpha** breaks ties and flags factor-adjusted outperformance.",
            "2. Multi-asset funds with **lower equity allocation** typically show lower vol/max drawdown but may trail Nifty 50 in strong equity rallies.",
            "3. Composite benchmark comparison is more relevant for this category than Nifty 50 alone (equity + debt + commodities blend).",
            "4. Re-run when newer NAV / factor data is available; Invespar factors revise historical values monthly.",
            "",
            "---",
            "*Not investment advice. Past performance does not guarantee future results.*",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    RESEARCH.mkdir(parents=True, exist_ok=True)
    (WORKSPACE / "artifacts").mkdir(parents=True, exist_ok=True)
    Path("/opt/cursor/artifacts").mkdir(parents=True, exist_ok=True)

    schemes = fetch_all_schemes()
    funds = get_multi_asset_direct_growth(schemes)
    print(f"Found {len(funds)} multi asset allocation direct growth funds")

    # Drop legacy duplicate Kotak scheme if newer exists
    codes_present = {f["schemeCode"] for f in funds}
    if 152064 in codes_present and 120160 in codes_present:
        funds = [f for f in funds if f["schemeCode"] != 120160]

    benchmark_codes = [NIFTY50_INDEX_FUND[0], *[v[0] for v in COMPOSITE_COMPONENTS.values()]]
    all_codes = [f["schemeCode"] for f in funds] + benchmark_codes
    nav_map = load_nav_map(all_codes)

    factors = load_ff6_monthly()
    nifty50_monthly = daily_to_monthly_returns(nav_map[NIFTY50_INDEX_FUND[0]])
    composite_monthly = build_composite_monthly(nav_map)

    metrics: list[FundMetrics] = []
    for f in funds:
        code = f["schemeCode"]
        nav = nav_map.get(code, pd.Series(dtype=float))
        if nav.empty:
            continue
        metrics.append(
            compute_metrics(code, f["schemeName"], nav, nifty50_monthly, composite_monthly, factors)
        )

    ranked = rank_funds(metrics)
    as_of = datetime.now().strftime("%d %b %Y")

    results = {
        "as_of": as_of,
        "universe_count": len(metrics),
        "all_metrics": [metrics_to_dict(m) for m in metrics],
        "ranked": [metrics_to_dict(m) for m in ranked],
        "benchmarks": {
            "nifty50_index_fund": {"code": NIFTY50_INDEX_FUND[0], "name": NIFTY50_INDEX_FUND[1]},
            "composite_components": {
                k: {"code": v[0], "name": v[1], "weight": COMPOSITE_WEIGHTS[k]}
                for k, v in COMPOSITE_COMPONENTS.items()
            },
        },
    }

    OUTPUT_JSON.write_text(json.dumps(results, indent=2))
    md = build_markdown(results)
    for path in [WORKSPACE / "artifacts" / "multi-asset-allocation-funds-report.md", Path("/opt/cursor/artifacts/multi-asset-allocation-funds-report.md")]:
        path.write_text(md)

    print("Top 3:")
    for i, f in enumerate(ranked[:3], 1):
        print(f"{i}. {f.scheme_name} | Sharpe={f.sharpe} | Alpha={f.ff5_alpha_ann_pct}% | vs N50={f.vs_nifty50_bps}bps")


if __name__ == "__main__":
    main()
