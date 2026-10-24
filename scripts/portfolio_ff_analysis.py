#!/usr/bin/env python3
"""Equal-weight 3-fund India index portfolio vs Nifty 500 — NAV (mfapi) + FF5 (Invespar)."""
from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from indiafactorlibrary import IndiaFactorLibrary

# Representative direct-growth index funds (same vintage ≈ common history from late 2019)
FUNDS = {
    "nifty50": {
        "code": 147794,
        "name": "Motilal Oswal Nifty 50 Index Fund - Direct Plan - Growth",
    },
    "nifty_next50": {
        "code": 147796,
        "name": "Motilal Oswal Nifty Next 50 Index Fund - Direct Plan - Growth",
    },
    "nifty_mid150": {
        "code": 147622,
        "name": "Motilal Oswal Nifty Midcap 150 Index Fund - Direct Plan - Growth",
    },
    "nifty500_bench": {
        "code": 147625,
        "name": "Motilal Oswal Nifty 500 Index Fund - Direct Plan - Growth",
    },
}

TRADING_DAYS = 252


def fetch_nav_series(scheme_code: int) -> pd.Series:
    url = f"https://api.mfapi.in/mf/{scheme_code}"
    with urllib.request.urlopen(url, timeout=120) as resp:
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


def daily_returns(nav: pd.Series) -> pd.Series:
    return nav.pct_change().dropna()


def align_daily_returns(series_map: dict[str, pd.Series]) -> pd.DataFrame:
    df = pd.DataFrame(series_map)
    return df.dropna(how="any")


def monthly_returns_from_daily(daily: pd.Series) -> pd.Series:
    nav = (1 + daily).cumprod()
    month_end_nav = nav.resample("ME").last()
    return month_end_nav.pct_change().dropna()


def load_ff_factors() -> pd.DataFrame:
    ifl = IndiaFactorLibrary()
    ds = ifl.read("ff6")
    factors = ds[0].copy()
    factors.index = pd.to_datetime(factors.index)
    # Invespar: percentage points per month
    for col in factors.columns:
        factors[col] = factors[col] / 100.0
    return factors


def max_drawdown(cum: pd.Series) -> float:
    peak = cum.cummax()
    dd = cum / peak - 1.0
    return float(dd.min())


def drawdown_series(cum: pd.Series) -> pd.Series:
    peak = cum.cummax()
    return cum / peak - 1.0


def period_slice(daily_rets: pd.Series, years: float | None) -> pd.Series:
    if years is None:
        return daily_rets
    end = daily_rets.index.max()
    start = end - pd.DateOffset(years=years)
    return daily_rets.loc[daily_rets.index >= start]


@dataclass
class Metrics:
    label: str
    window: str
    start: str
    end: str
    ann_return: float
    ann_vol: float
    sharpe: float
    max_dd: float
    calmar: float
    alpha_ann: float | None
    alpha_t: float | None
    betas: dict[str, float] | None


def sharpe_from_daily(daily: pd.Series, rf_monthly: pd.Series | None = None) -> tuple[float, float, float]:
    """Annualized return, vol, Sharpe using daily returns; RF from monthly series mapped to days."""
    if daily.empty:
        return float("nan"), float("nan"), float("nan")
    if rf_monthly is not None:
        # approximate daily RF from monthly average over window
        m = monthly_returns_from_daily(daily)
        common = m.index.intersection(rf_monthly.index)
        if len(common) > 6:
            avg_rf_m = rf_monthly.reindex(common).mean()
            rf_daily = (1 + avg_rf_m) ** (1 / 21) - 1
        else:
            rf_daily = 0.0
    else:
        rf_daily = 0.0
    excess = daily - rf_daily
    ann_ret = (1 + daily.mean()) ** TRADING_DAYS - 1
    ann_vol = daily.std() * np.sqrt(TRADING_DAYS)
    ann_excess = (1 + excess.mean()) ** TRADING_DAYS - 1
    sharpe = ann_excess / ann_vol if ann_vol > 0 else float("nan")
    return ann_ret, ann_vol, sharpe


def ff5_alpha_monthly(
    fund_monthly: pd.Series, factors: pd.DataFrame
) -> tuple[float, float, dict[str, float]]:
    """OLS: fund_excess ~ MKT + SMB5 + HML + RMW + CMA (no momentum). Returns monthly alpha, t-stat, betas."""
    rf = factors["RF"]
    y = fund_monthly - rf.reindex(fund_monthly.index)
    X = factors[["MKT", "SMB5", "HML", "RMW", "CMA"]].reindex(fund_monthly.index)
    data = pd.concat([y, X], axis=1).dropna()
    if len(data) < 24:
        return float("nan"), float("nan"), {}
    yv = data.iloc[:, 0].values
    Xv = np.column_stack([np.ones(len(data)), data.iloc[:, 1:].values])
    coef, residuals, rank, s = np.linalg.lstsq(Xv, yv, rcond=None)
    alpha_m = coef[0]
    betas = {
        "MKT": coef[1],
        "SMB5": coef[2],
        "HML": coef[3],
        "RMW": coef[4],
        "CMA": coef[5],
    }
    n, k = Xv.shape
    if n <= k:
        return alpha_m, float("nan"), betas
    y_hat = Xv @ coef
    rss = np.sum((yv - y_hat) ** 2)
    sigma2 = rss / (n - k)
    xtx_inv = np.linalg.inv(Xv.T @ Xv)
    se_alpha = np.sqrt(sigma2 * xtx_inv[0, 0])
    t_alpha = alpha_m / se_alpha if se_alpha > 0 else float("nan")
    return alpha_m, t_alpha, betas


