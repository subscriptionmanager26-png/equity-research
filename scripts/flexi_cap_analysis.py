#!/usr/bin/env python3
"""Flexi Cap MF screening: 3Y Sharpe + FF5 alpha (Invespar factors, MFAPI NAV)."""

import json
import time
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import statsmodels.api as sm
from indiafactorlibrary import IndiaFactorLibrary

MFAPI_BASE = "https://api.mfapi.in"
END_DATE = datetime(2026, 9, 28)
START_DATE = END_DATE - timedelta(days=3 * 365 + 30)  # ~3Y buffer

EXCLUDE_KEYWORDS = [
    "fund of funds",
    "fof",
    "passive fof",
    "index fund",
    "nifty500 flexicap quality",
]


def fetch_all_schemes() -> list[dict]:
    schemes, offset, limit = [], 0, 5000
    while True:
        r = requests.get(f"{MFAPI_BASE}/mf?limit={limit}&offset={offset}", timeout=120)
        batch = r.json()
        if not batch:
            break
        schemes.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return schemes


def is_flexi_direct_growth(name: str) -> bool:
    n = name.lower()
    if "flexi cap" not in n and "flexicap" not in n:
        return False
    if "direct" not in n:
        return False
    if "growth" not in n:
        return False
    bad = ["idcw", "dividend", "bonus", "payout", "weekly", "monthly", "quarterly"]
    if any(b in n for b in bad):
        return False
    if any(k in n for k in EXCLUDE_KEYWORDS):
        return False
    return True


def fetch_nav(scheme_code: int) -> pd.Series | None:
    start = START_DATE.strftime("%Y-%m-%d")
    end = END_DATE.strftime("%Y-%m-%d")
    url = f"{MFAPI_BASE}/mf/{scheme_code}?startDate={start}&endDate={end}"
    try:
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        payload = r.json()
    except Exception:
        return None
    rows = payload.get("data") or []
    if len(rows) < 200:
        return None
    records = []
    for row in rows:
        try:
            dt = datetime.strptime(row["date"], "%d-%m-%Y")
            nav = float(row["nav"])
            records.append((dt, nav))
        except (ValueError, KeyError, TypeError):
            continue
    if not records:
        return None
    s = pd.Series({pd.Timestamp(d): v for d, v in records}).sort_index()
    s = s[~s.index.duplicated(keep="last")]
    return s


def monthly_returns(nav: pd.Series) -> pd.Series:
    eom = nav.resample("ME").last().dropna()
    return eom.pct_change().dropna() * 100  # percentage points


def load_ff6_factors() -> pd.DataFrame:
    lib = IndiaFactorLibrary()
    ff6 = lib.read("ff6")[0].copy()
    ff6.index = pd.to_datetime(ff6.index)
    return ff6


def align_window(fund_ret: pd.Series, factors: pd.DataFrame) -> tuple[pd.Series, pd.DataFrame]:
    fund_m = fund_ret.copy()
    fund_m.index = fund_m.index.to_period("M").to_timestamp("M")
    factors_m = factors.copy()
    factors_m.index = factors_m.index.to_period("M").to_timestamp("M")
    common = fund_m.index.intersection(factors_m.index)
    # keep last ~36 months
    common = common.sort_values()
    if len(common) > 36:
        common = common[-36:]
    return fund_m.loc[common], factors_m.loc[common]


def sharpe_3y(fund_ret: pd.Series, rf: pd.Series) -> float | None:
    aligned_fund, aligned_rf = fund_ret.align(rf, join="inner")
    if len(aligned_fund) < 30:
        return None
    excess = aligned_fund - aligned_rf
    std = excess.std(ddof=1)
    if std == 0 or np.isnan(std):
        return None
    return float((excess.mean() / std) * np.sqrt(12))


