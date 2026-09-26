#!/usr/bin/env python3
"""Six-portfolio SIP comparison vs Nifty 50 / Nifty 500 index funds."""

from __future__ import annotations

import json
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import requests

MFAPI = "https://api.mfapi.in/mf"
SIP_AMOUNT = 1000
RISK_FREE_ANNUAL = 0.065

NIFTY50 = (120716, "UTI Nifty 50 Index Fund - Direct Plan - Growth")
NIFTY500 = (147625, "Motilal Oswal Nifty 500 Index Fund - Direct Plan - Growth")

WORKSPACE = Path("/workspace")
RESEARCH = Path.home() / "research" / "SIP_PORTFOLIO_COMPARISON"
OUTPUT_JSON = RESEARCH / "sip_analysis_results.json"

# scheme_category regex -> portfolio bucket (first match wins in scan order)
CATEGORY_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("healthcare", re.compile(r"healthcare|pharma", re.I)),
    ("financial_services", re.compile(r"financial services|banking & financial|banking and financial", re.I)),
    ("flexi_cap", re.compile(r"flexi cap", re.I)),
    ("mid_cap", re.compile(r"mid cap fund|midcap fund", re.I)),
    ("small_cap", re.compile(r"small cap fund|smallcap fund", re.I)),
    ("multi_asset", re.compile(r"multi asset allocation", re.I)),
    ("focused", re.compile(r"focused fund|focused equity", re.I)),
]

EXCLUDE_NAME = re.compile(
    r"IDCW|Regular|Bonus|Weekly|Daily|Monthly|Quarterly|Half Yearly|Annual|Index Fund|FoF|Fund of Fund|Sahara|JPMorgan|BNP Paribas|Baroda |L&T |Reliance |Principal ",
    re.I,
)
EXCLUDE_CATEGORY = re.compile(r"index fund|etf|fof|fund of funds", re.I)


@dataclass
class FundPick:
    bucket: str
    scheme_code: int
    scheme_name: str
    scheme_category: str
    inception: pd.Timestamp


@dataclass
class SipMetrics:
    label: str
    tag: str
    constituents: list[dict]
    sip_start: str
    sip_end: str
    months: int
    total_invested: float
    final_value: float
    absolute_gain: float
    xirr_pct: float
    ann_vol_pct: float
    sharpe: float
    max_drawdown_pct: float


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


def fetch_nav_and_meta(scheme_code: int) -> tuple[pd.Series, dict]:
    resp = requests.get(f"{MFAPI}/{scheme_code}", timeout=60)
    resp.raise_for_status()
    payload = resp.json()
    meta = payload.get("meta") or {}
    rows = payload.get("data") or []
    if not rows:
        return pd.Series(dtype=float), meta
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"], format="%d-%m-%Y", errors="coerce")
    df["nav"] = pd.to_numeric(df["nav"], errors="coerce")
    df = df.dropna(subset=["date", "nav"]).sort_values("date")
    s = df.set_index("date")["nav"]
    s = s[~s.index.duplicated(keep="last")]
    return s, meta


def nav_is_active(nav: pd.Series, ref_date: pd.Timestamp, max_stale_days: int = 120) -> bool:
    if nav.empty:
        return False
    return (ref_date - nav.index.max()).days <= max_stale_days


def is_direct_growth(name: str) -> bool:
    return "Direct" in name and ("Growth" in name or "GROWTH" in name)


def classify_category(scheme_category: str, scheme_name: str) -> str | None:
    text = f"{scheme_category} {scheme_name}"
    if EXCLUDE_CATEGORY.search(scheme_category or ""):
        return None
    cat = scheme_category or ""
    for bucket, pattern in CATEGORY_RULES:
        if not pattern.search(text):
            continue
        if bucket == "financial_services":
            if not re.search(r"sectoral|thematic|equity.*financial|financial services", cat, re.I):
                if not re.search(r"banking & financial services|financial services fund", scheme_name, re.I):
                    return None
            if re.search(r"bond|debt|sdl|cpse|crisil|ibx", text, re.I):
                return None
        if bucket == "healthcare":
            if re.search(r"index fund|index", text, re.I) and "healthcare" in text.lower():
                return None
        if bucket == "mid_cap" and re.search(r"large.?&.?mid|large and mid", text, re.I):
            return None
        if bucket == "small_cap" and re.search(r"mid.?and.?small|mid and small", text, re.I):
            return None
        return bucket
    return None