def compute_metrics(
    label: str,
    daily: pd.Series,
    window: str,
    years: float | None,
    factors: pd.DataFrame,
) -> Metrics:
    sliced = period_slice(daily, years)
    if sliced.empty:
        return Metrics(label, window, "", "", np.nan, np.nan, np.nan, np.nan, np.nan, None, None, None)
    start = sliced.index.min().strftime("%Y-%m-%d")
    end = sliced.index.max().strftime("%Y-%m-%d")
    ann_ret, ann_vol, sharpe = sharpe_from_daily(sliced, factors["RF"])
    cum = (1 + sliced).cumprod()
    mdd = max_drawdown(cum)
    calmar = ann_ret / abs(mdd) if mdd < 0 else float("nan")
    mret = monthly_returns_from_daily(sliced)
    alpha_m, t_alpha, betas = ff5_alpha_monthly(mret, factors)
    alpha_ann = (1 + alpha_m) ** 12 - 1 if not np.isnan(alpha_m) else float("nan")
    return Metrics(
        label,
        window,
        start,
        end,
        ann_ret,
        ann_vol,
        sharpe,
        mdd,
        calmar,
        alpha_ann,
        t_alpha,
        betas,
    )


def main() -> None:
    navs = {k: fetch_nav_series(v["code"]) for k, v in FUNDS.items()}
    daily_map = {k: daily_returns(v) for k, v in navs.items()}
    aligned = align_daily_returns(daily_map)
    portfolio_daily = aligned[["nifty50", "nifty_next50", "nifty_mid150"]].mean(axis=1)
    portfolio_daily.name = "portfolio_ew"
    bench_daily = aligned["nifty500_bench"]
    bench_daily.name = "nifty500"

    factors = load_ff_factors()

    windows = [
        ("3Y", 3.0),
        ("5Y", 5.0),
        ("Full common", None),
    ]

    results: list[Metrics] = []
    for wname, yrs in windows:
        results.append(compute_metrics("Equal-weight 3-index portfolio", portfolio_daily, wname, yrs, factors))
        results.append(compute_metrics("Nifty 500 index fund (benchmark)", bench_daily, wname, yrs, factors))

    # CAGR full period
    full_port = period_slice(portfolio_daily, None)
    full_bench = period_slice(bench_daily, None)
    years_span = (full_port.index.max() - full_port.index.min()).days / 365.25
    port_cagr = (1 + full_port).prod() ** (1 / years_span) - 1
    bench_cagr = (1 + full_bench).prod() ** (1 / years_span) - 1

    # Correlation
    corr = full_port.corr(full_bench)

    out = {
        "as_of": navs["nifty50"].index.max().strftime("%Y-%m-%d"),
        "funds": FUNDS,
        "common_history_start": aligned.index.min().strftime("%Y-%m-%d"),
        "common_history_end": aligned.index.max().strftime("%Y-%m-%d"),
        "common_trading_days": len(aligned),
        "cagr_common_period": {"portfolio": port_cagr, "nifty500": bench_cagr, "years": years_span},
        "daily_correlation": corr,
        "metrics": [m.__dict__ for m in results],
    }

    # Save working JSON
    out_path = Path.home() / "research/india-index-portfolio/sources/analysis_output.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2))

    # Human-readable summary for report builder
    lines = []
    lines.append(f"Common aligned NAV window: {out['common_history_start']} to {out['common_history_end']} ({out['common_trading_days']} days)")
    lines.append(f"CAGR (common period): Portfolio {port_cagr*100:.2f}% vs Nifty500 fund {bench_cagr*100:.2f}% over {years_span:.2f}y")
    lines.append(f"Daily return correlation (full): {corr:.3f}")
    lines.append("")
    for m in results:
        lines.append(
            f"{m.label} | {m.window} | {m.start}..{m.end} | "
            f"AnnRet {m.ann_return*100:.2f}% Vol {m.ann_vol*100:.2f}% Sharpe {m.sharpe:.2f} "
            f"MaxDD {m.max_dd*100:.2f}% FF5 α(ann) {m.alpha_ann*100 if m.alpha_ann is not None else float('nan'):.2f}% (t={m.alpha_t:.2f})"
        )
    summary_path = Path.home() / "research/india-index-portfolio/sources/summary.txt"
    summary_path.write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
