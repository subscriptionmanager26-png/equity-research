#!/usr/bin/env python3
"""Full refresh: momentum vs midcap universe vs TRI, incl. drawdown/vol."""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np
import pandas as pd
import requests
import statsmodels.api as sm
from indiafactorlibrary import IndiaFactorLibrary

MFAPI = "https://api.mfapi.in/mf"
MIN_MONTHS = 11

SEARCH_QUERIES = [
    "midcap 150 momentum",
    "nifty midcap 150 index",
    "hdfc midcap",
    "axis midcap",
    "mirae midcap",
    "whiteoak mid cap",
    "invesco midcap",
    "canara midcap",
    "quant mid cap",
    "franklin mid cap",
    "dsp midcap",
    "nippon growth mid",
    "pgim midcap",
    "edelweiss mid cap",
    "absl midcap",
]

MOMENTUM_CODES = {150738, 150902, 152916, 154526}
BENCHMARK_TER = {150738: 0.0039, 150902: 0.0045, 152916: 0.0028}

# Curated universe (mfapi search is capped ~15 hits/query and rate-limited).
KNOWN_MOMENTUM: dict[int, str] = {
    150738: "Tata Nifty Midcap 150 Momentum 50 Index",
    150902: "Edelweiss Nifty Midcap 150 Momentum 50 Index",
    152916: "Kotak Nifty Midcap 150 Momentum 50 Index",
    154526: "SBI Nifty Midcap 150 Momentum 50 ETF FoF",
}