def pick_longest_running(schemes: list[dict]) -> tuple[dict[str, FundPick], dict[int, pd.Series]]:
    direct = [
        s
        for s in schemes
        if is_direct_growth(s["schemeName"]) and not EXCLUDE_NAME.search(s["schemeName"])
    ]
    name_hints = re.compile(
        r"health|pharma|financial|banking|flexi cap|mid cap|small cap|multi asset|focused",
        re.I,
    )
    candidates = [s for s in direct if name_hints.search(s["schemeName"])]
    print(f"Fetching meta for {len(candidates)} candidate schemes...")

    # reference date from benchmark
    n50_nav, _ = fetch_nav_and_meta(NIFTY50[0])
    ref_date = n50_nav.index.max()

    best: dict[str, FundPick] = {}
    nav_cache: dict[int, pd.Series] = {NIFTY50[0]: n50_nav}

    def process(scheme: dict) -> tuple[str, FundPick | None, pd.Series | None]:
        code = scheme["schemeCode"]
        nav, meta = fetch_nav_and_meta(code)
        if nav.empty or not nav_is_active(nav, ref_date):
            return "", None, None
        bucket = classify_category(meta.get("scheme_category", ""), meta.get("scheme_name", scheme["schemeName"]))
        if not bucket:
            return "", None, None
        pick = FundPick(
            bucket=bucket,
            scheme_code=code,
            scheme_name=meta.get("scheme_name", scheme["schemeName"]),
            scheme_category=meta.get("scheme_category", ""),
            inception=nav.index.min(),
        )
        return bucket, pick, nav

    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = [ex.submit(process, s) for s in candidates]
        for fut in as_completed(futures):
            bucket, pick, nav = fut.result()
            if not pick:
                continue
            nav_cache[pick.scheme_code] = nav
            cur = best.get(bucket)
            if cur is None or pick.inception < cur.inception:
                best[bucket] = pick
            time.sleep(0.02)

    return best, nav_cache


def month_range(start: pd.Timestamp, end: pd.Timestamp) -> pd.DatetimeIndex:
    start_m = start.to_period("M").to_timestamp("M")
    end_m = end.to_period("M").to_timestamp("M")
    return pd.date_range(start_m, end_m, freq="ME")


def simulate_sip(
    nav: pd.Series,
    sip_dates: pd.DatetimeIndex,
    amount_per_date: float | pd.Series,
) -> tuple[pd.Series, pd.DataFrame]:
    nav = nav.sort_index()
    if isinstance(amount_per_date, (int, float)):
        amounts = pd.Series(float(amount_per_date), index=sip_dates)
    else:
        amounts = amount_per_date.reindex(sip_dates).fillna(0)

    rows = []
    for dt in sip_dates:
        amt = float(amounts.loc[dt])
        if amt <= 0:
            continue
        avail = nav.loc[:dt]
        if avail.empty:
            continue
        price = float(avail.iloc[-1])
        rows.append({"date": dt, "amount": amt, "nav": price, "units": amt / price})

    if not rows:
        return pd.Series(dtype=float), pd.DataFrame()

    tx = pd.DataFrame(rows)
    tx["cum_units"] = tx["units"].cumsum()
    tx["cum_invested"] = tx["amount"].cumsum()
    tx = tx.set_index("date")

    daily_nav = nav.loc[tx.index.min() : nav.index.max()]
    unit_series = pd.Series(0.0, index=daily_nav.index)
    for dt, row in tx.iterrows():
        unit_series.loc[dt:] = row["cum_units"]
    values = daily_nav * unit_series
    values.name = "portfolio_value"
    return values, tx


def simulate_equal_weight_sip(
    nav_a: pd.Series,
    nav_b: pd.Series,
    sip_dates: pd.DatetimeIndex,
    total_amount: float,
) -> tuple[pd.Series, pd.DataFrame, list[dict]]:
    half = total_amount / 2
    va, txa = simulate_sip(nav_a, sip_dates, half)
    vb, txb = simulate_sip(nav_b, sip_dates, half)
    if va.empty or vb.empty:
        return pd.Series(dtype=float), pd.DataFrame(), []
    combined = va.add(vb, fill_value=0).sort_index()
    combined.name = "portfolio_value"
    tx = pd.concat([txa.assign(fund="A"), txb.assign(fund="B")])
    return combined, tx, [{"weight": 0.5}, {"weight": 0.5}]