def ff5_alpha(fund_ret: pd.Series, factors: pd.DataFrame) -> dict | None:
    fund, fac = align_window(fund_ret, factors)
    if len(fund) < 30:
        return None
    rf = fac["RF"]
    excess = fund - rf
    X = fac[["MF", "SMB5", "HML", "RMW", "CMA"]]
    X = sm.add_constant(X)
    model = sm.OLS(excess, X, missing="drop").fit()
    alpha_monthly = model.params.get("const", np.nan)
    return {
        "alpha_monthly_pct": float(alpha_monthly),
        "alpha_annual_pct": float(alpha_monthly * 12),
        "r_squared": float(model.rsquared),
        "n_months": int(len(fund)),
        "betas": {k: float(model.params[k]) for k in ["MF", "SMB5", "HML", "RMW", "CMA"]},
    }


def main():
    print("Fetching scheme list...")
    schemes = fetch_all_schemes()
    flexi = [s for s in schemes if is_flexi_direct_growth(s["schemeName"])]
    flexi = sorted(flexi, key=lambda x: x["schemeName"])
    print(f"Active flexi cap direct growth schemes: {len(flexi)}")

    print("Loading Invespar FF6 factors...")
    factors = load_ff6_factors()

    results = []
    for i, scheme in enumerate(flexi, 1):
        code = scheme["schemeCode"]
        name = scheme["schemeName"]
        print(f"[{i}/{len(flexi)}] {name[:60]}...")
        nav = fetch_nav(code)
        if nav is None:
            results.append({"scheme_code": code, "scheme_name": name, "status": "insufficient_nav"})
            time.sleep(0.15)
            continue
        mret = monthly_returns(nav)
        _, fac_win = align_window(mret, factors)
        rf = fac_win["RF"]
        sharpe = sharpe_3y(mret, factors["RF"])
        alpha_info = ff5_alpha(mret, factors)
        row = {
            "scheme_code": code,
            "scheme_name": name,
            "status": "ok" if sharpe is not None and alpha_info else "partial",
            "sharpe_3y": sharpe,
            "months_used": alpha_info["n_months"] if alpha_info else None,
        }
        if alpha_info:
            row.update(
                {
                    "alpha_annual_pct": alpha_info["alpha_annual_pct"],
                    "alpha_monthly_pct": alpha_info["alpha_monthly_pct"],
                    "r_squared": alpha_info["r_squared"],
                    **{f"beta_{k}": v for k, v in alpha_info["betas"].items()},
                }
            )
        results.append(row)
        time.sleep(0.12)

    df = pd.DataFrame(results)
    ok = df[df["sharpe_3y"].notna() & df["alpha_annual_pct"].notna()].copy()

    top_sharpe = ok.nlargest(5, "sharpe_3y")
    top_alpha = ok.nlargest(5, "alpha_annual_pct")

    out_dir = Path("/workspace/artifacts")
    out_dir.mkdir(parents=True, exist_ok=True)
    opt_dir = Path("/opt/cursor/artifacts")
    opt_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "as_of": END_DATE.strftime("%Y-%m-%d"),
        "methodology": {
            "nav_source": "MFAPI (api.mfapi.in)",
            "factor_source": "Invespar FF6 (Fama-French 5 + Momentum factors, indiafactorlibrary)",
            "window": "~36 months ending Sep 2026",
            "sharpe": "Annualized Sharpe = (mean monthly excess return / stdev) * sqrt(12); RF from Invespar",
            "alpha": "OLS: fund_excess = alpha + b*MF + b*SMB5 + b*HML + b*RMW + b*CMA; alpha annualized = 12 * monthly intercept",
            "exclusions": "FoF, index flexi-cap variants",
        },
        "universe_count": len(flexi),
        "analyzed_count": len(ok),
        "top5_sharpe_3y": top_sharpe.to_dict(orient="records"),
        "top5_ff5_alpha": top_alpha.to_dict(orient="records"),
        "all_results": ok.sort_values("sharpe_3y", ascending=False).to_dict(orient="records"),
    }

    json_path = out_dir / "flexi-cap-analysis.json"
    json_path.write_text(json.dumps(payload, indent=2))

    # markdown report
    lines = [
        "# Flexi Cap Mutual Funds — Sharpe (3Y) & FF5 Alpha Screen",
        "",
        f"**As of:** {END_DATE.strftime('%d %b %Y')}  ",
        f"**Universe:** {len(flexi)} Direct-Growth flexi cap schemes (excl. FoF/index variants)  ",
        f"**Successfully analyzed:** {len(ok)} schemes with ≥30 overlapping monthly observations",
        "",
        "## Methodology",
        "",
        "| Item | Source / Formula |",
        "|------|------------------|",
        "| NAV | [MFAPI](https://api.mfapi.in) — daily NAV, resampled to month-end |",
        "| Risk-free & factors | [Invespar FF6](https://invespar.com/research) via `indiafactorlibrary` |",
        "| 3Y window | Last ~36 calendar months aligned to factor dates |",
        "| Sharpe (3Y) | `(mean monthly excess ÷ σ monthly excess) × √12` |",
        "| FF5 Alpha | OLS on monthly excess returns vs MF, SMB5, HML, RMW, CMA (Invespar); intercept × 12 |",
        "",
        "> MF = market minus RF; SMB5/HML/RMW/CMA per Raju (2022) Indian FF5 methodology.",
        "",
        "## Top 5 by 3-Year Sharpe Ratio",
        "",
        "| Rank | Scheme | Sharpe (3Y) | Ann. FF5 α (%) | R² |",
        "|------|--------|-------------|----------------|-----|",
    ]
    for i, (_, r) in enumerate(top_sharpe.iterrows(), 1):
        lines.append(
            f"| {i} | {r['scheme_name']} | {r['sharpe_3y']:.3f} | {r['alpha_annual_pct']:.2f} | {r['r_squared']:.3f} |"
        )

    lines += [
        "",
        "## Top 5 by Fama-French 5-Factor Alpha (Annualized)",
        "",
        "| Rank | Scheme | Ann. FF5 α (%) | Sharpe (3Y) | R² |",
        "|------|--------|----------------|-------------|-----|",
    ]
    for i, (_, r) in enumerate(top_alpha.iterrows(), 1):
        lines.append(
            f"| {i} | {r['scheme_name']} | {r['alpha_annual_pct']:.2f} | {r['sharpe_3y']:.3f} | {r['r_squared']:.3f} |"
        )

    lines += [
        "",
        "## Notes",
        "",
        "- Alpha measures return unexplained by market, size, value, profitability, and investment factors.",
        "- High Sharpe ≠ high alpha: a fund can have strong risk-adjusted returns with modest factor alpha.",
        "- Past 3Y performance is not indicative of future results.",
        "- Direct-Growth plans only; IDCW/dividend options excluded.",
        "",
        "## Full Rankings (by Sharpe)",
        "",
        "| Scheme | Sharpe | α ann. (%) | β Mkt | β SMB5 | β HML | β RMW | β CMA |",
        "|--------|--------|------------|-------|--------|-------|-------|-------|",
    ]
    for _, r in ok.sort_values("sharpe_3y", ascending=False).iterrows():
        lines.append(
            f"| {r['scheme_name']} | {r['sharpe_3y']:.3f} | {r['alpha_annual_pct']:.2f} | "
            f"{r['beta_MF']:.2f} | {r['beta_SMB5']:.2f} | {r['beta_HML']:.2f} | "
            f"{r['beta_RMW']:.2f} | {r['beta_CMA']:.2f} |"
        )

    report = "\n".join(lines) + "\n"
    for p in [out_dir / "flexi-cap-report.md", opt_dir / "flexi-cap-report.md"]:
        p.write_text(report)

    print("\n=== TOP 5 SHARPE ===")
    print(top_sharpe[["scheme_name", "sharpe_3y", "alpha_annual_pct"]].to_string(index=False))
    print("\n=== TOP 5 ALPHA ===")
    print(top_alpha[["scheme_name", "alpha_annual_pct", "sharpe_3y"]].to_string(index=False))


if __name__ == "__main__":
    main()