KNOWN_MIDCAP150_INDEX: dict[int, str] = {
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

KNOWN_ACTIVE_MIDCAP: dict[int, str] = {
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
    150584: "WhiteOak Capital Mid Cap Fund",
    120403: "Invesco India Mid Cap Fund",
    150817: "Canara Robeco Mid Cap Fund",
}


@dataclass
class FundRow:
    code: int
    name: str
    bucket: str
    sharpe_window: str
    sharpe: float
    ff5_alpha_pct: float
    ff5_tstat: float
    bench_excess_pct: float
    fund_return_pct: float
    bench_return_pct: float
    ann_vol_pct: float
    max_drawdown_pct: float
    current_drawdown_pct: float
    sortino: float
    calmar: float
    history_months: float
    composite: float = 0.0


def mfapi_search(query: str) -> list[dict]:
    import time

    for attempt in range(3):
        try:
            resp = requests.get(f"{MFAPI}/mf/search?q={query}", timeout=30)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                return data
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return []


def discover_funds() -> dict[int, tuple[str, str]]:
    funds: dict[int, tuple[str, str]] = {}
    for code, name in KNOWN_MOMENTUM.items():
        funds[code] = (name, "momentum_index")
    for code, name in KNOWN_MIDCAP150_INDEX.items():
        funds[code] = (name, "midcap150_index")
    for code, name in KNOWN_ACTIVE_MIDCAP.items():
        funds[code] = (name, "active_midcap")

    seen: dict[int, str] = {}
    for q in SEARCH_QUERIES:
        for item in mfapi_search(q):
            seen[item["schemeCode"]] = item["schemeName"]

    for code, name in seen.items():
        if code in funds:
            continue
        nl = name.lower()
        if "direct" not in nl or "growth" not in nl:
            continue
        if any(x in nl for x in ["idcw", "dividend", "bonus"]):
            continue

        is_momentum = code in MOMENTUM_CODES or (
            "momentum" in nl and ("150" in nl or "midcap150" in nl.replace(" ", ""))
        )
        is_m150_idx = (
            ("midcap 150" in nl or "midcap150" in nl)
            and "index" in nl
            and "momentum" not in nl
            and "quality" not in nl
        )
        is_active = (
            ("midcap" in nl or "mid cap" in nl)
            and "index" not in nl
            and "etf" not in nl
            and "fof" not in nl
            and "large & mid" not in nl
            and "large and mid" not in nl
        )

        if is_momentum:
            funds[code] = (clean_name(name), "momentum_index")
        elif is_m150_idx:
            funds[code] = (clean_name(name), "midcap150_index")
        elif is_active:
            funds[code] = (clean_name(name), "active_midcap")

    return funds


def clean_name(name: str) -> str:
    name = re.sub(r"\s*-\s*Direct Plan.*", "", name, flags=re.I)
    name = re.sub(r"\s*Direct Plan.*", "", name, flags=re.I)
    return name.strip()


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


def window(series: pd.Series, years: float) -> pd.Series:
    end = series.index.max()
    start = end - pd.DateOffset(years=int(years), months=int((years % 1) * 12))
    return series[series.index >= start]


def sharpe(nav: pd.Series, rf: pd.Series, years: float) -> tuple[float, str]:
    end = nav.index.max()
    start = end - pd.DateOffset(years=int(years), months=int((years % 1) * 12))
    sub = nav[nav.index >= start]
    r = sub.pct_change().dropna()
    if len(r) < 200:
        years = 1.0
        sub = nav[nav.index >= end - pd.DateOffset(years=1)]
        r = sub.pct_change().dropna()
        w = "1Y"
    else:
        w = f"{int(years)}Y" if years >= 1.5 else "1Y"
    rf_d = (rf.reindex(r.index, method="ffill") / 100 / 21).bfill()
    ex = r - rf_d
    vol = r.std()
    return float((ex.mean() / vol) * math.sqrt(252)) if vol else float("nan"), w


def risk_metrics(nav: pd.Series, years: float) -> dict[str, float]:
    sub = nav[nav.index >= nav.index.max() - pd.DateOffset(years=int(years), months=int((years % 1) * 12))]
    r = sub.pct_change().dropna()
    peak = sub.cummax()
    dd = sub / peak - 1
    ann_vol = r.std() * math.sqrt(252) * 100
    ann_ret = ((sub.iloc[-1] / sub.iloc[0]) ** (365.25 / max((sub.index[-1] - sub.index[0]).days, 1)) - 1) * 100
    max_dd = dd.min() * 100
    cur_dd = dd.iloc[-1] * 100
    downside = r[r < 0].std() * math.sqrt(252) if (r < 0).any() else np.nan
    sortino = (r.mean() * 252 * 100) / (downside * 100) if downside and downside > 0 else float("nan")
    calmar = ann_ret / abs(max_dd) if max_dd else float("nan")
    return {
        "ann_vol_pct": float(ann_vol),
        "max_drawdown_pct": float(max_dd),
        "current_drawdown_pct": float(cur_dd),
        "sortino": float(sortino),
        "calmar": float(calmar),
        "ann_return_pct": float(ann_ret),
    }


def ff5_alpha(fm: pd.Series, fac: pd.DataFrame, years: float) -> tuple[float, float]:
    a = pd.concat(
        [window(fm, years).rename("f"), fac[["MF", "SMB5", "HML", "RMW", "CMA", "WML", "RF"]]],
        axis=1,
        join="inner",
    ).dropna()
    if len(a) < 10:
        return float("nan"), float("nan")
    y = a["f"] - a["RF"] / 100
    x = sm.add_constant(a[["MF", "SMB5", "HML", "RMW", "CMA", "WML"]] / 100)
    m = sm.OLS(y, x).fit()
    return float(((1 + m.params["const"]) ** 12 - 1) * 100), float(m.tvalues["const"])


def tri_proxy(bench_m: dict[int, pd.Series], years: float) -> pd.Series:
    codes = [c for c in BENCHMARK_TER if c in bench_m]
    end = max(bench_m[c].index.max() for c in codes)
    start = end - pd.DateOffset(years=int(years), months=int((years % 1) * 12))
    med = pd.DataFrame({c: bench_m[c] for c in codes}).loc[lambda d: d.index >= start].median(axis=1)
    ter = float(np.mean([BENCHMARK_TER[c] for c in codes]))
    return (1 + med) * (1 + ter / 12) - 1


def bench_excess(fm: pd.Series, bm: pd.Series, years: float) -> tuple[float, float, float]:
    f, b = window(fm, years), bm.reindex(window(fm, years).index)
    x = pd.concat([f, b], axis=1).dropna()
    if len(x) < 6:
        return float("nan"), float("nan"), float("nan")
    fr, br = x.iloc[:, 0], x.iloc[:, 1]
    return (
        float(((1 + fr).prod() - (1 + br).prod()) * 100),
        float(((1 + fr).prod() - 1) * 100),
        float(((1 + br).prod() - 1) * 100),
    )


def pct_rank(vals: list[float], x: float) -> float:
    c = [v for v in vals if not math.isnan(v)]
    return sum(1 for v in c if v < x) / len(c) if c and not math.isnan(x) else 0.0


def analyze() -> dict:
    fac = IndiaFactorLibrary().read("ff6")[0]
    fac.index = pd.to_datetime(fac.index)
    rf = fac["RF"]

    universe = discover_funds()
    bench_m = {c: monthly(fetch_nav(c)) for c in BENCHMARK_TER if c in universe or True}
    for c in BENCHMARK_TER:
        if c not in bench_m:
            bench_m[c] = monthly(fetch_nav(c))

    rows: list[FundRow] = []
    for code, (name, bucket) in sorted(universe.items(), key=lambda x: x[1][0]):
        try:
            nav = fetch_nav(code)
        except Exception:
            continue
        hm = hist_months(nav)
        if hm < MIN_MONTHS:
            continue
        yrs = 2.0 if hm >= 24 else 1.0
        fm = monthly(nav)
        sh, w = sharpe(nav, rf, yrs)
        al, t = ff5_alpha(fm, fac, yrs)
        bench = tri_proxy(bench_m, yrs)
        ex, fr, br = bench_excess(fm, bench, yrs)
        risk = risk_metrics(nav, yrs)
        rows.append(
            FundRow(
                code=code,
                name=name,
                bucket=bucket,
                sharpe_window=w,
                sharpe=sh,
                ff5_alpha_pct=al,
                ff5_tstat=t,
                bench_excess_pct=ex,
                fund_return_pct=fr,
                bench_return_pct=br,
                ann_vol_pct=risk["ann_vol_pct"],
                max_drawdown_pct=risk["max_drawdown_pct"],
                current_drawdown_pct=risk["current_drawdown_pct"],
                sortino=risk["sortino"],
                calmar=risk["calmar"],
                history_months=hm,
            )
        )

    sharpes = [r.sharpe for r in rows]
    alphas = [r.ff5_alpha_pct for r in rows if not math.isnan(r.ff5_alpha_pct)]
    calmars = [x.calmar for x in rows]
    vols = [x.ann_vol_pct for x in rows]
    for r in rows:
        alpha_rank = pct_rank(alphas, r.ff5_alpha_pct) if not math.isnan(r.ff5_alpha_pct) else 0.0
        r.composite = (
            0.40 * pct_rank(sharpes, r.sharpe)
            + 0.30 * alpha_rank
            + 0.15 * pct_rank(calmars, r.calmar)
            + 0.15 * (1 - pct_rank(vols, r.ann_vol_pct))
        )

    ranked = sorted(rows, key=lambda r: (r.composite, r.sharpe), reverse=True)
    active = sorted([r for r in rows if r.bucket == "active_midcap"], key=lambda r: (r.composite, r.sharpe), reverse=True)
    momentum = sorted([r for r in rows if r.bucket == "momentum_index"], key=lambda r: (r.composite, r.sharpe), reverse=True)
    m150 = sorted([r for r in rows if r.bucket == "midcap150_index"], key=lambda r: (r.composite, r.sharpe), reverse=True)

    return {
        "as_of": datetime.now().strftime("%Y-%m-%d"),
        "benchmark": "NIFTY Midcap 150 Momentum 50 TRI (Tata/Edelweiss/Kotak index proxy, mfapi)",
        "factors": "Invespar FF5+Momentum (ff6)",
        "universe_size": len(rows),
        "discovered": len(universe),
        "top3_overall": [r.__dict__ for r in ranked[:3]],
        "top3_active_midcap": [r.__dict__ for r in active[:3]],
        "top3_momentum_index": [r.__dict__ for r in momentum[:3]],
        "top3_midcap150_index": [r.__dict__ for r in m150[:3]],
        "all_ranked": [r.__dict__ for r in ranked],
        "active_midcap_ranked": [r.__dict__ for r in active],
    }


if __name__ == "__main__":
    print(json.dumps(analyze(), indent=2))