def xirr(cashflows: list[tuple[pd.Timestamp, float]]) -> float:
    if len(cashflows) < 2:
        return float("nan")
    dates = [cf[0] for cf in cashflows]
    amounts = [cf[1] for cf in cashflows]
    t0 = dates[0]
    days = np.array([(d - t0).days for d in dates], dtype=float)

    def npv(rate: float) -> float:
        if rate <= -0.999999:
            return float("inf")
        return sum(a / ((1 + rate) ** (d / 365.25)) for a, d in zip(amounts, days))

    lo, hi = -0.9, 5.0
    f_lo, f_hi = npv(lo), npv(hi)
    if math.isnan(f_lo) or math.isnan(f_hi) or f_lo * f_hi > 0:
        # fallback grid search
        best_r, best_abs = 0.0, float("inf")
        for r in np.linspace(-0.5, 1.5, 4000):
            v = abs(npv(r))
            if v < best_abs:
                best_abs, best_r = v, r
        return best_r * 100
    for _ in range(200):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return ((lo + hi) / 2) * 100


def portfolio_xirr(tx: pd.DataFrame, final_value: float, end_date: pd.Timestamp) -> float:
    flows: list[tuple[pd.Timestamp, float]] = []
    for dt, row in tx.iterrows():
        flows.append((pd.Timestamp(dt), -float(row["amount"])))
    flows.append((pd.Timestamp(end_date), final_value))
    return xirr(flows)


def monthly_returns(values: pd.Series, tx: pd.DataFrame | None = None) -> pd.Series:
    month_end_val = values.resample("ME").last().dropna()
    if tx is None or tx.empty:
        return month_end_val.pct_change().dropna()
    monthly_contrib = tx["amount"].groupby(tx.index.to_period("M")).sum()
    monthly_contrib.index = monthly_contrib.index.to_timestamp("M")
    prev = month_end_val.shift(1)
    contrib = monthly_contrib.reindex(month_end_val.index, fill_value=0)
    ret = (month_end_val - prev - contrib) / prev
    return ret.dropna()


def annualized_vol(monthly: pd.Series) -> float:
    if len(monthly) < 2:
        return float("nan")
    return float(monthly.std(ddof=1) * math.sqrt(12) * 100)


def sharpe_ratio(monthly: pd.Series, rf_annual: float = RISK_FREE_ANNUAL) -> float:
    if len(monthly) < 6:
        return float("nan")
    rf_m = (1 + rf_annual) ** (1 / 12) - 1
    excess = monthly - rf_m
    vol = excess.std(ddof=1)
    if vol == 0 or np.isnan(vol):
        return float("nan")
    return float((excess.mean() / vol) * math.sqrt(12))


def max_drawdown(values: pd.Series) -> float:
    if values.empty:
        return float("nan")
    dd = values / values.cummax() - 1
    return float(dd.min() * 100)


def compute_sip_metrics(
    label: str,
    tag: str,
    values: pd.Series,
    tx: pd.DataFrame,
    constituents: list[dict],
    sip_start: pd.Timestamp,
    sip_end: pd.Timestamp,
) -> SipMetrics:
    final_value = float(values.iloc[-1]) if not values.empty else 0.0
    total_invested = float(tx["amount"].sum()) if not tx.empty else 0.0
    mret = monthly_returns(values, tx)
    xr = portfolio_xirr(tx, final_value, values.index.max()) if not tx.empty else float("nan")
    return SipMetrics(
        label=label,
        tag=tag,
        constituents=constituents,
        sip_start=sip_start.strftime("%d-%b-%Y"),
        sip_end=sip_end.strftime("%d-%b-%Y"),
        months=len(tx),
        total_invested=round(total_invested, 2),
        final_value=round(final_value, 2),
        absolute_gain=round(final_value - total_invested, 2),
        xirr_pct=round(xr, 2),
        ann_vol_pct=round(annualized_vol(mret), 2),
        sharpe=round(sharpe_ratio(mret), 3),
        max_drawdown_pct=round(max_drawdown(values), 2),
    )


