#!/usr/bin/env python3
"""Compare Nifty Midcap 150 Momentum 50 and related momentum funds (index + active)."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np
import pandas as pd
import requests
import statsmodels.api as sm
from indiafactorlibrary import IndiaFactorLibrary

MFAPI_BASE = "https://api.mfapi.in/mf"

# scheme_code -> (short name, category)
FUNDS: dict[int, tuple[str, str]] = {
    150738: ("Tata Nifty Midcap 150 Momentum 50 Index", "index"),
    150902: ("Edelweiss Nifty Midcap 150 Momentum 50 Index", "index"),
    152916: ("Kotak Nifty Midcap 150 Momentum 50 Index", "index"),
    154526: ("SBI Nifty Midcap 150 Momentum 50 ETF FoF", "fof"),
    153684: ("ICICI Pru Active Momentum", "active"),
    153364: ("Motilal Oswal Active Momentum", "active"),
    153083: ("Axis Momentum", "active"),
    152189: ("quant Momentum", "active"),
    153753: ("Kotak Active Momentum", "active"),
    154474: ("Mirae BSE Midcap 150 Momentum 30 FoF", "adjacent"),
    154377: ("Motilal Oswal BSE Midcap 150 Momentum 30 Index", "adjacent"),
    152645: ("Mirae MidSmallcap400 MQ 100 FoF", "adjacent"),
    153272: ("UTI MidSmallcap400 MQ 100 Index", "adjacent"),
    152985: ("Edelweiss Nifty500 Multicap MQ 50 Index", "adjacent"),
}

INDEX_BENCHMARK_CODES = {150738, 150902, 152916}
TER_ANNUAL = {
    150738: 0.0039,
    150902: 0.0045,
    152916: 0.0028,
    154526: 0.0025,
}
MIN_HISTORY_MONTHS = 11


@dataclass
class FundMetrics:
    scheme_code: int
    name: str
    category: str
    sharpe_window: str
    sharpe: float
    ann_return_pct: float
    ann_vol_pct: float
    ff5_alpha_ann_pct: float
    ff5_alpha_tstat: float
    ff5_r2: float
    bench_excess_pct: float
    bench_return_pct: float
    fund_return_pct: float
    tracking_error_ann_pct: float
    info_ratio: float
    history_months: float
    obs_months_ff: int
    composite_score: float = 0.0


def parse_mfapi_date(s: str) -> pd.Timestamp:
    return pd.to_datetime(s, format="%d-%m-%Y")


def fetch_nav_series(scheme_code: int) -> pd.Series:
    resp = requests.get(f"{MFAPI_BASE}/{scheme_code}", timeout=60)
    resp.raise_for_status()
    payload = resp.json()
    rows = payload["data"]
    dates = [parse_mfapi_date(r["date"]) for r in rows]
    navs = [float(r["nav"]) for r in rows]
    s = pd.Series(navs, index=pd.DatetimeIndex(dates), name="nav")
    s = s.sort_index()
    return s[~s.index.duplicated(keep="first")]


def load_ff6_monthly() -> pd.DataFrame:
    ff6 = IndiaFactorLibrary().read("ff6")
    monthly = ff6[0].copy()
    monthly.index = pd.to_datetime(monthly.index)
    return monthly.sort_index()


def monthly_returns(nav: pd.Series) -> pd.Series:
    return nav.resample("ME").last().dropna().pct_change().dropna()


def sharpe_ratio(
    daily_nav: pd.Series, rf_monthly: pd.Series, years: float
) -> tuple[float, str, float, float]:
    end = daily_nav.index.max()
    start = end - pd.DateOffset(years=int(years), months=int((years % 1) * 12))
    nav = daily_nav[daily_nav.index >= start]
    daily_ret = nav.pct_change().dropna()
    if len(daily_ret) < 200:
        years = 1.0
        start = end - pd.DateOffset(years=1)
        nav = daily_nav[daily_nav.index >= start]
        daily_ret = nav.pct_change().dropna()
        window = "1Y"
    else:
        window = f"{int(years)}Y" if years >= 1.5 else "1Y"

    rf_daily = rf_monthly.reindex(daily_ret.index, method="ffill") / 100.0 / 21.0
    rf_daily = rf_daily.fillna(rf_daily.mean())
    excess = daily_ret - rf_daily
    vol = daily_ret.std()
    if vol == 0 or np.isnan(vol):
        return float("nan"), window, float("nan"), float("nan")
    sharpe = (excess.mean() / vol) * math.sqrt(252)
    ann_return = ((1 + daily_ret.mean()) ** 252 - 1) * 100
    ann_vol = vol * math.sqrt(252) * 100
    return float(sharpe), window, float(ann_return), float(ann_vol)


def window_monthly(series: pd.Series, years: float) -> pd.Series:
    end = series.index.max()
    start = end - pd.DateOffset(years=int(years), months=int((years % 1) * 12))
    return series[series.index >= start]


def ff5_alpha(
    fund_monthly: pd.Series,
    factors: pd.DataFrame,
    years: float,
    min_months: int = 10,
) -> tuple[float, float, float, int]:
    fund = window_monthly(fund_monthly, years)
    aligned = pd.concat(
        [fund.rename("fund"), factors[["MF", "SMB5", "HML", "RMW", "CMA", "WML", "RF"]]],
        axis=1,
        join="inner",
    ).dropna()
    if len(aligned) < min_months:
        return float("nan"), float("nan"), float("nan"), len(aligned)

    y = aligned["fund"] - aligned["RF"] / 100.0
    x = aligned[["MF", "SMB5", "HML", "RMW", "CMA", "WML"]] / 100.0
    x = sm.add_constant(x)
    model = sm.OLS(y, x).fit()
    alpha_monthly = model.params["const"]
    alpha_ann = ((1 + alpha_monthly) ** 12 - 1) * 100
    return float(alpha_ann), float(model.tvalues["const"]), float(model.rsquared), len(aligned)


def fixed_tri_proxy(monthlies: dict[int, pd.Series], years: float) -> pd.Series:
    """NIFTY Midcap 150 Momentum 50 TRI proxy from index-fund panel."""
    peers = {c: monthlies[c] for c in INDEX_BENCHMARK_CODES if c in monthlies}
    end = max(s.index.max() for s in peers.values())
    start = end - pd.DateOffset(years=int(years), months=int((years % 1) * 12))
    panel = pd.DataFrame(peers).loc[lambda df: df.index >= start]
    median_ret = panel.median(axis=1, skipna=True)
    avg_ter = float(np.mean([TER_ANNUAL[c] for c in peers]))
    return (1.0 + median_ret) * (1.0 + avg_ter / 12.0) - 1.0


def benchmark_metrics(
    fund_monthly: pd.Series,
    bench_monthly: pd.Series,
    years: float,
) -> tuple[float, float, float, float]:
    fund = window_monthly(fund_monthly, years)
    bench = bench_monthly.reindex(fund.index)
    aligned = pd.concat([fund.rename("fund"), bench.rename("bench")], axis=1).dropna()
    if len(aligned) < 6:
        return float("nan"), float("nan"), float("nan"), float("nan")
    active = aligned["fund"] - aligned["bench"]
    fund_cum = (1 + aligned["fund"]).prod() - 1
    bench_cum = (1 + aligned["bench"]).prod() - 1
    total_excess_pct = (fund_cum - bench_cum) * 100
    te = active.std() * math.sqrt(12) * 100
    ir = (active.mean() * 12 * 100) / te if te > 0 else float("nan")
    return float(total_excess_pct), float(te), float(ir), float(bench_cum * 100)


def history_months(nav: pd.Series) -> float:
    return (nav.index.max() - nav.index.min()).days / 30.44


def percentile_rank(values: list[float], x: float) -> float:
    clean = [v for v in values if not math.isnan(v)]
    if not clean or math.isnan(x):
        return float("nan")
    below = sum(1 for v in clean if v < x)
    return below / len(clean)


def analyze() -> dict:
    factors = load_ff6_monthly()
    rf_monthly = factors["RF"]

    navs: dict[int, pd.Series] = {}
    monthlies: dict[int, pd.Series] = {}
    for code in FUNDS:
        nav = fetch_nav_series(code)
        navs[code] = nav
        monthlies[code] = monthly_returns(nav)

    results: list[FundMetrics] = []
    for code, (name, category) in FUNDS.items():
        nav = navs[code]
        months_hist = history_months(nav)
        fund_monthly = monthlies[code]
        sharpe_years = 2.0 if months_hist >= 24 else 1.0
        bench_monthly = fixed_tri_proxy(monthlies, sharpe_years)

        sharpe, window, ann_ret, ann_vol = sharpe_ratio(nav, rf_monthly, sharpe_years)
        alpha, tstat, r2, obs = ff5_alpha(fund_monthly, factors, sharpe_years)
        excess, te, ir, bench_ret = benchmark_metrics(fund_monthly, bench_monthly, sharpe_years)
        fund_window = window_monthly(fund_monthly, sharpe_years)
        fund_ret = ((1 + fund_window).prod() - 1) * 100 if len(fund_window) else float("nan")

        results.append(
            FundMetrics(
                scheme_code=code,
                name=name,
                category=category,
                sharpe_window=window,
                sharpe=sharpe,
                ann_return_pct=ann_ret,
                ann_vol_pct=ann_vol,
                ff5_alpha_ann_pct=alpha,
                ff5_alpha_tstat=tstat,
                ff5_r2=r2,
                bench_excess_pct=excess,
                bench_return_pct=bench_ret,
                fund_return_pct=fund_ret,
                tracking_error_ann_pct=te,
                info_ratio=ir,
                history_months=months_hist,
                obs_months_ff=obs,
            )
        )

    eligible = [r for r in results if r.history_months >= MIN_HISTORY_MONTHS and not math.isnan(r.sharpe)]
    sharpes = [r.sharpe for r in eligible]
    alphas = [r.ff5_alpha_ann_pct for r in eligible if not math.isnan(r.ff5_alpha_ann_pct)]
    for r in eligible:
        sr = percentile_rank(sharpes, r.sharpe)
        ar = percentile_rank(alphas, r.ff5_alpha_ann_pct) if not math.isnan(r.ff5_alpha_ann_pct) else 0.0
        r.composite_score = 0.55 * sr + 0.45 * ar

    eligible.sort(key=lambda r: (r.composite_score, r.sharpe, r.ff5_alpha_ann_pct), reverse=True)
    sharpe_ranked = sorted(eligible, key=lambda r: r.sharpe, reverse=True)
    alpha_ranked = sorted(
        [r for r in eligible if not math.isnan(r.ff5_alpha_ann_pct)],
        key=lambda r: r.ff5_alpha_ann_pct,
        reverse=True,
    )

    return {
        "as_of": datetime.now().strftime("%Y-%m-%d"),
        "benchmark": (
            "NIFTY Midcap 150 Momentum 50 TRI proxy: median monthly return of Tata/Edelweiss/Kotak "
            "index funds + TER gross-up (mfapi NAV). Same fixed benchmark applied to index and active funds."
        ),
        "factors_source": "Invespar FF5+Momentum (ff6) via indiafactorlibrary",
        "nav_source": "mfapi.in",
        "min_history_months": MIN_HISTORY_MONTHS,
        "funds": [r.__dict__ for r in results],
        "eligible_ranked": [r.__dict__ for r in eligible],
        "top3_composite": [r.__dict__ for r in eligible[:3]],
        "top3_sharpe": [r.__dict__ for r in sharpe_ranked[:3]],
        "top3_alpha": [r.__dict__ for r in alpha_ranked[:3]],
    }


if __name__ == "__main__":
    print(json.dumps(analyze(), indent=2))
