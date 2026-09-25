#!/usr/bin/env python3
"""Nifty Midcap 150 Momentum funds vs mid-cap universe funds."""

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

MOMENTUM_FUNDS = {
    150738: "Tata Nifty Midcap 150 Momentum 50 Index",
    150902: "Edelweiss Nifty Midcap 150 Momentum 50 Index",
    152916: "Kotak Nifty Midcap 150 Momentum 50 Index",
}

MIDCAP150_INDEX = {
    147622: "Motilal Oswal Nifty Midcap 150 Index",
    148726: "Nippon India Nifty Midcap 150 Index",
    148807: "ABSL Nifty Midcap 150 Index",
    149389: "ICICI Pru Nifty Midcap 150 Index",
    150673: "SBI Nifty Midcap 150 Index",
    151724: "HDFC Nifty Midcap 150 Index",
    152855: "Bandhan Nifty Midcap 150 Index",
    153089: "UTI Nifty Midcap 150 Index",
    153401: "Kotak Nifty Midcap 150 Index",
    153581: "Tata Nifty Midcap 150 Index",
}

ACTIVE_MIDCAP = {
    118989: "HDFC Mid Cap Fund",
    120505: "Axis Midcap Fund",
    119071: "DSP Midcap Fund",
    147445: "Mirae Asset Midcap Fund",
    118668: "Nippon India Growth Mid Cap Fund",
    119716: "SBI Midcap Fund",
    119178: "Tata Mid Cap Fund",
    125307: "PGIM India Midcap Fund",
    120726: "UTI Mid Cap Fund",
    118533: "Franklin India Mid Cap Fund",
    119620: "ABSL Midcap Fund",
    151036: "HSBC Midcap Fund",
}

BENCHMARK_CODES = set(MOMENTUM_FUNDS)
BENCHMARK_TER = {150738: 0.0039, 150902: 0.0045, 152916: 0.0028}


@dataclass
class Row:
    code: int
    name: str
    bucket: str
    sharpe_window: str
    sharpe: float
    ff5_alpha_ann_pct: float
    ff5_alpha_tstat: float
    bench_excess_pct: float
    fund_return_pct: float
    bench_return_pct: float
    history_months: float
    composite: float = 0.0


def fetch_nav(code: int) -> pd.Series:
    data = requests.get(f"{MFAPI}/{code}", timeout=60).json()["data"]
    s = pd.Series(
        {pd.to_datetime(r["date"], format="%d-%m-%Y"): float(r["nav"]) for r in data}
    ).sort_index()
    return s[~s.index.duplicated(keep="first")]


def monthly(nav: pd.Series) -> pd.Series:
    return nav.resample("ME").last().pct_change().dropna()


def hist_months(nav: pd.Series) -> float:
    return (nav.index.max() - nav.index.min()).days / 30.44


def win(s: pd.Series, years: float) -> pd.Series:
    end = s.index.max()
    start = end - pd.DateOffset(years=int(years), months=int((years % 1) * 12))
    return s[s.index >= start]


def sharpe(nav: pd.Series, rf: pd.Series, years: float) -> tuple[float, str, float]:
    end = nav.index.max()
    start = end - pd.DateOffset(years=int(years), months=int((years % 1) * 12))
    r = nav[nav.index >= start].pct_change().dropna()
    if len(r) < 200:
        years = 1.0
        r = nav[nav.index >= end - pd.DateOffset(years=1)].pct_change().dropna()
        w = "1Y"
    else:
        w = f"{int(years)}Y" if years >= 1.5 else "1Y"
    rf_d = (rf.reindex(r.index, method="ffill") / 100 / 21).bfill()
    ex = r - rf_d
    vol = r.std()
    return float((ex.mean() / vol) * math.sqrt(252)) if vol else float("nan"), w, years


def alpha(fm: pd.Series, fac: pd.DataFrame, years: float) -> tuple[float, float]:
    a = pd.concat([win(fm, years).rename("f"), fac[["MF", "SMB5", "HML", "RMW", "CMA", "WML", "RF"]]], axis=1).dropna()
    if len(a) < 10:
        return float("nan"), float("nan")
    y = a["f"] - a["RF"] / 100
    x = sm.add_constant(a[["MF", "SMB5", "HML", "RMW", "CMA", "WML"]] / 100)
    m = sm.OLS(y, x).fit()
    return float(((1 + m.params["const"]) ** 12 - 1) * 100), float(m.tvalues["const"])