def build_portfolios(picks: dict[str, FundPick], nav_cache: dict[int, pd.Series]) -> tuple[dict, pd.Timestamp]:
    required = ["healthcare", "financial_services", "flexi_cap", "mid_cap", "small_cap", "multi_asset", "focused"]
    missing = [b for b in required if b not in picks]
    if missing:
        raise RuntimeError(f"Missing buckets: {missing}. Found: {list(picks)}")

    # common SIP window: start when ALL portfolios can run (latest constituent inception), end at latest NAV
    all_codes = [p.scheme_code for p in picks.values()] + [NIFTY50[0], NIFTY500[0]]
    inceptions = [nav_cache[c].index.min() for c in all_codes if c in nav_cache and not nav_cache[c].empty]
    ends = [nav_cache[c].index.max() for c in all_codes if c in nav_cache and not nav_cache[c].empty]
    common_start = max(inceptions)
    common_end = min(ends)
    # use month-ends only where every fund has a NAV on/before that date
    sip_dates = month_range(common_start, common_end)
    print(f"Common SIP window: {common_start.date()} to {common_end.date()} ({len(sip_dates)} months)")

    hc = picks["healthcare"]
    fin = picks["financial_services"]
    portfolios = {}

    # Portfolio 1: equal-weight healthcare + financial services
    v1a, tx1a = simulate_sip(nav_cache[hc.scheme_code], sip_dates, SIP_AMOUNT / 2)
    v1b, tx1b = simulate_sip(nav_cache[fin.scheme_code], sip_dates, SIP_AMOUNT / 2)
    v1 = v1a.add(v1b, fill_value=0).sort_index()
    tx1 = pd.concat([tx1a.assign(fund="healthcare"), tx1b.assign(fund="financial")])
    portfolios["P1"] = compute_sip_metrics(
        "Portfolio 1 — Equal-weight Healthcare + Financial Services",
        "P1",
        v1,
        tx1,
        [
            {"scheme_code": hc.scheme_code, "name": hc.scheme_name, "weight": 0.5, "inception": hc.inception.strftime("%d-%b-%Y")},
            {"scheme_code": fin.scheme_code, "name": fin.scheme_name, "weight": 0.5, "inception": fin.inception.strftime("%d-%b-%Y")},
        ],
        common_start,
        common_end,
    )

    singles = [
        ("P2", "Portfolio 2 — Flexi Cap", "flexi_cap"),
        ("P3", "Portfolio 3 — Mid Cap", "mid_cap"),
        ("P4", "Portfolio 4 — Small Cap", "small_cap"),
        ("P5", "Portfolio 5 — Multi Asset Allocation", "multi_asset"),
        ("P6", "Portfolio 6 — Focused", "focused"),
    ]
    for tag, label, bucket in singles:
        pick = picks[bucket]
        v, tx = simulate_sip(nav_cache[pick.scheme_code], sip_dates, SIP_AMOUNT)
        portfolios[tag] = compute_sip_metrics(
            label,
            tag,
            v,
            tx,
            [{"scheme_code": pick.scheme_code, "name": pick.scheme_name, "weight": 1.0, "inception": pick.inception.strftime("%d-%b-%Y")}],
            common_start,
            common_end,
        )

    benchmarks = {}
    for tag, (code, name) in [("B50", NIFTY50), ("B500", NIFTY500)]:
        v, tx = simulate_sip(nav_cache[code], sip_dates, SIP_AMOUNT)
        benchmarks[tag] = compute_sip_metrics(
            f"Benchmark — {name}",
            tag,
            v,
            tx,
            [{"scheme_code": code, "name": name, "weight": 1.0}],
            common_start,
            common_end,
        )

    return {"portfolios": portfolios, "benchmarks": benchmarks, "picks": picks}, common_start


def metrics_to_dict(m: SipMetrics) -> dict:
    return m.__dict__


