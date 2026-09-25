#!/usr/bin/env python3
"""Active midcap funds vs NIFTY Midcap 150 Momentum 50 TRI benchmark."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime

import numpy as np
import pandas as pd
import requests
import statsmodels.api as sm
from indiafactorlibrary import IndiaFactorLibrary

MFAPI = "https://api.mfapi.in/mf"
MIN_MONTHS = 11

# Active midcap / mid-cap oriented funds (direct growth, no index/ETF)
ACTIVE_MIDCAP_FUNDS: dict[int, str] = {
    118989: "HDFC Mid Cap Fund",
    120505: "Axis Midcap Fund",
    119071: "DSP Midcap Fund",
    147445: "Mirae Asset Midcap Fund",
    118668: "Nippon India Growth Mid Cap Fund",
    119716: "SBI Midcap Fund",
    119178: "Tata Mid Cap Fund",
    125307: "PGIM India Midcap Fund",
    120841: "Quant Mid Cap Fund",
    120726: "UTI Mid Cap Fund",
    118533: "Franklin India Mid Cap Fund",
    140228: "Edelweiss Mid Cap Fund",
    119620: "Aditya Birla Sun Life Midcap Fund",
    151036: "HSBC Midcap Fund",
    147704: "Motilal Oswal Large and Midcap Fund",
}

# TRI proxy source: Nifty Midcap 150 Momentum 50 index funds
BENCHMARK_INDEX_CODES = {150738, 150902, 152916}
BENCHMARK_TER = {150738: 0.0039, 150902: 0.0045, 152916: 0.0028}


@dataclass
class Metrics:
    code: int
    name: str
    sharpe_window: str
    sharpe: float
    ann_return_pct: float
    ann_vol_pct: float
    ff5_alpha_ann_pct: float
    ff5_alpha_tstat: float
    ff5_r2: float
    bench_excess_pct: float
    fund_return_pct: float
    bench_return_pct: float
    history_months: float
    composite: float = 0.0


def fetch_nav(code: int) -> pd.Series:
    rows = requests.get(f"{MFAPI}/{code}", timeout=60).json()["data"]
    s = pd.Series(
        {pd.to_datetime(r["date"], format="%d-%m-%Y"): float(r["nav"]) for r in rows}
    ).sort_index()
    return s[~s.index.duplicated(keep="first")]


def monthly_returns(nav: pd.Series) -> pd.Series:
    return nav.resample("ME").last().pct_change().dropna()


def history_months(nav: pd.Series) -> float:
    return (nav.index.max() - nav.index.min()).days / 30.44


def window(series: pd.Series, years: float) -> pd.Series:
    end = series.index.max()
    start = end - pd.DateOffset(years=int(years), months=int((years % 1) * 12))
    return series[series.index >= start]


def sharpe(nav: pd.Series, rf: pd.Series, years: float) -> tuple[float, str, float, float]:
    end = nav.index.max()
    start = end - pd.DateOffset(years=int(years), months=int((years % 1) * 12))
    sub = nav[nav.index >= start]
    ret = sub.pct_change().dropna()
    if len(ret) < 200:
        years = 1.0
        sub = nav[nav.index >= end - pd.DateOffset(years=1)]
        ret = sub.pct_change().dropna()
        win = "1Y"
    else:
        win = f"{int(years)}Y" if years >= 1.5 else "1Y"
    rf_d = rf.reindex(ret.index, method="ffill") / 100 / 21
    rf_d = rf_d.fillna(rf_d.mean())
    ex = ret - rf_d
    vol = ret.std()
    if not vol:
        return float("nan"), win, float("nan"), float("nan")
    return (
        float((ex.mean() / vol) * math.sqrt(252)),
        win,
        float(((1 + ret.mean()) ** 252 - 1) * 100),
        float(vol * math.sqrt(252) * 100),
    )


def ff5_alpha(fund_m: pd.Series, factors: pd.DataFrame, years: float) -> tuple[float, float, float]:
    aligned = pd.concat(
        [window(fund_m, years).rename("f"), factors[["MF", "SMB5", "HML", "RMW", "CMA", "WML", "RF"]]],
        axis=1,
        join="inner",
    ).dropna()
    if len(aligned) < 10:
        return float("nan"), float("nan"), float("nan")
    y = aligned["f"] - aligned["RF"] / 100
    x = sm.add_constant(aligned[["MF", "SMB5", "HML", "RMW", "CMA", "WML"]] / 100)
    m = sm.OLS(y, x).fit()
    a = m.params["const"]
    return float(((1 + a) ** 12 - 1) * 100), float(m.tvalues["const"]), float(m.rsquared)


def tri_proxy(index_monthlies: dict[int, pd.Series], years: float) -> pd.Series:
    end = max(s.index.max() for s in index_monthlies.values())
    start = end - pd.DateOffset(years=int(years), months=int((years % 1) * 12))
    panel = pd.DataFrame(index_monthlies).loc[lambda d: d.index >= start]
    med = panel.median(axis=1)
    ter = float(np.mean(list(BENCHMARK_TER.values())))
    return (1 + med) * (1 + ter / 12) - 1


def bench_stats(fund_m: pd.Series, bench_m: pd.Series, years: float) -> tuple[float, float, float]:
    f = window(fund_m, years)
    b = bench_m.reindex(f.index)
    a = pd.concat([f, b], axis=1, join="inner").dropna()
    if len(a) < 6:
        return float("nan"), float("nan"), float("nan")
    fr, br = a.iloc[:, 0], a.iloc[:, 1]
    return (
        float(((1 + fr).prod() - (1 + br).prod()) * 100),
        float(((1 + fr).prod() - 1) * 100),
        float(((1 + br).prod() - 1) * 100),
    )


def pct_rank(vals: list[float], x: float) -> float:
    clean = [v for v in vals if not math.isnan(v)]
    return sum(1 for v in clean if v < x) / len(clean) if clean and not math.isnan(x) else 0.0


def main() -> dict:
    factors = IndiaFactorLibrary().read("ff6")[0]
    factors.index = pd.to_datetime(factors.index)
    rf = factors["RF"]

    bench_navs = {c: fetch_nav(c) for c in BENCHMARK_INDEX_CODES}
    bench_m = {c: monthly_returns(n) for c, n in bench_navs.items()}

    rows: list[Metrics] = []
    for code, name in ACTIVE_MIDCAP_FUNDS.items():
        nav = fetch_nav(code)
        hm = history_months(nav)
        if hm < MIN_MONTHS:
            continue
        yrs = 2.0 if hm >= 24 else 1.0
        fm = monthly_returns(nav)
        sh, win, ar, av = sharpe(nav, rf, yrs)
        alpha, tstat, r2 = ff5_alpha(fm, factors, yrs)
        bench = tri_proxy(bench_m, yrs)
        ex, fr, br = bench_stats(fm, bench, yrs)
        rows.append(
            Metrics(code, name, win, sh, ar, av, alpha, tstat, r2, ex, fr, br, hm)
        )

    sharpes = [r.sharpe for r in rows]
    alphas = [r.ff5_alpha_ann_pct for r in rows if not math.isnan(r.ff5_alpha_ann_pct)]
    for r in rows:
        r.composite = 0.55 * pct_rank(sharpes, r.sharpe) + 0.45 * (
            pct_rank(alphas, r.ff5_alpha_ann_pct) if not math.isnan(r.ff5_alpha_ann_pct) else 0
        )

    ranked = sorted(rows, key=lambda r: (r.composite, r.sharpe, r.ff5_alpha_ann_pct), reverse=True)
    return {
        "as_of": datetime.now().strftime("%Y-%m-%d"),
        "note": (
            "No dedicated active MF exists for Nifty Midcap 150 Momentum 50 universe. "
            "Compared active midcap funds as closest investable proxy vs NIFTY Midcap 150 Momentum 50 TRI."
        ),
        "benchmark": "NIFTY Midcap 150 Momentum 50 TRI (proxy from Tata/Edelweiss/Kotak index funds, mfapi)",
        "funds": [r.__dict__ for r in ranked],
        "top3": [r.__dict__ for r in ranked[:3]],
    }


if __name__ == "__main__":
    print(json.dumps(main(), indent=2))