def tri_proxy(bench_m: dict[int, pd.Series], years: float) -> pd.Series:
    end = max(s.index.max() for s in bench_m.values())
    start = end - pd.DateOffset(years=int(years), months=int((years % 1) * 12))
    med = pd.DataFrame(bench_m).loc[lambda d: d.index >= start].median(axis=1)
    ter = float(np.mean(list(BENCHMARK_TER.values())))
    return (1 + med) * (1 + ter / 12) - 1


def excess(fm: pd.Series, bm: pd.Series, years: float) -> tuple[float, float, float]:
    f, b = win(fm, years), bm.reindex(win(fm, years).index)
    x = pd.concat([f, b], axis=1).dropna()
    if len(x) < 6:
        return float("nan"), float("nan"), float("nan")
    fr, br = x.iloc[:, 0], x.iloc[:, 1]
    return float(((1 + fr).prod() - (1 + br).prod()) * 100), float(((1 + fr).prod() - 1) * 100), float(((1 + br).prod() - 1) * 100)


def analyze_bucket(
    funds: dict[int, str], bucket: str, fac: pd.DataFrame, rf: pd.Series, bench_m: dict[int, pd.Series]
) -> list[Row]:
    out: list[Row] = []
    for code, name in funds.items():
        nav = fetch_nav(code)
        hm = hist_months(nav)
        if hm < MIN_MONTHS:
            continue
        yrs = 2.0 if hm >= 24 else 1.0
        fm = monthly(nav)
        sh, w, yrs = sharpe(nav, rf, yrs)
        al, t = alpha(fm, fac, yrs)
        bench = tri_proxy(bench_m, yrs)
        ex, fr, br = excess(fm, bench, yrs)
        out.append(Row(code, name, bucket, w, sh, al, t, ex, fr, br, hm))
    return out


def rank(rows: list[Row]) -> list[Row]:
    sh = [r.sharpe for r in rows]
    al = [r.ff5_alpha_ann_pct for r in rows if not math.isnan(r.ff5_alpha_ann_pct)]

    def pr(vals, x):
        c = [v for v in vals if not math.isnan(v)]
        return sum(1 for v in c if v < x) / len(c) if c and not math.isnan(x) else 0.0

    for r in rows:
        r.composite = 0.55 * pr(sh, r.sharpe) + 0.45 * (
            pr(al, r.ff5_alpha_ann_pct) if not math.isnan(r.ff5_alpha_ann_pct) else 0
        )
    return sorted(rows, key=lambda r: (r.composite, r.sharpe), reverse=True)


def main() -> dict:
    fac = IndiaFactorLibrary().read("ff6")[0]
    fac.index = pd.to_datetime(fac.index)
    rf = fac["RF"]
    bench_m = {c: monthly(fetch_nav(c)) for c in BENCHMARK_CODES}

    momentum = analyze_bucket(MOMENTUM_FUNDS, "momentum", fac, rf, bench_m)
    midcap_idx = analyze_bucket(MIDCAP150_INDEX, "midcap150_index", fac, rf, bench_m)
    active = analyze_bucket(ACTIVE_MIDCAP, "active_midcap", fac, rf, bench_m)
    midcap_universe = rank(midcap_idx + active)
    all_rows = rank(momentum + midcap_universe)

    return {
        "as_of": datetime.now().strftime("%Y-%m-%d"),
        "benchmark": "NIFTY Midcap 150 Momentum 50 TRI (Tata/Edelweiss/Kotak index proxy, mfapi)",
        "top3_overall": [r.__dict__ for r in all_rows[:3]],
        "top3_midcap_universe": [r.__dict__ for r in midcap_universe[:3]],
        "momentum_funds": [r.__dict__ for r in rank(momentum)],
        "midcap_universe": [r.__dict__ for r in midcap_universe],
        "all_ranked": [r.__dict__ for r in all_rows],
    }


if __name__ == "__main__":
    print(json.dumps(main(), indent=2))