def build_markdown(results: dict) -> str:
    picks: dict[str, FundPick] = results["picks"]
    portfolios = results["portfolios"]
    benchmarks = results["benchmarks"]
    common_start = results["common_start"]

    lines = [
        "# Six-Portfolio SIP Comparison (₹1,000/month)",
        "",
        f"**As of:** {datetime.now().strftime('%d %b %Y')}  ",
        f"**SIP amount:** ₹{SIP_AMOUNT:,}/month per portfolio  ",
        f"**Common SIP window:** {common_start.strftime('%d-%b-%Y')} onwards (aligned to latest fund inception among all picks + benchmarks)  ",
        "**Data:** NAV from [mfapi.in](https://www.mfapi.in)  ",
        "",
        "## Fund selections (longest-running Direct Growth)",
        "",
        "| Tag | Portfolio | Fund | AMFI Category | Inception |",
        "|:---:|---|---|---|---|",
    ]

    tag_map = {
        "healthcare": ("P1-A", "Healthcare leg (50%)"),
        "financial_services": ("P1-B", "Financial Services leg (50%)"),
        "flexi_cap": ("P2", "Portfolio 2 — Flexi Cap"),
        "mid_cap": ("P3", "Portfolio 3 — Mid Cap"),
        "small_cap": ("P4", "Portfolio 4 — Small Cap"),
        "multi_asset": ("P5", "Portfolio 5 — Multi Asset Allocation"),
        "focused": ("P6", "Portfolio 6 — Focused"),
    }
    for bucket, pick in sorted(picks.items(), key=lambda x: tag_map[x[0]][0]):
        tag, desc = tag_map[bucket]
        short = pick.scheme_name.replace(" - Direct Plan - Growth Option", "").replace(" - Direct Plan - Growth", "")
        lines.append(f"| **{tag}** | {desc} | {short} | {pick.scheme_category} | {pick.inception.strftime('%d-%b-%Y')} |")

    lines.extend(
        [
            "",
            "> **Portfolio 1** invests ₹500/month in each of the healthcare and financial services funds (equal-weighted).",
            "",
            "## Results vs benchmarks",
            "",
            "| Tag | Portfolio / Benchmark | XIRR | Sharpe | Vol (ann.) | Max DD | Invested | Final Value | Gain |",
            "|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|",
        ]
    )

    ordered = ["P1", "P2", "P3", "P4", "P5", "P6", "B50", "B500"]
    all_metrics = {**portfolios, **benchmarks}
    for tag in ordered:
        m = all_metrics[tag]
        name = m.label.replace("Portfolio ", "P").split("—")[-1].strip() if tag.startswith("P") else m.label
        if tag.startswith("P"):
            name = m.label.split("—", 1)[-1].strip()
        lines.append(
            f"| **{tag}** | {name} | {m.xirr_pct}% | {m.sharpe} | {m.ann_vol_pct}% | {m.max_drawdown_pct}% | ₹{m.total_invested:,.0f} | ₹{m.final_value:,.0f} | ₹{m.absolute_gain:,.0f} |"
        )

    lines.extend(["", "## Beat / trail vs benchmark SIP (XIRR)", ""])
    b50 = benchmarks["B50"].xirr_pct
    b500 = benchmarks["B500"].xirr_pct
    lines.append("| Tag | XIRR | vs Nifty 50 SIP | vs Nifty 500 SIP |")
    lines.append("|:---:|---:|:---:|:---:|")
    for tag in ["P1", "P2", "P3", "P4", "P5", "P6"]:
        m = portfolios[tag]
        d50 = round(m.xirr_pct - b50, 2)
        d500 = round(m.xirr_pct - b500, 2)
        lines.append(
            f"| **{tag}** | {m.xirr_pct}% | {'+' if d50>=0 else ''}{d50} pp ({'beats' if d50>=0 else 'trails'}) | {'+' if d500>=0 else ''}{d500} pp ({'beats' if d500>=0 else 'trails'}) |"
        )

    lines.extend(
        [
            "",
            "## Methodology",
            "",
            "- **Longest-running fund:** earliest NAV date among Direct Growth schemes in each SEBI category (ex-index/FoF/IDCW).",
            "- **SIP simulation:** ₹1,000 invested on each month-end using last available NAV on/before that date.",
            "- **XIRR:** internal rate of return on monthly −₹1,000 cashflows and terminal portfolio value.",
            "- **Sharpe / Vol / Max DD:** computed on month-end portfolio value series; Sharpe uses 6.5% annual risk-free.",
            "- **Benchmarks:** UTI Nifty 50 Index Fund (Direct Growth) and Motilal Oswal Nifty 500 Index Fund (Direct Growth), same SIP dates/amount.",
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
    picks, nav_cache = pick_longest_running(schemes)

    # ensure benchmark NAV loaded
    for code, _ in [NIFTY50, NIFTY500]:
        if code not in nav_cache:
            nav_cache[code], _ = fetch_nav_and_meta(code)

    print("\nSelected funds:")
    for bucket, pick in sorted(picks.items()):
        print(f"  {bucket}: {pick.scheme_name} ({pick.inception.date()})")

    results_data, common_start = build_portfolios(picks, nav_cache)
    results = {
        "as_of": datetime.now().strftime("%Y-%m-%d"),
        "sip_amount": SIP_AMOUNT,
        "common_start": common_start.strftime("%Y-%m-%d"),
        "picks": {k: v.__dict__ | {"inception": v.inception.strftime("%Y-%m-%d")} for k, v in picks.items()},
        "portfolios": {k: metrics_to_dict(v) for k, v in results_data["portfolios"].items()},
        "benchmarks": {k: metrics_to_dict(v) for k, v in results_data["benchmarks"].items()},
    }
    for k, v in results["picks"].items():
        v["inception"] = str(v["inception"])

    OUTPUT_JSON.write_text(json.dumps(results, indent=2, default=str))
    md = build_markdown({**results_data, "common_start": common_start})
    for path in [
        WORKSPACE / "artifacts" / "sip-portfolio-comparison-report.md",
        Path("/opt/cursor/artifacts/sip-portfolio-comparison-report.md"),
    ]:
        path.write_text(md)

    print("\nDone. Tags: P1–P6, B50, B500")


if __name__ == "__main__":
    main()
